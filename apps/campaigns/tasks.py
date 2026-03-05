"""Campaigns Celery tasks — fan-out, dispatch, and retry."""

from __future__ import annotations

import logging
import os

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
from apps.campaigns.task_helpers import (
    cleanup_temp_image,
    compose_message,
    download_article_image,
    mark_failed,
    mark_sent,
    schedule_rate_limit_retry,
)
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
    """Create a broadcast event and enqueue individual send tasks."""
    try:
        article = ScrapedArticle.objects.get(pk=article_pk)
    except ScrapedArticle.DoesNotExist:
        logger.error("Article pk=%d not found — aborting broadcast.", article_pk)
        return f"Article pk={article_pk} not found"

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

    from apps.campaigns.broadcast_router import assign_and_dispatch_tasks

    enqueued = assign_and_dispatch_tasks(task_pks)

    return (
        f"Broadcast #{broadcast.pk} — "
        f"{enqueued}/{broadcast.total_groups} tasks enqueued."
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
            "group", "group__community", "broadcast__article", "admin"
        ).get(pk=message_task_pk)
    except MessageTask.DoesNotExist:
        logger.error("MessageTask pk=%d vanished.", message_task_pk)
        return f"MessageTask pk={message_task_pk} not found"

    worker_id = int(os.environ.get("WA_WORKER_ID", "0"))
    worker_name = f"worker-{worker_id}"
    msg_task.status = MessageTask.Status.SENDING
    msg_task.worker_id = worker_id
    msg_task.save(update_fields=["status", "worker_id"])

    from apps.automation.worker_tracker import record_task_end, record_task_start

    record_task_start(worker_name, str(self.request.id), msg_task.group.group_jid)

    attempt = record_attempt_start(msg_task)
    article = msg_task.broadcast.article
    message_body = compose_message(article)
    success = False
    image_path = None

    try:
        image_path = download_article_image(article)
        success = _send_message(msg_task, message_body, image_path)
    except Exception as exc:
        return _handle_send_error(self, msg_task, attempt, worker_name, exc)
    finally:
        cleanup_temp_image(image_path)

    if success:
        record_attempt_success(attempt)
        mark_sent(msg_task)
        _update_admin_stats(msg_task, success=True)
        record_task_end(worker_name, success=True)
        return f"Sent to {msg_task.group.name}"

    record_attempt_failure(attempt, ErrorCategory.SEND_FAILED, "send returned False")
    mark_failed(msg_task, "send returned False")
    _update_admin_stats(msg_task, success=False)
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
    """Re-queue failed MessageTasks that haven't exceeded max attempts."""
    from apps.campaigns.broadcast_router import assign_and_dispatch_tasks

    max_attempts = getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)
    qs = MessageTask.objects.filter(
        status=MessageTask.Status.FAILED,
        attempt_count__lt=max_attempts,
        group__is_active=True,
        group__is_healthy=True,
    )
    if broadcast_pk is not None:
        qs = qs.filter(broadcast_id=broadcast_pk)

    task_pks = list(qs.values_list("pk", flat=True))
    qs.update(status=MessageTask.Status.QUEUED)
    enqueued = assign_and_dispatch_tasks(task_pks)

    return f"Re-queued {enqueued} of {len(task_pks)} failed tasks"


def _send_message(
    msg_task: MessageTask, message_body: str, image_path: str | None
) -> bool:
    """Dispatch to the correct send function based on group type."""
    community = msg_task.group.community

    if community is not None:
        from apps.automation.services import send_message_to_subgroup

        return send_message_to_subgroup(
            community_jid=community.community_jid,
            subgroup_jid=msg_task.group.group_jid,
            message=message_body,
        )

    if image_path:
        from apps.automation.services import send_image_to_group

        return send_image_to_group(
            group_jid=msg_task.group.group_jid,
            image_path=str(image_path),
            caption=message_body,
        )

    from apps.automation.services import send_message_to_group

    return send_message_to_group(
        group_jid=msg_task.group.group_jid,
        message=message_body,
    )


def _handle_send_error(
    task_self: object,
    msg_task: MessageTask,
    attempt: object,
    worker_name: str,
    exc: Exception,
) -> str:
    """Handle exceptions from send operations."""
    from apps.automation.worker_tracker import record_task_end

    if "Target page, context or browser has been closed" in str(exc):
        logger.info("Worker shutting down — requeueing pk=%d.", msg_task.pk)
        record_attempt_failure(attempt, ErrorCategory.UNKNOWN, str(exc))
        msg_task.status = MessageTask.Status.QUEUED
        msg_task.save(update_fields=["status"])
        record_task_end(worker_name, success=False)
        return f"Requeued {msg_task.group.name} (worker shutdown)"

    category = classify_error(exc)
    record_attempt_failure(attempt, category, str(exc))

    if category == ErrorCategory.RATE_LIMITED:
        schedule_rate_limit_retry(msg_task)
        record_task_end(worker_name, success=False)
        return f"Rate-limited — retry scheduled for {msg_task.group.name}"

    if category == ErrorCategory.SESSION_EXPIRED:
        mark_failed(msg_task, str(exc), category)
        record_task_end(worker_name, success=False)
        return f"Session expired — failed {msg_task.group.name}"

    logger.error("Send failed pk=%d: %s", msg_task.pk, exc, exc_info=True)
    try:
        backoff = 120 * (2**task_self.request.retries)
        raise task_self.retry(exc=exc, countdown=backoff)
    except task_self.MaxRetriesExceededError:
        mark_failed(msg_task, str(exc), category)
        _update_admin_stats(msg_task, success=False)
        record_task_end(worker_name, success=False)
        return f"Permanently failed for {msg_task.group.name}"


def _update_admin_stats(msg_task: MessageTask, *, success: bool) -> None:
    """Bump sent/failed counters on the assigned admin."""
    if msg_task.admin_id is None:
        return

    from django.db.models import F

    from apps.campaigns.models import AdminAccount

    field = "total_sent" if success else "total_failed"
    updates = {field: F(field) + 1}
    if success:
        updates["last_sent_at"] = timezone.now()
    AdminAccount.objects.filter(pk=msg_task.admin_id).update(**updates)
