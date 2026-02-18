"""Campaigns Celery tasks — fan-out, dispatch, and retry."""

from __future__ import annotations

import logging
import os
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.campaigns.attempt_tracker import (
    classify_error,
    record_attempt_failure,
    record_attempt_start,
    record_attempt_success,
)
from apps.campaigns.models import BroadcastEvent, ErrorCategory, MessageTask
from apps.campaigns.services import create_broadcast_event
from apps.scraper.models import ScrapedArticle
from utils.config import get_config

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

    # Idempotency guard — prevents duplicate broadcasts if the task is retried.
    existing = (
        BroadcastEvent.objects.filter(article=article)
        .exclude(status=BroadcastEvent.Status.FAILED)
        .first()
    )
    if existing:
        logger.info(
            "Broadcast for article pk=%d already exists (#%d) — skipping.",
            article_pk,
            existing.pk,
        )
        return f"Broadcast #{existing.pk} already exists for article pk={article_pk}"

    broadcast = create_broadcast_event(article)

    task_pks = list(broadcast.message_tasks.values_list("pk", flat=True))
    batch_size = getattr(settings, "AUTOMATION_BATCH_SIZE", 50)
    batch_cooldown = getattr(settings, "AUTOMATION_BATCH_COOLDOWN", 900)
    worker_count = min(int(get_config("AUTOMATION_WORKER_COUNT", int)), 4)
    worker_stagger = int(get_config("AUTOMATION_WORKER_STAGGER", int))

    for index, task_pk in enumerate(task_pks):
        worker_idx = index % worker_count
        queue_name = f"wa-worker-{worker_idx}"
        worker_local_index = index // worker_count
        batch_number = worker_local_index // batch_size
        batch_delay = batch_number * batch_cooldown
        stagger_delay = worker_idx * worker_stagger

        dispatch_message.apply_async(
            args=[task_pk],
            queue=queue_name,
            countdown=batch_delay + stagger_delay,
        )

    return (
        f"Broadcast #{broadcast.pk} — "
        f"{broadcast.total_groups} send tasks enqueued "
        f"across {worker_count} worker(s) "
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

    worker_id = int(os.environ.get("WA_WORKER_ID", "0"))
    worker_name = f"worker-{worker_id}"
    msg_task.status = MessageTask.Status.SENDING
    msg_task.worker_id = worker_id
    msg_task.save(update_fields=["status", "worker_id"])

    # Worker tracking — record task start
    from apps.automation.worker_tracker import record_task_end, record_task_start

    record_task_start(worker_name, str(self.request.id), msg_task.group.group_jid)

    attempt = record_attempt_start(msg_task)
    article = msg_task.broadcast.article
    message_body = _compose_message(article)
    success = False
    image_path = None

    try:
        image_path = _download_article_image(article)

        if image_path:
            from apps.automation.services import send_image_to_group

            success = send_image_to_group(
                group_jid=msg_task.group.group_jid,
                image_path=str(image_path),
                caption=message_body,
            )
        else:
            from apps.automation.services import send_message_to_group

            success = send_message_to_group(
                group_jid=msg_task.group.group_jid,
                message=message_body,
            )
    except Exception as exc:
        # Don't retry if the browser was shut down (worker stopping).
        if "Target page, context or browser has been closed" in str(exc):
            logger.info(
                "Worker shutting down — requeueing MessageTask pk=%d.",
                message_task_pk,
            )
            record_attempt_failure(attempt, ErrorCategory.UNKNOWN, str(exc))
            msg_task.status = MessageTask.Status.QUEUED
            msg_task.save(update_fields=["status"])
            record_task_end(worker_name, success=False)
            return f"Requeued {msg_task.group.name} (worker shutdown)"

        category = classify_error(exc)
        record_attempt_failure(attempt, category, str(exc))

        if category == ErrorCategory.RATE_LIMITED:
            _schedule_rate_limit_retry(msg_task)
            record_task_end(worker_name, success=False)
            return f"Rate-limited — retry scheduled for {msg_task.group.name}"

        if category == ErrorCategory.SESSION_EXPIRED:
            _mark_failed(msg_task, str(exc), category)
            record_task_end(worker_name, success=False)
            return f"Session expired — failed {msg_task.group.name}"

        logger.error(
            "Send failed for MessageTask pk=%d: %s",
            message_task_pk,
            exc,
            exc_info=True,
        )
        try:
            backoff = 120 * (2 ** self.request.retries)
            raise self.retry(exc=exc, countdown=backoff)
        except self.MaxRetriesExceededError:
            _mark_failed(msg_task, str(exc), category)
            record_task_end(worker_name, success=False)
            return f"Permanently failed for {msg_task.group.name}"

    finally:
        _cleanup_temp_image(image_path)

    if success:
        record_attempt_success(attempt)
        _mark_sent(msg_task)
        record_task_end(worker_name, success=True)
        return f"Sent to {msg_task.group.name}"

    record_attempt_failure(attempt, ErrorCategory.SEND_FAILED, "send returned False")
    _mark_failed(msg_task, "send returned False")
    record_task_end(worker_name, success=False)
    return f"Send failed for {msg_task.group.name}"


@shared_task(
    bind=True,
    name="apps.campaigns.tasks.retry_failed_messages",
    max_retries=0,
    acks_late=True,
)
def retry_failed_messages(
    self,  # noqa: ANN001
    broadcast_pk: int | None = None,
) -> str:
    """Re-queue failed MessageTasks that haven't exceeded max attempts.

    Args:
        broadcast_pk: Optionally limit to a single broadcast.
    """
    max_attempts = getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)

    qs = MessageTask.objects.filter(
        status=MessageTask.Status.FAILED,
        attempt_count__lt=max_attempts,
        group__is_active=True,
        group__is_healthy=True,
    )
    if broadcast_pk is not None:
        qs = qs.filter(broadcast_id=broadcast_pk)

    total = qs.count()
    requeued = 0
    for task_pk in qs.values_list("pk", flat=True):
        MessageTask.objects.filter(pk=task_pk).update(status=MessageTask.Status.QUEUED)
        _dispatch_to_worker(task_pk, index=requeued)
        requeued += 1

    return f"Re-queued {requeued} of {total} failed tasks"


