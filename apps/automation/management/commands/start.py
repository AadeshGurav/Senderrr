"""Management command — unified entry point for WhatsApp Automation."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.automation.browser_manager import resolve_user_data_dir
from utils.config import get_config

User = get_user_model()

WHATSAPP_WEB_URL = "https://web.whatsapp.com"

# Multiple selectors to detect a logged-in session — covers both
# WhatsApp personal and WhatsApp Business Web.
LOGGED_IN_SELECTORS = [
    '[data-testid="chat-list-search"]',
    '[data-testid="chatlist-header"]',
    '[data-testid="chat-list"]',
    'div[role="textbox"][data-tab="3"]',
    "#side",
]

# QR / landing page selectors — presence means NOT logged in.
QR_SELECTORS = [
    '[data-testid="qrcode"]',
    "canvas[aria-label]",
    "div[data-ref]",
]


class Command(BaseCommand):
    """All-in-one start: ensure superuser, check session, launch services.

    Usage::

        python manage.py start
    """

    help = "Check WhatsApp session, ensure superuser exists, then start all services."

    def handle(self, *args: object, **options: object) -> str:
        """Run pre-flight checks then exec into honcho."""
        self.stdout.write(self.style.MIGRATE_HEADING("\nWhatsApp Automation — Start"))
        self.stdout.write("=" * 50)

        self._ensure_superuser()

        worker_count = min(int(get_config("AUTOMATION_WORKER_COUNT", int)), 4)
        for wid in range(worker_count):
            self._check_worker_session(wid)

        call_command("generate_procfile")
        call_command("collectstatic", "--noinput", verbosity=0)

        self.stdout.write(
            self.style.SUCCESS("\nAll checks passed. Starting services...")
        )
        self.stdout.write("Dashboard: http://localhost:8000\n")

        self._kill_stale_services()
        os.execvp("honcho", ["honcho", "start"])
        return "Started"

    def _ensure_superuser(self) -> None:
        """Prompt to create a superuser if none exist."""
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write("Superuser exists.")
            return

        self.stdout.write(
            self.style.WARNING("\nNo superuser found — creating one now.")
        )
        self.stdout.write("This account is used to log in to the dashboard.\n")

        username = input("Username [admin]: ").strip() or "admin"
        password = self._prompt_password()

        User.objects.create_superuser(username=username, password=password)
        self.stdout.write(self.style.SUCCESS(f"Superuser '{username}' created."))

    def _prompt_password(self) -> str:
        """Prompt for a password with confirmation."""
        import getpass

        while True:
            pw = getpass.getpass("Password: ")
            if len(pw) < 8:
                self.stdout.write(
                    self.style.ERROR("Password must be at least 8 characters.")
                )
                continue
            pw2 = getpass.getpass("Confirm password: ")
            if pw != pw2:
                self.stdout.write(self.style.ERROR("Passwords don't match. Try again."))
                continue
            return pw

    def _check_worker_session(self, worker_id: int) -> None:
        """Verify a single worker's WhatsApp session.

        Opens a visible browser to check the session.  If the session is
        expired, prompts the user to scan the QR code (same phone number,
        link as a new device for workers 1+).
        """
        from playwright.sync_api import sync_playwright

        user_data_dir = resolve_user_data_dir(worker_id)
        headless = settings.PLAYWRIGHT_HEADLESS
        Path(user_data_dir).mkdir(parents=True, exist_ok=True)

        self._kill_stale_browsers(user_data_dir)

        label = f"Worker {worker_id}" if worker_id > 0 else "WhatsApp"
        self.stdout.write(f"\nChecking {label} session...")

        pw = sync_playwright().start()
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=headless,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(WHATSAPP_WEB_URL, wait_until="domcontentloaded", timeout=60_000)

        state = self._detect_login_state(page, timeout_ms=30_000)

        if state == "logged_in":
            self.stdout.write(self.style.SUCCESS(f"{label} session is valid."))
            self._write_status(user_data_dir, worker_id=worker_id, logged_in=True)
            ctx.close()
            pw.stop()
            time.sleep(2)
            self._kill_stale_browsers(user_data_dir)
            return

        # Need QR scan — reopen as visible if currently headless
        if headless:
            ctx.close()
            pw.stop()
            self.stdout.write(f"{label} needs QR scan — opening visible browser...")
            self._kill_stale_browsers(user_data_dir)
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

        hint = " (same phone — link as new device)" if worker_id > 0 else ""
        self.stdout.write(
            self.style.WARNING(f"{label} session expired — scan QR code now.{hint}")
        )
        self.stdout.write("Waiting up to 5 minutes...\n")

        logged_in = self._wait_for_login(page, timeout_ms=300_000)

        if logged_in:
            self.stdout.write(self.style.SUCCESS(f"{label} logged in successfully!"))
            self._write_status(user_data_dir, worker_id=worker_id, logged_in=True)
        else:
            self._write_status(user_data_dir, worker_id=worker_id, logged_in=False)
            self.stdout.write(
                self.style.ERROR(f"{label} login timed out. Run 'make start' again.")
            )
            ctx.close()
            pw.stop()
            sys.exit(1)

        ctx.close()
        pw.stop()

    def _wait_for_login(self, page: object, *, timeout_ms: int) -> bool:
        """Wait for logged-in selectors only (for QR scan phase).

        Unlike ``_detect_login_state``, this ignores QR selectors that
        are already visible and blocks until a chat-list element appears.

        Returns:
            ``True`` if login detected, ``False`` on timeout.
        """
        logged_in_css = ", ".join(LOGGED_IN_SELECTORS)
        try:
            page.wait_for_selector(logged_in_css, timeout=timeout_ms)
            return True
        except Exception:
            return False

    def _detect_login_state(self, page: object, *, timeout_ms: int) -> str:
        """Wait for either logged-in or QR selectors to appear.

        Returns:
            ``"logged_in"``, ``"qr"``, or ``"unknown"``.
        """
        logged_in_css = ", ".join(LOGGED_IN_SELECTORS)
        qr_css = ", ".join(QR_SELECTORS)
        combined = f"{logged_in_css}, {qr_css}"

        try:
            page.wait_for_selector(combined, timeout=timeout_ms)
        except Exception:
            return "unknown"

        for sel in LOGGED_IN_SELECTORS:
            if page.query_selector(sel):
                return "logged_in"
        for sel in QR_SELECTORS:
            if page.query_selector(sel):
                return "qr"
        return "unknown"

    def _kill_stale_browsers(self, user_data_dir: str) -> None:
        """Kill any leftover Chrome processes and remove lock files."""
        try:
            subprocess.run(
                ["pkill", "-f", f"user-data-dir={user_data_dir}"],
                capture_output=True,
                timeout=5,
            )
        except Exception:
            pass

        for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
            lock = Path(user_data_dir) / name
            lock.unlink(missing_ok=True)

    def _kill_stale_services(self) -> None:
        """Kill leftover Django/Celery processes from a previous run."""
        for cmd in (
            ["lsof", "-ti", ":8000"],
            ["pgrep", "-f", "celery.*worker"],
            ["pgrep", "-f", "celery.*beat"],
        ):
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                pids = result.stdout.strip().split()
                for pid in pids:
                    if pid.isdigit() and int(pid) != os.getpid():
                        subprocess.run(
                            ["kill", "-9", pid],
                            capture_output=True,
                            timeout=5,
                        )
            except Exception:
                continue

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
