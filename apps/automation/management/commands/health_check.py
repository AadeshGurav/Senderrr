"""Management command to verify all system components are operational."""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.management.base import BaseCommand

if TYPE_CHECKING:
    from collections.abc import Callable


class Command(BaseCommand):
    """Run a health check on all system components.

    Checks:
        1. Django database connectivity
        2. Redis broker connectivity
        3. Celery worker availability
        4. Playwright browser installation
        5. Scraper target URL reachability
        6. WhatsApp group configuration

    Usage::

        python manage.py health_check
    """

    help = "Verify that all system components are operational."

    def handle(self, *args: object, **options: object) -> str:
        """Execute all health checks and report results."""
        self.stdout.write(
            self.style.MIGRATE_HEADING("\nWhatsApp Automation — Health Check")
        )
        self.stdout.write("=" * 50)

        checks: list[tuple[str, Callable[[], None]]] = [
            ("Django Database", self._check_database),
            ("Redis Broker", self._check_redis),
            ("Celery Worker", self._check_celery_worker),
            ("Playwright Browser", self._check_playwright),
            ("Scraper Target URL", self._check_scraper_url),
            ("WhatsApp Groups", self._check_groups),
        ]

        results: list[tuple[str, bool]] = []
        for name, check_fn in checks:
            passed = self._run_check(name, check_fn)
            results.append((name, passed))

        self.stdout.write("=" * 50)
        passed_count = sum(1 for _, ok in results if ok)
        total = len(results)

        if passed_count == total:
            self.stdout.write(
                self.style.SUCCESS(f"\nAll {total} checks passed. System is ready.\n")
            )
            return "All checks passed"

        failed = [name for name, ok in results if not ok]
        self.stdout.write(
            self.style.ERROR(
                f"\n{passed_count}/{total} checks passed. "
                f"Failed: {', '.join(failed)}\n"
            )
        )
        sys.exit(1)

    def _run_check(self, name: str, check_fn: Callable[[], None]) -> bool:
        """Execute a single check and print the result."""
        self.stdout.write(f"  {name:<30}", ending="")
        try:
            check_fn()
            self.stdout.write(self.style.SUCCESS("OK"))
            return True
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"FAIL — {exc}"))
            return False

    def _check_database(self) -> None:
        """Verify Django can reach the database."""
        from django.db import connection

        connection.ensure_connection()

    def _check_redis(self) -> None:
        """Verify Redis is reachable at the configured broker URL."""
        import redis as redis_lib

        url = settings.CELERY_BROKER_URL
        client = redis_lib.Redis.from_url(url, socket_timeout=5)
        if not client.ping():
            raise ConnectionError(f"Redis did not respond at {url}")

    def _check_celery_worker(self) -> None:
        """Verify at least one Celery worker is online."""
        from core.celery import app

        inspector = app.control.inspect(timeout=5)
        ping_result = inspector.ping()
        if not ping_result:
            raise RuntimeError(
                "No workers responded. Start one with: honcho start"
            )

    def _check_playwright(self) -> None:
        """Verify Playwright Chromium is installed."""
        from playwright.sync_api import sync_playwright

        pw = sync_playwright().start()
        try:
            executable = pw.chromium.executable_path
            if not executable:
                raise FileNotFoundError("Chromium executable not found")
        finally:
            pw.stop()

    def _check_scraper_url(self) -> None:
        """Verify the scraper target URL is reachable."""
        import requests

        url = settings.SCRAPER_TARGET_URL
        if url == "https://example.com/articles":
            raise ValueError(
                "Still using placeholder URL. Set SCRAPER_TARGET_URL in .env"
            )
        response = requests.head(url, timeout=10, allow_redirects=True)
        response.raise_for_status()

    def _check_groups(self) -> None:
        """Verify at least one active WhatsApp group is configured."""
        from apps.campaigns.models import WhatsAppGroup

        active_count = WhatsAppGroup.objects.filter(is_active=True).count()
        if active_count == 0:
            raise RuntimeError(
                "No active groups. "
                'Add one with: python manage.py add_group "Group Name"'
            )
