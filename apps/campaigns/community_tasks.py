"""Campaigns community tasks — fan-out broadcast for a specific community."""

from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings

from apps.campaigns.models import WhatsAppCommunity
from apps.campaigns.services import create_community_broadcast_event
from apps.campaigns.tasks import dispatch_message
from apps.scraper.models import ScrapedArticle
from utils.config import get_config

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

    Called from the dashboard when a manual community broadcast is triggered,
    or can be wired to the scraper for community-specific delivery.

    Args:
        community_pk: Primary key of the target ``WhatsAppCommunity``.
        article_pk: Primary key of the ``ScrapedArticle`` to broadcast.

    Returns:
        Human-readable status string.
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
        return (
            f"Community '{community.name}' broadcast skipped — no eligible sub-groups."
        )

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
        f"Community broadcast #{broadcast.pk} for '{community.name}' — "
        f"{broadcast.total_groups} sub-group tasks enqueued "
        f"across {worker_count} worker(s)."
    )
