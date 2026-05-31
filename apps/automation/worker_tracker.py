"""Worker tracker — session lifecycle and heartbeat recording."""

from __future__ import annotations

import logging
import os

from django.db.models import F
from django.utils import timezone

from apps.automation.models import WorkerSession, WorkerSessionLog

logger = logging.getLogger(__name__)


def register_worker(worker_id: str) -> WorkerSession:
    """Get or create a WorkerSession, binding it to the admin from WA_ADMIN_ID.

    The admin FK must be set so ``_admin_has_healthy_session`` can verify
    session health by admin.  Without it, all healthy-session checks return
    False and the rotation falls back to "any active admin" on every task.

    Returns:
        The ``WorkerSession`` instance.
    """
    admin_id = int(os.environ.get("WA_ADMIN_ID", "-1"))
    admin_fk_id = admin_id if admin_id >= 0 else None

    session, created = WorkerSession.objects.get_or_create(
        worker_id=worker_id,
        defaults={
            "status": WorkerSession.Status.STARTING,
            "admin_id": admin_fk_id,
        },
    )
    if not created:
        updates: dict = {"status": WorkerSession.Status.STARTING, "last_error": ""}
        if session.admin_id != admin_fk_id:
            updates["admin_id"] = admin_fk_id
        session.status = WorkerSession.Status.STARTING
        session.last_error = ""
        for k, v in updates.items():
            setattr(session, k, v)
        session.save(update_fields=[*updates.keys(), "updated_at"])

    _log_event(session, WorkerSessionLog.Event.STARTED, "Worker registered")
    return session


def record_heartbeat(worker_id: str, browser_status: str) -> None:
    """Update heartbeat timestamp and browser status."""
    now = timezone.now()
    updated = WorkerSession.objects.filter(worker_id=worker_id).update(
        last_heartbeat_at=now,
        browser_status=browser_status,
        status=WorkerSession.Status.IDLE,
        updated_at=now,
    )
    if not updated:
        return

    session = WorkerSession.objects.get(worker_id=worker_id)
    _log_event(
        session,
        WorkerSessionLog.Event.HEARTBEAT,
        f"browser={browser_status}",
    )


def record_task_start(
    worker_id: str,
    task_id: str,
    group_jid: str,
) -> None:
    """Mark the worker as actively processing a task."""
    WorkerSession.objects.filter(worker_id=worker_id).update(
        status=WorkerSession.Status.ACTIVE,
        current_task_id=task_id,
        current_group=group_jid,
    )
    session = WorkerSession.objects.filter(worker_id=worker_id).first()
    if session:
        _log_event(
            session,
            WorkerSessionLog.Event.TASK_STARTED,
            f"task={task_id} group={group_jid}",
        )


def record_task_end(worker_id: str, *, success: bool) -> None:
    """Clear the active task and bump sent/failed counters."""
    counter_field = "total_sent" if success else "total_failed"
    WorkerSession.objects.filter(worker_id=worker_id).update(
        status=WorkerSession.Status.IDLE,
        current_task_id="",
        current_group="",
        **{counter_field: F(counter_field) + 1},
    )

    session = WorkerSession.objects.filter(worker_id=worker_id).first()
    if session:
        event = (
            WorkerSessionLog.Event.TASK_COMPLETED
            if success
            else WorkerSessionLog.Event.TASK_FAILED
        )
        _log_event(session, event)


def record_session_event(
    worker_id: str,
    event: str,
    detail: str = "",
) -> None:
    """Create a WorkerSessionLog entry for an arbitrary event."""
    session = WorkerSession.objects.filter(worker_id=worker_id).first()
    if session:
        _log_event(session, event, detail)


def mark_offline(worker_id: str) -> None:
    """Set the worker status to OFFLINE."""
    WorkerSession.objects.filter(worker_id=worker_id).update(
        status=WorkerSession.Status.OFFLINE,
        current_task_id="",
        current_group="",
    )
    session = WorkerSession.objects.filter(worker_id=worker_id).first()
    if session:
        _log_event(session, WorkerSessionLog.Event.SHUTDOWN)


def _log_event(
    session: WorkerSession,
    event: str,
    detail: str = "",
) -> None:
    """Create an immutable log entry."""
    WorkerSessionLog.objects.create(
        worker_session=session,
        event=event,
        detail=detail,
    )
