"""Management command to open WhatsApp Web for QR-code login."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.automation.browser_manager import resolve_user_data_dir
from utils.config import get_config

WHATSAPP_WEB_URL = "https://web.whatsapp.com"

LOGGED_IN_SELECTORS = [
    '[data-testid="chat-list-search"]',
    '[data-testid="chatlist-header"]',
    '[data-testid="chat-list"]',
    'div[role="textbox"][data-tab="3"]',
    "#side",
]


class Command(BaseCommand):
    """Launch Chromium, navigate to WhatsApp Web, and wait for QR scan.

    Supports ``--worker-id N`` to log in a specific worker session.
    Without the flag, logs in all configured workers sequentially.

    Usage::

        python manage.py login
        python manage.py login --worker-id 1
    """

    help = "Open WhatsApp Web in Chromium so you can scan the QR code."

    def add_arguments(self, parser: object) -> None:
        """Add --worker-id option."""
        parser.add_argument(
            "--worker-id",
            type=int,
            default=None,
            help="Log in a specific worker (0-based). Omit to log in all.",
        )

    def handle(self, *args: object, **options: object) -> str:
        """Open browser for each worker, wait for login."""
        worker_id = options.get("worker_id")

        if worker_id is not None:
            self._login_worker(worker_id)
            return f"Worker {worker_id} login complete"

        worker_count = min(int(get_config("AUTOMATION_WORKER_COUNT", int)), 4)
        for wid in range(worker_count):
            self._login_worker(wid)
        return f"All {worker_count} worker(s) logged in"

    def _login_worker(self, worker_id: int) -> None:
        """Run the QR-code login flow for a single worker."""
        from playwright.sync_api import TimeoutError as PlaywrightTimeout
        from playwright.sync_api import sync_playwright

        user_data_dir = resolve_user_data_dir(worker_id)
        Path(user_data_dir).mkdir(parents=True, exist_ok=True)

        label = f"Worker {worker_id}" if worker_id > 0 else "WhatsApp"
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{label} Login"))
        self.stdout.write("=" * 50)

        hint = " (same phone — link as new device)" if worker_id > 0 else ""
        self.stdout.write(
            f"Opening Chromium — scan the QR code.{hint}\n"
            "Once logged in, press Ctrl+C or close the browser.\n"
        )

        pw = sync_playwright().start()
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(WHATSAPP_WEB_URL, wait_until="domcontentloaded", timeout=60_000)

        self.stdout.write("Waiting for WhatsApp to load (up to 5 minutes)...")
        self.stdout.write("Scan the QR code with your phone now.\n")

        logged_in_css = ", ".join(LOGGED_IN_SELECTORS)
        try:
            page.wait_for_selector(logged_in_css, timeout=300_000)
        except PlaywrightTimeout:
            self.stdout.write(
                self.style.ERROR(f"{label} login timed out. Try again.")
            )
            ctx.close()
            pw.stop()
            return

        self.stdout.write(self.style.SUCCESS(f"\n{label} logged in successfully!"))
        self._write_status(user_data_dir, worker_id=worker_id, logged_in=True)

        ctx.close()
        pw.stop()

    def _write_status(
        self, user_data_dir: str, *, worker_id: int, logged_in: bool
    ) -> None:
        """Write session status JSON for the dashboard to read."""
        status_file = Path(user_data_dir) / "status.json"
        status_file.write_text(
            json.dumps(
                {
                    "logged_in": logged_in,
                    "worker_id": worker_id,
                    "checked_at": datetime.now(tz=timezone.utc).isoformat(),
                }
            )
        )
