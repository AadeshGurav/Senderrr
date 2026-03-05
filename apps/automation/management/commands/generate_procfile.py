"""Management command — generate a Procfile based on admin accounts."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.automation.worker_mapping import build_worker_map

PROCFILE_PATH = Path(settings.BASE_DIR) / "Procfile"


class Command(BaseCommand):
    """Generate ``Procfile`` with one Celery worker per browser session.

    Reads active AdminAccounts and creates one worker per session slot.
    Worker 0 also consumes from the default ``celery`` queue.

    Usage::

        python manage.py generate_procfile
    """

    help = "Generate a Procfile from active admin accounts."

    def handle(self, *args: object, **options: object) -> str:
        """Write the Procfile and print a summary."""
        slots = build_worker_map()

        if not slots:
            self.stdout.write(
                self.style.WARNING(
                    "No active admin accounts — generating single-worker fallback."
                )
            )
            return self._write_fallback()

        lines = [
            "web: gunicorn core.wsgi:application --bind 0.0.0.0:8000 "
            "--workers 2 --access-logfile -",
        ]

        for slot in slots:
            queues = (
                f"celery,{slot.queue_name}" if slot.worker_id == 0 else slot.queue_name
            )
            line = (
                f"worker{slot.worker_id}: "
                f"WA_WORKER_ID={slot.worker_id} "
                f"WA_ADMIN_ID={slot.admin_id} "
                f"WA_SESSION_INDEX={slot.session_index} "
                f"celery -A core worker -l info --pool=solo "
                f"-Q {queues} -n wa-worker-{slot.worker_id}@%h "
                f"--max-tasks-per-child=50"
            )
            lines.append(line)

        lines.append("beat: celery -A core beat -l info")
        PROCFILE_PATH.write_text("\n".join(lines) + "\n")

        admin_count = len({s.admin_id for s in slots})
        self.stdout.write(
            self.style.SUCCESS(
                f"Procfile generated: {len(slots)} worker(s) "
                f"across {admin_count} admin(s)."
            )
        )
        return f"Procfile generated ({len(slots)} workers)"

    def _write_fallback(self) -> str:
        """Write a minimal single-worker Procfile."""
        lines = [
            "web: gunicorn core.wsgi:application --bind 0.0.0.0:8000 "
            "--workers 2 --access-logfile -",
            "worker0: WA_WORKER_ID=0 WA_ADMIN_ID=-1 WA_SESSION_INDEX=0 "
            "celery -A core worker -l info --pool=solo "
            "-Q celery,wa-worker-0 -n wa-worker-0@%h "
            "--max-tasks-per-child=50",
            "beat: celery -A core beat -l info",
        ]
        PROCFILE_PATH.write_text("\n".join(lines) + "\n")
        self.stdout.write(self.style.SUCCESS("Fallback Procfile generated (1 worker)."))
        return "Fallback Procfile generated"
