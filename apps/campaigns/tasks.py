"""Campaigns Celery tasks — fan-out and dispatch."""

from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.campaigns.models import BroadcastEvent, MessageTask
from apps.campaigns.services import create_broadcast_event
from apps.scraper.models import ScrapedArticle

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.campaigns.tasks.fan_out_broadcast",
    max_retries=1,
    default_retry_delay=30,
    acks_late=True,
)
def fan_out_broadcast(self, article_pk: int) -> str:  # noqa: ANN001
    """Create a broadcast event and enqueue individual send tasks.

    Called by the scraper when new content is detected.
    """
    try:
        article = ScrapedArticle.objects.get(pk=article_pk)
    except ScrapedArticle.DoesNotExist:
        logger.error("Article pk=%d not found — aborting broadcast.", article_pk)
        return f"Article pk={article_pk} not found"

    broadcast = create_broadcast_event(article)

    task_pks = list(broadcast.message_tasks.values_list("pk", flat=True))
    batch_size = getattr(settings, "AUTOMATION_BATCH_SIZE", 50)
    batch_cooldown = getattr(settings, "AUTOMATION_BATCH_COOLDOWN", 900)

    for index, task_pk in enumerate(task_pks):
        batch_number = index // batch_size
        delay_seconds = batch_number * batch_cooldown
        dispatch_message.apply_async(args=[task_pk], countdown=delay_seconds)

    return (
        f"Broadcast #{broadcast.pk} — "
        f"{broadcast.total_groups} send tasks enqueued "
        f"in {(len(task_pks) - 1) // batch_size + 1} batch(es)."
    )


@shared_task(
    bind=True,
    name="apps.campaigns.tasks.dispatch_message",
    max_retries=2,
    default_retry_delay=120,
    acks_late=True,
)
def dispatch_message(self, message_task_pk: int) -> str:  # noqa: ANN001
    """Pick up a single MessageTask, send it, and record the result."""
    try:
        msg_task = MessageTask.objects.select_related(
            "group", "broadcast__article"
        ).get(pk=message_task_pk)
    except MessageTask.DoesNotExist:
        logger.error("MessageTask pk=%d vanished.", message_task_pk)
        return f"MessageTask pk={message_task_pk} not found"

    msg_task.status = MessageTask.Status.SENDING
    msg_task.save(update_fields=["status"])

    message_body = _compose_message(msg_task.broadcast.article)

    try:
        from apps.automation.services import send_message_to_group

        success = send_message_to_group(
            group_jid=msg_task.group.group_jid,
            message=message_body,
        )
    except Exception as exc:
        logger.error(
            "Send failed for MessageTask pk=%d: %s",
            message_task_pk,
            exc,
            exc_info=True,
        )
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            _mark_failed(msg_task, str(exc))
            return f"Permanently failed for {msg_task.group.name}"

    if success:
        _mark_sent(msg_task)
        return f"Sent to {msg_task.group.name}"

    _mark_failed(msg_task, "send_message_to_group returned False")
    return f"Send failed for {msg_task.group.name}"


def _compose_message(article: ScrapedArticle) -> str:
    """Build the message text from the scraped article.

    If the body already contains a formatted message (from a site-specific
    parser), use it directly. Otherwise fall back to a simple format.
    """
    if article.body and article.body.startswith("🔶"):
        return article.body

    title = article.title or "New Article"
    return f"📰 *{title}*\n\n{article.url}"


def _mark_sent(msg_task: MessageTask) -> None:
    """Record a successful send."""
    msg_task.status = MessageTask.Status.SENT
    msg_task.sent_at = timezone.now()
    msg_task.save(update_fields=["status", "sent_at"])
    _update_broadcast_counters(msg_task.broadcast, success=True)


def _mark_failed(msg_task: MessageTask, error: str) -> None:
    """Record a failed send."""
    msg_task.status = MessageTask.Status.FAILED
    msg_task.error_message = error[:2000]
    msg_task.save(update_fields=["status", "error_message"])
    _update_broadcast_counters(msg_task.broadcast, success=False)


def _update_broadcast_counters(broadcast: BroadcastEvent, *, success: bool) -> None:
    """Atomically bump sent/failed counters on the parent broadcast."""
    from django.db.models import F

    if success:
        BroadcastEvent.objects.filter(pk=broadcast.pk).update(
            sent_count=F("sent_count") + 1
        )
    else:
        BroadcastEvent.objects.filter(pk=broadcast.pk).update(
            failed_count=F("failed_count") + 1
        )

    broadcast.refresh_from_db()
    if broadcast.sent_count + broadcast.failed_count >= broadcast.total_groups:
        broadcast.status = BroadcastEvent.Status.COMPLETED
        broadcast.completed_at = timezone.now()
        broadcast.save(update_fields=["status", "completed_at"])
        logger.info("Broadcast #%d completed.", broadcast.pk)
