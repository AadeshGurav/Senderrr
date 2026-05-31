"""Admin assignment — "no repeat in 3" rotation algorithm.

For each group, selects an admin that has NOT sent to that group
in the last 3 successful deliveries.  Falls back to any healthy
admin when the constraint cannot be satisfied.
"""

from __future__ import annotations

import logging
import random

from apps.automation.models import WorkerSession
from apps.campaigns.models import AdminAccount, MessageTask

logger = logging.getLogger(__name__)

HISTORY_DEPTH = 3


def select_admin_for_group(group_id: int) -> AdminAccount | None:
    """Pick the best admin to send the next message to a group.

    Algorithm:
        1. Get last 3 successful sends to this group → recent admin IDs.
        2. Get all active admins with at least 1 healthy session.
        3. Exclude admins in the recent list.
        4. Random pick from eligible admins.
        5. If none eligible, relax the constraint and log a warning.

    Returns:
        An AdminAccount, or ``None`` if no active admins exist.
    """
    active_admins = list(AdminAccount.objects.filter(is_active=True))
    if not active_admins:
        return None

    recent_admin_ids = _get_recent_admin_ids(group_id)
    healthy_admins = [a for a in active_admins if _admin_has_healthy_session(a.pk)]

    if not healthy_admins:
        logger.info(
            "No healthy admins available for group_id=%d — using any active admin.",
            group_id,
        )
        return random.choice(active_admins)

    eligible = [a for a in healthy_admins if a.pk not in recent_admin_ids]

    if eligible:
        return random.choice(eligible)

    # Constraint relaxed — all healthy admins were in the recent history
    chosen = random.choice(healthy_admins)
    logger.warning(
        "Admin rotation rule relaxed for group_id=%d — admin '%s' was in "
        "recent history but is the only healthy option.",
        group_id,
        chosen.label,
    )
    return chosen


def _get_recent_admin_ids(group_id: int) -> set[int]:
    """Return the set of admin PKs that sent to this group recently."""
    recent = (
        MessageTask.objects.filter(
            group_id=group_id,
            status=MessageTask.Status.SENT,
            admin__isnull=False,
        )
        .order_by("-sent_at")
        .values_list("admin_id", flat=True)[:HISTORY_DEPTH]
    )
    return set(recent)


def _admin_has_healthy_session(admin_id: int) -> bool:
    """Check if at least one worker session for this admin is logged in."""
    return WorkerSession.objects.filter(
        admin_id=admin_id,
        browser_status=WorkerSession.BrowserStatus.LOGGED_IN,
    ).exists()
