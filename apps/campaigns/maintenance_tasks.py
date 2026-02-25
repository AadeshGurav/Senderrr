"""Campaigns maintenance tasks — periodic system health and recovery."""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.campaigns.models import WhatsAppGroup

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.campaigns.maintenance_tasks.auto_recover_unhealthy_groups",
    max_retries=0,
    acks_late=True,
)
def auto_recover_unhealthy_groups(self) -> str:  # noqa: ANN001
    """Reset unhealthy groups that haven't failed recently.

    Groups that are flagged unhealthy but haven't had a new failure in
    ``GROUP_UNHEALTHY_RECOVERY_HOURS`` are given another chance:
    their consecutive failure counter is reset and they are marked healthy.
    This prevents a temporary failure streak from permanently silencing a group.

    Also restores ``is_active`` for groups that were auto-disabled, so they
    re-enter the broadcast pool automatically.

    Returns:
        Human-readable summary of how many groups were recovered.
    """
    recovery_hours = getattr(settings, "GROUP_UNHEALTHY_RECOVERY_HOURS", 2)
    cutoff = timezone.now() - timedelta(hours=recovery_hours)

    # Groups unhealthy AND whose last failure is older than the recovery window.
    candidates = WhatsAppGroup.objects.filter(
        is_healthy=False,
        last_failed_at__lt=cutoff,
    )
    count = candidates.count()

    if count == 0:
        logger.info("auto_recover_unhealthy_groups: no groups to recover.")
        return "No unhealthy groups eligible for recovery."

    candidates.update(
        is_healthy=True,
        is_active=True,
        consecutive_failures=0,
    )
    logger.info(
        "auto_recover_unhealthy_groups: recovered %d group(s) "
        "(last_failed_at older than %d hours).",
        count,
        recovery_hours,
    )
    return f"Recovered {count} group(s) after {recovery_hours}h recovery window."