def _dispatch_to_worker(task_pk: int, *, index: int = 0) -> None:
    """Route a dispatch_message call to the correct wa-worker-N queue.

    Uses round-robin based on *index* so retries spread across workers
    the same way the initial fan-out does.
    """
    worker_count = min(int(get_config("AUTOMATION_WORKER_COUNT", int)), 4)
    worker_idx = index % worker_count
    queue_name = f"wa-worker-{worker_idx}"

    dispatch_message.apply_async(args=[task_pk], queue=queue_name)


def _compose_message(article: ScrapedArticle) -> str:
    """Build the message text from the scraped article.

    If the body already contains a formatted message (from a site-specific
    parser), use it directly. Otherwise fall back to a simple format.
    """
    if article.body and _is_parser_formatted(article.body):
        return article.body

    title = article.title or "New Article"
    return f"📰 *{title}*\n\n{article.url}"


def _is_parser_formatted(body: str) -> bool:
    """Check if the body was already formatted by a site-specific parser."""
    first_char = body.strip()[:1]
    return first_char and not first_char.isalnum()


def _download_article_image(article):  # noqa: ANN001, ANN202
    """Download the article's poster image to a temp file if available."""
    if not getattr(article, "image_url", None):
        return None

    from utils.image_downloader import download_image

    return download_image(article.image_url)


def _cleanup_temp_image(image_path) -> None:  # noqa: ANN001
    """Delete a temporary image file if it exists."""
    if image_path is None:
        return
    try:
        from pathlib import Path

        Path(image_path).unlink(missing_ok=True)
    except OSError:
        pass


def _mark_sent(msg_task: MessageTask) -> None:
    """Record a successful send."""
    msg_task.status = MessageTask.Status.SENT
    msg_task.sent_at = timezone.now()
    msg_task.save(update_fields=["status", "sent_at"])
    _update_broadcast_counters(msg_task.broadcast, success=True)


def _mark_failed(
    msg_task: MessageTask,
    error: str,
    category: str | None = None,
) -> None:
    """Record a failed send."""
    msg_task.status = MessageTask.Status.FAILED
    msg_task.error_message = error[:2000]
    if category:
        msg_task.error_category = category
    msg_task.save(update_fields=["status", "error_message", "error_category"])
    _update_broadcast_counters(msg_task.broadcast, success=False)


def _schedule_rate_limit_retry(msg_task: MessageTask) -> None:
    """Set a future retry time and leave the task queued."""
    delay_seconds = getattr(settings, "RATE_LIMIT_RETRY_DELAY", 3600)
    msg_task.status = MessageTask.Status.QUEUED
    msg_task.next_retry_at = timezone.now() + timedelta(seconds=delay_seconds)
    msg_task.save(update_fields=["status", "next_retry_at"])

    worker_count = min(int(get_config("AUTOMATION_WORKER_COUNT", int)), 4)
    worker_idx = (msg_task.worker_id or 0) % worker_count
    queue_name = f"wa-worker-{worker_idx}"

    dispatch_message.apply_async(
        args=[msg_task.pk],
        queue=queue_name,
        countdown=delay_seconds,
    )
    logger.info(
        "Rate-limited — rescheduled MessageTask pk=%d in %ds on %s.",
        msg_task.pk,
        delay_seconds,
        queue_name,
    )


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
        if broadcast.failed_count > 0 and broadcast.sent_count < broadcast.total_groups:
            broadcast.status = BroadcastEvent.Status.FAILED
        else:
            broadcast.status = BroadcastEvent.Status.COMPLETED
        broadcast.completed_at = timezone.now()
        broadcast.save(update_fields=["status", "completed_at"])
        logger.info("Broadcast #%d finished — %s.", broadcast.pk, broadcast.status)
