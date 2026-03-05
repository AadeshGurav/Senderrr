"""Campaigns community tasks — fan-out broadcast for a specific community."""

from __future__ import annotations

import logging

from celery import shared_task

from apps.campaigns.models import WhatsAppCommunity
from apps.campaigns.services import create_community_broadcast_event
from apps.scraper.models import ScrapedArticle

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.campaigns.community_tasks.fan_out_community_broadcast",
    max_retries=1,
    default_retry_delay=30,
    acks_late=True,
)
def fan_out_community_broadcast(
    self,  # noqa: ANN001
    community_pk: int,
    article_pk: int,
) -> str:
    """Fan out a broadcast to all active sub-groups of a specific community.

    Args:
        community_pk: Primary key of the target ``WhatsAppCommunity``.
        article_pk: Primary key of the ``ScrapedArticle`` to broadcast.
    """
    try:
        community = WhatsAppCommunity.objects.get(pk=community_pk)
    except WhatsAppCommunity.DoesNotExist:
        logger.error("WhatsAppCommunity pk=%d not found — aborting.", community_pk)
        return f"Community pk={community_pk} not found"

    try:
        article = ScrapedArticle.objects.get(pk=article_pk)
    except ScrapedArticle.DoesNotExist:
        logger.error(
            "Article pk=%d not found — aborting community broadcast.", article_pk
        )
        return f"Article pk={article_pk} not found"

    broadcast = create_community_broadcast_event(community, article)

    if broadcast.total_groups == 0:
        return f"Community '{community.name}' — no eligible sub-groups."

    task_pks = list(broadcast.message_tasks.values_list("pk", flat=True))

    from apps.campaigns.broadcast_router import assign_and_dispatch_tasks

    enqueued = assign_and_dispatch_tasks(task_pks)

    return (
        f"Community broadcast #{broadcast.pk} for '{community.name}' — "
        f"{enqueued}/{broadcast.total_groups} tasks enqueued."
    )
