"""Campaigns services — broadcast fan-out logic."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db.models import Q, QuerySet

from apps.campaigns.models import (
    BroadcastEvent,
    MessageTask,
    WhatsAppCommunity,
    WhatsAppGroup,
)

if TYPE_CHECKING:
    from apps.scraper.models import ScrapedArticle

logger = logging.getLogger(__name__)


def _eligible_groups() -> QuerySet[WhatsAppGroup]:
    """Return active, healthy groups whose parent community (if any) is also active."""
    return WhatsAppGroup.objects.filter(
        is_active=True,
        is_healthy=True,
    ).filter(Q(community__isnull=True) | Q(community__is_active=True))


def create_broadcast_event(article: ScrapedArticle) -> BroadcastEvent:
    """Create a broadcast and fan out one MessageTask per eligible group.

    Eligible groups are active, healthy, and either standalone or belonging
    to an active community. Inactive communities gate their sub-groups out.

    Args:
        article: The newly detected article triggering the broadcast.

    Returns:
        The newly created ``BroadcastEvent``.
    """
    eligible = _eligible_groups()
    unhealthy_count = WhatsAppGroup.objects.filter(
        is_active=True, is_healthy=False
    ).count()
    if unhealthy_count:
        logger.info("Skipping %d unhealthy group(s) from broadcast.", unhealthy_count)

    group_count = eligible.count()

    if group_count == 0:
        logger.warning("No eligible WhatsApp groups — broadcast skipped.")
        return BroadcastEvent.objects.create(
            article=article,
            status=BroadcastEvent.Status.COMPLETED,
            total_groups=0,
        )

    broadcast = BroadcastEvent.objects.create(
        article=article,
        status=BroadcastEvent.Status.IN_PROGRESS,
        total_groups=group_count,
    )
    MessageTask.objects.bulk_create(
        [MessageTask(broadcast=broadcast, group=group) for group in eligible.iterator()]
    )
    logger.info(
        "Broadcast #%d created — %d message tasks queued.",
        broadcast.pk,
        group_count,
    )
    return broadcast


def create_community_broadcast_event(
    community: WhatsAppCommunity,
    article: ScrapedArticle,
) -> BroadcastEvent:
    """Create a broadcast that targets only sub-groups of a specific community.

    Used when triggering a community broadcast manually from the dashboard.
    Sub-groups are included only if the community is active and the individual
    sub-group is also active and healthy.

    Args:
        community: The target ``WhatsAppCommunity``.
        article: The article to broadcast.

    Returns:
        The newly created ``BroadcastEvent``.
    """
    if not community.is_active:
        logger.warning(
            "Community #%d '%s' is inactive — broadcast skipped.",
            community.pk,
            community.name,
        )
        return BroadcastEvent.objects.create(
            article=article,
            status=BroadcastEvent.Status.COMPLETED,
            total_groups=0,
        )

    subgroups = community.subgroups.filter(is_active=True, is_healthy=True)
    group_count = subgroups.count()

    if group_count == 0:
        logger.warning(
            "Community #%d '%s' has no active/healthy sub-groups — broadcast skipped.",
            community.pk,
            community.name,
        )
        return BroadcastEvent.objects.create(
            article=article,
            status=BroadcastEvent.Status.COMPLETED,
            total_groups=0,
        )

    broadcast = BroadcastEvent.objects.create(
        article=article,
        status=BroadcastEvent.Status.IN_PROGRESS,
        total_groups=group_count,
    )
    MessageTask.objects.bulk_create(
        [
            MessageTask(broadcast=broadcast, group=group)
            for group in subgroups.iterator()
        ]
    )
    logger.info(
        "Community broadcast #%d created for community '%s' — %d sub-group tasks queued.",
        broadcast.pk,
        community.name,
        group_count,
    )
    return broadcast
