"""Worker-admin mapping — computes worker IDs from admin configuration.

Worker IDs are assigned sequentially across admins:
    Admin 0 (2 sessions) → workers 0, 1
    Admin 1 (3 sessions) → workers 2, 3, 4
    Admin 2 (2 sessions) → workers 5, 6
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WorkerSlot:
    """A single worker process bound to an admin and session index."""

    worker_id: int
    admin_id: int
    admin_label: str
    session_index: int
    queue_name: str


def build_worker_map() -> list[WorkerSlot]:
    """Build the full worker map from active admin accounts.

    Returns:
        Ordered list of WorkerSlot — one per worker process.
    """
    from apps.campaigns.models import AdminAccount

    admins = AdminAccount.objects.filter(is_active=True).order_by("pk")
    slots: list[WorkerSlot] = []
    worker_id = 0

    for admin in admins:
        for session_idx in range(admin.sessions_per_admin):
            slots.append(
                WorkerSlot(
                    worker_id=worker_id,
                    admin_id=admin.pk,
                    admin_label=admin.label,
                    session_index=session_idx,
                    queue_name=f"wa-worker-{worker_id}",
                )
            )
            worker_id += 1

    return slots


def get_admin_id_for_worker(worker_id: int) -> int | None:
    """Resolve which admin owns a given worker ID.

    Returns:
        Admin PK, or ``None`` if the worker_id is not in the current map.
    """
    for slot in build_worker_map():
        if slot.worker_id == worker_id:
            return slot.admin_id
    return None


def get_worker_ids_for_admin(admin_id: int) -> list[int]:
    """Return all worker IDs belonging to a specific admin."""
    return [s.worker_id for s in build_worker_map() if s.admin_id == admin_id]


def get_total_worker_count() -> int:
    """Return total number of workers across all active admins."""
    from apps.campaigns.models import AdminAccount

    admins = AdminAccount.objects.filter(is_active=True)
    return sum(a.sessions_per_admin for a in admins)
