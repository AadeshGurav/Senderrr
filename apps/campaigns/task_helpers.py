"""Task helper functions — message composition, image handling, status updates."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import F
from django.utils import timezone

from apps.campaigns.models import BroadcastEvent, MessageTask

logger = logging.getLogger(__name__)


def compose_message(article: object) -> str:
    """Build the outgoing WhatsApp message for a scraped article.

    Resolution order:
    1. Active MessageTemplate — rendered with {news.*} placeholder substitution.
    2. Pre-formatted body from the site parser (legacy fallback).
    3. Minimal title + URL format (last resort).
    """
    from apps.campaigns.template_renderer import get_active_template, render_message

    template = get_active_template()
    if template:
        return render_message(article, template)

    if article.body and _is_parser_formatted(article.body):
        return article.body

    title = article.title or "New Article"
    return f"\U0001f4f0 *{title}*\n\n{article.url}"


def download_article_image(article: object) -> str | None:
    """Download the article's poster image to a temp file if available."""
    if not getattr(article, "image_url", None):
        return None

    from utils.image_downloader import download_image

    return download_image(article.image_url)


def cleanup_temp_image(image_path: str | None) -> None:
    """Delete a temporary image file if it exists."""
    if image_path is None:
        return
    try:
        from pathlib import Path

        Path(image_path).unlink(missing_ok=True)
    except OSError:
        pass


def mark_sent(msg_task: MessageTask) -> None:
    """Record a successful send."""
    msg_task.status = MessageTask.Status.SENT
    msg_task.sent_at = timezone.now()
    msg_task.save(update_fields=["status", "sent_at"])
    update_broadcast_counters(msg_task.broadcast, success=True)


def mark_failed(
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
    update_broadcast_counters(msg_task.broadcast, success=False)


def schedule_rate_limit_retry(msg_task: MessageTask) -> None:
    """Set a future retry time and requeue the task."""
    delay_seconds = getattr(settings, "RATE_LIMIT_RETRY_DELAY", 3600)
    msg_task.status = MessageTask.Status.QUEUED
    msg_task.next_retry_at = timezone.now() + timedelta(seconds=delay_seconds)
    msg_task.save(update_fields=["status", "next_retry_at"])

    from apps.campaigns.broadcast_router import dispatch_to_admin_worker

    dispatch_to_admin_worker(
        msg_task.pk, admin_id=msg_task.admin_id, countdown=delay_seconds
    )


def update_broadcast_counters(broadcast: BroadcastEvent, *, success: bool) -> None:
    """Atomically bump sent/failed counters on the parent broadcast."""
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
        _sync_advertisement_status(broadcast)


def _sync_advertisement_status(broadcast: BroadcastEvent) -> None:
    """Mirror a completed BroadcastEvent's status back to its Advertisement.

    Package-aware: if the ad has remaining days after a successful broadcast,
    it transitions to ACTIVE (sendable again) instead of COMPLETED.
    """
    if broadcast.advertisement_id is None:
        return

    from apps.campaigns.models import Advertisement

    try:
        ad = Advertisement.objects.get(pk=broadcast.advertisement_id)
    except Advertisement.DoesNotExist:
        return

    if broadcast.status == BroadcastEvent.Status.FAILED:
        # Failed broadcast — revert to sendable state without consuming a day
        revert_to = (
            Advertisement.Status.ACTIVE
            if ad.days_used > 0
            else Advertisement.Status.DRAFT
        )
        Advertisement.objects.filter(pk=ad.pk).update(status=revert_to)
        return

    if broadcast.status == BroadcastEvent.Status.COMPLETED:
        Advertisement.objects.filter(pk=ad.pk).update(
            sent_at=broadcast.completed_at,
        )
        ad.refresh_from_db()
        new_status = (
            Advertisement.Status.ACTIVE
            if ad.days_remaining > 0
            else Advertisement.Status.COMPLETED
        )
        Advertisement.objects.filter(pk=ad.pk).update(status=new_status)


def _is_parser_formatted(body: str) -> bool:
    """Check if the body was already formatted by a site-specific parser."""
    first_char = body.strip()[:1]
    return first_char and not first_char.isalnum()
