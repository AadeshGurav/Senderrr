"""Management command to open WhatsApp Web for QR-code login."""

from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Launch Chromium, navigate to WhatsApp Web, and wait for QR scan.

    This must be run **before** starting the worker so the persistent
    browser session is authenticated.  Once logged in, the session is
    saved to ``PLAYWRIGHT_USER_DATA_DIR`` and survives restarts.

    Usage::

        python manage.py login
    """

    help = "Open WhatsApp Web in Chromium so you can scan the QR code."

    def handle(self, *args: object, **options: object) -> str:
        """Open browser, wait for login, then shut down cleanly."""
        from playwright.sync_api import TimeoutError as PlaywrightTimeout

        from apps.automation.browser_manager import PlaywrightBrowserManager

        self.stdout.write(self.style.MIGRATE_HEADING("\nWhatsApp Web Login"))
        self.stdout.write("=" * 50)
        self.stdout.write(
            "Opening Chromium — scan the QR code in the browser window.\n"
            "Once logged in, press Ctrl+C or close the browser.\n"
        )

        manager = PlaywrightBrowserManager()
        page = manager.get_page()

        page.goto(
            "https://web.whatsapp.com",
            wait_until="domcontentloaded",
            timeout=60_000,
        )

        self.stdout.write("Waiting for WhatsApp to load (up to 5 minutes)...")
        self.stdout.write("Scan the QR code with your phone now.\n")

        logged_in_css = ", ".join([
            '[data-testid="chat-list-search"]',
            'div[role="textbox"][data-tab="3"]',
            "#side",
        ])
        try:
            page.wait_for_selector(logged_in_css, timeout=300_000)
        except PlaywrightTimeout:
            self.stdout.write(
                self.style.ERROR("Timed out waiting for login. Try again.")
            )
            manager.shutdown()
            return "Login timed out"

        self.stdout.write(self.style.SUCCESS("\nLogged in successfully!"))
        self.stdout.write(
            "Session saved. You can now start the worker with: honcho start\n"
        )

        manager.shutdown()
        return "Login complete"
