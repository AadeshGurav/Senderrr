"""Management command — unified entry point for WhatsApp Automation."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

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
    'div[data-ref]',
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
        self._check_whatsapp_session()

        self.stdout.write(self.style.SUCCESS("\nAll checks passed. Starting services..."))
        self.stdout.write("Dashboard: http://localhost:8000\n")

        os.execvp("honcho", ["honcho", "start"])
        return "Started"

    def _ensure_superuser(self) -> None:
        """Prompt to create a superuser if none exist."""
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write("Superuser exists.")
            return

        self.stdout.write(self.style.WARNING("\nNo superuser found — creating one now."))
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
                self.stdout.write(self.style.ERROR("Password must be at least 8 characters."))
                continue
            pw2 = getpass.getpass("Confirm password: ")
            if pw != pw2:
                self.stdout.write(self.style.ERROR("Passwords don't match. Try again."))
                continue
            return pw

    def _check_whatsapp_session(self) -> None:
        """Open browser, verify session or wait for QR scan, then close.

        Single non-headless browser — WhatsApp Web blocks headless
        Chromium, so we always launch visible. If the session is valid
        the chat list appears in a few seconds and we close immediately.
        If not, the QR code is shown and we wait up to 5 minutes.
        """
        from playwright.sync_api import sync_playwright

        user_data_dir = settings.PLAYWRIGHT_USER_DATA_DIR
        Path(user_data_dir).mkdir(parents=True, exist_ok=True)

        self.stdout.write("\nChecking WhatsApp session...")

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

        # Phase 1: quick check (30s) — enough for a valid session to load.
        state = self._detect_login_state(page, timeout_ms=30_000)

        if state == "logged_in":
            self.stdout.write(self.style.SUCCESS("WhatsApp session is valid."))
            self._write_status(user_data_dir, logged_in=True)
            ctx.close()
            pw.stop()
            return

        if state == "qr":
            self.stdout.write(self.style.WARNING("Session expired — scan the QR code now."))
        else:
            self.stdout.write(self.style.WARNING("Waiting for WhatsApp to load..."))

        # Phase 2: wait for login (5 min).
        self.stdout.write("Waiting up to 5 minutes...\n")
        state = self._detect_login_state(page, timeout_ms=300_000)

        if state == "logged_in":
            self.stdout.write(self.style.SUCCESS("Logged in successfully!"))
            self._write_status(user_data_dir, logged_in=True)
        else:
            self._write_status(user_data_dir, logged_in=False)
            ctx.close()
            pw.stop()
            self.stdout.write(self.style.ERROR("Login timed out. Run 'make start' again."))
            sys.exit(1)

        ctx.close()
        pw.stop()

    def _detect_login_state(
        self, page: object, *, timeout_ms: int
    ) -> str:
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

    def _write_status(self, user_data_dir: str, *, logged_in: bool) -> None:
        """Write session status JSON for the dashboard to read."""
        status_file = Path(user_data_dir) / "status.json"
        status_file.write_text(
            json.dumps(
                {
                    "logged_in": logged_in,
                    "checked_at": datetime.now(tz=timezone.utc).isoformat(),
                }
            )
        )
