"""Management command — retry failed message tasks."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.campaigns.models import MessageTask


class Command(BaseCommand):
    """Re-queue failed MessageTasks that haven't exceeded max attempts."""

    help = "Retry failed message tasks (optionally for a specific broadcast)."

    def add_arguments(self, parser) -> None:  # noqa: ANN001
        """Define CLI arguments."""
        parser.add_argument(
            "--broadcast",
            type=int,
            default=None,
            help="Limit to a specific broadcast PK.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be retried without executing.",
        )

    def handle(self, *args: object, **options: object) -> None:
        """Execute the command."""
        broadcast_pk: int | None = options["broadcast"]
        dry_run: bool = options["dry_run"]
        max_attempts = getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)

        qs = MessageTask.objects.filter(
            status=MessageTask.Status.FAILED,
            attempt_count__lt=max_attempts,
            group__is_active=True,
            group__is_healthy=True,
        )
        if broadcast_pk is not None:
            qs = qs.filter(broadcast_id=broadcast_pk)

        total = qs.count()

        if dry_run:
            self.stdout.write(f"Would retry {total} failed task(s).")
            for task in qs.select_related("group")[:20]:
                self.stdout.write(
                    f"  - Msg #{task.pk} → {task.group.name} "
                    f"(attempts={task.attempt_count})"
                )
            if total > 20:
                self.stdout.write(f"  ... and {total - 20} more")
            return

        if total == 0:
            self.stdout.write("No eligible failed tasks to retry.")
            return

        from apps.campaigns.tasks import retry_failed_messages

        result = retry_failed_messages.delay(broadcast_pk)
        self.stdout.write(
            f"Dispatched retry task (id={result.id}) for {total} failed task(s)."
        )
