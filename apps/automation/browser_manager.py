"""Singleton Playwright browser manager with per-worker session isolation.

Maintains a single persistent Chromium context backed by a user-data
directory so WhatsApp Web stays logged in across restarts.  Each Celery
worker process gets its own singleton bound to a worker-specific session.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from playwright.sync_api import Browser, BrowserContext, Page, Playwright

logger = logging.getLogger(__name__)


def resolve_user_data_dir(worker_id: int) -> str:
    """Return the session directory for a given worker.

    New layout (admin-aware):
        ``{base}/admin_{admin_id}/session_{session_index}``

    Falls back to legacy layout when admin mapping is unavailable
    (e.g. during initial setup before any admins are created).
    """
    base = settings.PLAYWRIGHT_USER_DATA_DIR

    try:
        admin_id = int(os.environ.get("WA_ADMIN_ID", "-1"))
    except ValueError:
        logger.error("Invalid WA_ADMIN_ID env var: %r — falling back to legacy path.", os.environ.get("WA_ADMIN_ID"))
        admin_id = -1
    if admin_id >= 0:
        session_idx = int(os.environ.get("WA_SESSION_INDEX", "0"))
        return str(Path(base) / f"admin_{admin_id}" / f"session_{session_idx}")

    # Legacy fallback for backward compatibility
    if worker_id == 0:
        return base
    return f"{base}_worker_{worker_id}"


class PlaywrightBrowserManager:
    """Thread-safe Singleton that owns one Playwright browser lifecycle.

    Usage::

        manager = PlaywrightBrowserManager()
        page = manager.get_page()
        page.goto("https://web.whatsapp.com")
        # ... interact ...
        manager.shutdown()

    The session is persisted via ``user_data_dir`` so QR-code scanning
    only happens once (unless the directory is deleted).  The
    ``WA_WORKER_ID`` environment variable selects which session dir
    to use (set automatically by the Procfile).
    """

    _instance: PlaywrightBrowserManager | None = None
    _lock: threading.Lock = threading.Lock()

    def __new__(cls) -> PlaywrightBrowserManager:
        """Ensure only one instance exists (Singleton pattern)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._initialized = False
                    cls._instance = instance
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._worker_id: int = int(os.environ.get("WA_WORKER_ID", "0"))
        self._initialized = True
        logger.info(
            "PlaywrightBrowserManager singleton created (worker_id=%d).",
            self._worker_id,
        )

    @property
    def worker_id(self) -> int:
        """Return the worker ID this manager is bound to."""
        return self._worker_id

    def get_page(self) -> Page:
        """Return a ready-to-use Page, launching the browser if needed.

        Automatically recovers from a closed or crashed browser by
        re-initializing the entire stack.
        """
        with self._lock:
            if self._is_alive():
                assert self._page is not None
                return self._page
            return self._launch()

    def _is_alive(self) -> bool:
        """Check whether the current browser context is still usable."""
        if self._page is None or self._context is None:
            return False
        try:
            self._page.evaluate("() => true")
            return True
        except Exception:
            logger.warning("Browser context is dead — will restart.")
            self._teardown_unsafe()
            return False

    def _launch(self) -> Page:
        """Start Playwright, launch Chromium, and open a blank page."""
        from playwright.sync_api import sync_playwright

        logger.info("Launching Playwright browser …")
        self._playwright = sync_playwright().start()

        user_data_dir = resolve_user_data_dir(self._worker_id)
        Path(user_data_dir).mkdir(parents=True, exist_ok=True)
        headless = settings.PLAYWRIGHT_HEADLESS

        self._context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=headless,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )

        self._page = (
            self._context.pages[0] if self._context.pages else self._context.new_page()
        )
        logger.info(
            "Browser launched (worker=%d, headless=%s, data=%s).",
            self._worker_id,
            headless,
            user_data_dir,
        )
        return self._page

    def shutdown(self) -> None:
        """Gracefully close all Playwright resources."""
        with self._lock:
            self._teardown_unsafe()
            logger.info("Browser manager shut down.")

    def _teardown_unsafe(self) -> None:
        """Close resources without acquiring the lock (caller must hold it)."""
        for resource_name, resource in [
            ("context", self._context),
            ("playwright", self._playwright),
        ]:
            if resource is not None:
                try:
                    resource.close()
                except Exception as exc:
                    logger.debug("Error closing %s: %s", resource_name, exc)

        self._page = None
        self._context = None
        self._browser = None
        self._playwright = None
