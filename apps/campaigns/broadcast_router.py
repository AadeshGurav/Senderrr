"""Broadcast router — assigns admins and dispatches tasks to worker queues.

Handles the fan-out logic: for each MessageTask, selects an admin using
the "no repeat in 3" algorithm, then routes to one of that admin's workers.
"""

from __future__ import annotations

import logging

from django.conf import settings

from apps.automation.worker_mapping import get_worker_ids_for_admin
from apps.campaigns.admin_assigner import select_admin_for_group
from apps.campaigns.models import MessageTask

logger = logging.getLogger(__name__)


def assign_and_dispatch_tasks(task_pks: list[int]) -> int:
    """Assign an admin to each task and enqueue dispatch_message.

    Returns:
        Number of tasks successfully enqueued.
    """
    from apps.campaigns.tasks import dispatch_message

    batch_size = getattr(settings, "AUTOMATION_BATCH_SIZE", 50)
    batch_cooldown = getattr(settings, "AUTOMATION_BATCH_COOLDOWN", 900)
    worker_stagger = getattr(settings, "AUTOMATION_WORKER_STAGGER", 45)
    enqueued = 0

    for index, task_pk in enumerate(task_pks):
        msg_task = (
            MessageTask.objects.select_related("group").filter(pk=task_pk).first()
        )
        if msg_task is None:
            continue

        admin = select_admin_for_group(msg_task.group_id)
        if admin is None:
            logger.error("No admin available for task pk=%d — skipping.", task_pk)
            continue

        # Stamp the admin on the MessageTask
        MessageTask.objects.filter(pk=task_pk).update(admin_id=admin.pk)

        # Pick a worker queue for this admin (round-robin within admin's workers)
        queue_name = _pick_worker_queue(admin.pk, index)

        # Calculate stagger/batch delay
        batch_number = index // batch_size
        batch_delay = batch_number * batch_cooldown
        stagger = (index % 4) * worker_stagger

        dispatch_message.apply_async(
            args=[task_pk],
            queue=queue_name,
            countdown=batch_delay + stagger,
        )
        enqueued += 1

    return enqueued


def dispatch_to_admin_worker(
    task_pk: int,
    *,
    admin_id: int | None = None,
    countdown: int = 0,
) -> None:
    """Route a single task to one of an admin's worker queues."""
    from apps.campaigns.tasks import dispatch_message

    queue_name = _pick_worker_queue(admin_id, task_pk) if admin_id else "wa-worker-0"
    dispatch_message.apply_async(args=[task_pk], queue=queue_name, countdown=countdown)


def _pick_worker_queue(admin_id: int | None, seed: int) -> str:
    """Pick a worker queue from the admin's pool using round-robin.

    Falls back to wa-worker-0 if the admin has no active workers.
    """
    if admin_id is None:
        return "wa-worker-0"

    worker_ids = get_worker_ids_for_admin(admin_id)
    if not worker_ids:
        return "wa-worker-0"

    # Use seed for deterministic but spread-out assignment
    chosen = worker_ids[seed % len(worker_ids)]
    return f"wa-worker-{chosen}"
