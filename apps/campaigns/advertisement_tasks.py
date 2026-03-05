"""Advertisement fan-out Celery task."""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.campaigns.advertisement_tasks.fan_out_advertisement",
    max_retries=1,
    default_retry_delay=30,
    acks_late=True,
)
def fan_out_advertisement(self, advertisement_pk: int) -> str:  # noqa: ANN001
    """Create a broadcast event and enqueue individual send tasks for an advertisement.

    Args:
        advertisement_pk: Primary key of the Advertisement to broadcast.

    Returns:
        Human-readable status string.
    """
    from apps.campaigns.models import Advertisement

    try:
        ad = Advertisement.objects.get(pk=advertisement_pk)
    except Advertisement.DoesNotExist:
        logger.error("Advertisement pk=%d not found — aborting.", advertisement_pk)
        return f"Advertisement pk={advertisement_pk} not found"

    actionable = {Advertisement.Status.QUEUED, Advertisement.Status.DRAFT}
    if ad.status not in actionable:
        logger.info(
            "Advertisement pk=%d already in status=%s — skipping.",
            advertisement_pk,
            ad.status,
        )
        return f"Advertisement pk={advertisement_pk} already {ad.status}"

    from apps.campaigns.advertisement_services import create_advertisement_broadcast_event
    from apps.campaigns.broadcast_router import assign_and_dispatch_tasks

    broadcast = create_advertisement_broadcast_event(ad)
    task_pks = list(broadcast.message_tasks.values_list("pk", flat=True))
    enqueued = assign_and_dispatch_tasks(task_pks)

    return (
        f"Advertisement Broadcast #{broadcast.pk} — "
        f"{enqueued}/{broadcast.total_groups} tasks enqueued."
    )
