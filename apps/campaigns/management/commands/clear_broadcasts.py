"""Management command to clear all broadcast history and queued tasks."""

from __future__ import annotations

import redis
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.campaigns.models import BroadcastEvent, MessageAttempt, MessageTask


class Command(BaseCommand):
    """Delete all broadcast DB records and purge Celery queues."""

    help = "Clear all broadcast history (DB + Redis queues)."

    def add_arguments(self, parser) -> None:  # noqa: ANN001
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip confirmation prompt.",
        )

    def handle(self, *args: object, **options: object) -> str:
        if not options["yes"]:
            confirm = input(
                "This will delete ALL broadcast data "
                "(DB records + queued Celery tasks). Continue? [y/N] "
            )
            if confirm.lower() != "y":
                self.stdout.write("Aborted.")
                return "Aborted"

        # --- Clear DB ---
        attempt_count = MessageAttempt.objects.count()
        task_count = MessageTask.objects.count()
        event_count = BroadcastEvent.objects.count()

        MessageAttempt.objects.all().delete()
        MessageTask.objects.all().delete()
        BroadcastEvent.objects.all().delete()

        db_summary = (
            f"DB: deleted {attempt_count} attempts, "
            f"{task_count} tasks, {event_count} events."
        )
        self.stdout.write(self.style.SUCCESS(db_summary))

        # --- Purge Redis queues ---
        broker_url = getattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")
        r = redis.Redis.from_url(broker_url)

        queues = ["celery", "wa-worker-0", "wa-worker-1", "wa-worker-2", "wa-worker-3"]
        purged = 0
        for q in queues:
            purged += r.delete(q)

        # Clear unacked tasks (acks_late redelivery backlog)
        r.delete("unacked", "unacked_index")

        # Clear stale rate-limiter keys
        for key in r.keys("wa:rate:*"):
            r.delete(key)

        queue_summary = f"Redis: purged {purged} queue(s), cleared unacked + rate keys."
        self.stdout.write(self.style.SUCCESS(queue_summary))

        return f"{db_summary} {queue_summary}"
