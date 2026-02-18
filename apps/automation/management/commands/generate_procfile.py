"""Management command — generate a Procfile based on worker count."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from utils.config import get_config

PROCFILE_PATH = Path(settings.BASE_DIR) / "Procfile"


class Command(BaseCommand):
    """Generate ``Procfile`` with one Celery worker per browser session.

    Worker 0 consumes from both the default ``celery`` queue and its
    own ``wa-worker-0`` queue.  Workers 1..N only consume from their
    dedicated ``wa-worker-N`` queue.

    Usage::

        python manage.py generate_procfile
    """

    help = "Generate a Procfile based on AUTOMATION_WORKER_COUNT."

    def handle(self, *args: object, **options: object) -> str:
        """Write the Procfile and print a summary."""
        worker_count = min(int(get_config("AUTOMATION_WORKER_COUNT", int)), 4)

        lines = [
            "web: gunicorn core.wsgi:application --bind 0.0.0.0:8000 "
            "--workers 2 --access-logfile -",
        ]

        for wid in range(worker_count):
            queues = f"celery,wa-worker-{wid}" if wid == 0 else f"wa-worker-{wid}"
            line = (
                f"worker{wid}: WA_WORKER_ID={wid} "
                f"celery -A core worker -l info --pool=solo "
                f"-Q {queues} -n wa-worker-{wid}@%h "
                f"--max-tasks-per-child=50"
            )
            lines.append(line)

        lines.append("beat: celery -A core beat -l info")

        PROCFILE_PATH.write_text("\n".join(lines) + "\n")

        self.stdout.write(
            self.style.SUCCESS(
                f"Procfile generated with {worker_count} worker(s)."
            )
        )
        return f"Procfile generated ({worker_count} workers)"
