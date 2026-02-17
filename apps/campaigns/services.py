"""Campaigns services — broadcast fan-out logic."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from apps.campaigns.models import BroadcastEvent, MessageTask, WhatsAppGroup

if TYPE_CHECKING:
    from apps.scraper.models import ScrapedArticle

logger = logging.getLogger(__name__)


def create_broadcast_event(article: ScrapedArticle) -> BroadcastEvent:
    """Create a broadcast and fan out one MessageTask per active group.

    This does NOT execute the sends — it only populates the queue.
    Each ``MessageTask`` is later picked up by the Celery worker.

    Returns:
        The newly created ``BroadcastEvent``.
    """
    all_active = WhatsAppGroup.objects.filter(is_active=True)
    unhealthy_count = all_active.filter(is_healthy=False).count()
    if unhealthy_count:
        logger.info(
            "Skipping %d unhealthy group(s) from broadcast.", unhealthy_count
        )

    active_groups = all_active.filter(is_healthy=True)
    group_count = active_groups.count()

    if group_count == 0:
        logger.warning("No active/healthy WhatsApp groups — broadcast skipped.")
        broadcast = BroadcastEvent.objects.create(
            article=article,
            status=BroadcastEvent.Status.COMPLETED,
            total_groups=0,
        )
        return broadcast

    broadcast = BroadcastEvent.objects.create(
        article=article,
        status=BroadcastEvent.Status.IN_PROGRESS,
        total_groups=group_count,
    )

    message_tasks = [
        MessageTask(broadcast=broadcast, group=group)
        for group in active_groups.iterator()
    ]
    MessageTask.objects.bulk_create(message_tasks)

    logger.info(
        "Broadcast #%d created — %d message tasks queued.",
        broadcast.pk,
        group_count,
    )
    return broadcast
