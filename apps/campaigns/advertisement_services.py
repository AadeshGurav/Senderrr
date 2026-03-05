"""Advertisement broadcast service — fan-out logic for ad campaigns."""

from __future__ import annotations

import logging

from django.db.models import Q, QuerySet

from apps.campaigns.models import (
    Advertisement,
    BroadcastEvent,
    MessageTask,
    WhatsAppGroup,
)

logger = logging.getLogger(__name__)


def _eligible_all_groups() -> QuerySet[WhatsAppGroup]:
    """Active, healthy groups — direct and community sub-groups."""
    return WhatsAppGroup.objects.filter(
        is_active=True,
        is_healthy=True,
    ).filter(Q(community__isnull=True) | Q(community__is_active=True))


def _eligible_community_groups() -> QuerySet[WhatsAppGroup]:
    """Active, healthy sub-groups belonging to any active community."""
    return WhatsAppGroup.objects.filter(
        is_active=True,
        is_healthy=True,
        community__isnull=False,
        community__is_active=True,
    )


def _specific_targets(ad: Advertisement) -> QuerySet[WhatsAppGroup]:
    """Groups explicitly selected plus sub-groups of selected communities."""
    direct_ids = set(
        ad.target_groups.filter(is_active=True, is_healthy=True).values_list(
            "pk", flat=True
        )
    )
    community_ids = set(
        WhatsAppGroup.objects.filter(
            community__in=ad.target_communities.filter(is_active=True),
            is_active=True,
            is_healthy=True,
        ).values_list("pk", flat=True)
    )
    return WhatsAppGroup.objects.filter(pk__in=direct_ids | community_ids)


_TARGET_RESOLVERS = {
    Advertisement.TargetType.ALL_GROUPS: _eligible_all_groups,
    Advertisement.TargetType.ALL_COMMUNITIES: _eligible_community_groups,
}


def create_advertisement_broadcast_event(ad: Advertisement) -> BroadcastEvent:
    """Create a BroadcastEvent from an Advertisement and fan out MessageTasks.

    Target group selection follows ``ad.target_type``:
    - ``ALL_GROUPS``: every active, healthy group.
    - ``ALL_COMMUNITIES``: sub-groups of all active communities.
    - ``SPECIFIC``: selected groups + sub-groups of selected communities.

    Args:
        ad: The Advertisement to broadcast.

    Returns:
        The newly created ``BroadcastEvent``.
    """
    resolver = _TARGET_RESOLVERS.get(
        ad.target_type, lambda: _specific_targets(ad)
    )
    eligible = resolver()
    group_count = eligible.count()

    if group_count == 0:
        logger.warning(
            "Advertisement #%d — no eligible groups for target_type=%s.",
            ad.pk,
            ad.target_type,
        )
        ad.status = Advertisement.Status.COMPLETED
        ad.save(update_fields=["status"])
        return BroadcastEvent.objects.create(
            advertisement=ad,
            status=BroadcastEvent.Status.COMPLETED,
            total_groups=0,
        )

    ad.status = Advertisement.Status.SENDING
    ad.save(update_fields=["status"])

    broadcast = BroadcastEvent.objects.create(
        advertisement=ad,
        status=BroadcastEvent.Status.IN_PROGRESS,
        total_groups=group_count,
    )
    MessageTask.objects.bulk_create(
        [MessageTask(broadcast=broadcast, group=group) for group in eligible.iterator()]
    )
    logger.info(
        "Advertisement broadcast #%d created — %d message tasks queued.",
        broadcast.pk,
        group_count,
    )
    return broadcast
