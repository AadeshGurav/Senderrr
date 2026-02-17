"""Celery application factory for the WhatsApp Automation project."""

from __future__ import annotations

import os
from pathlib import Path

from celery import Celery


def _load_dotenv() -> None:
    """Load .env file if python-dotenv is installed and .env exists.

    Duplicated from manage.py because Celery workers start via the
    ``celery`` CLI and do not go through manage.py.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
    except ImportError:
        pass


_load_dotenv()

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Python 3.12+ changed asyncio event loop detection, causing Django's
# async safety check to falsely flag Celery's synchronous prefork workers
# as async contexts.  This is safe — the worker is genuinely synchronous.
os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")

app = Celery("whatsapp_automation")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


from celery.signals import worker_shutdown  # noqa: E402


@worker_shutdown.connect
def _shutdown_browser(**kwargs: object) -> None:  # noqa: ARG001
    """Close the Playwright browser when the Celery worker stops.

    Without this, Ctrl+C kills the worker mid-task, leaving orphaned
    Chrome processes and causing ``TargetClosedError`` in flight.
    """
    try:
        from apps.automation.browser_manager import PlaywrightBrowserManager

        manager = PlaywrightBrowserManager()
        if manager._initialized and manager._page is not None:
            manager.shutdown()
    except Exception:
        pass
