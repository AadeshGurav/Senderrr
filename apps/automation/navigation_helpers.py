"""WhatsApp Web load and chat-search navigation helpers."""

from __future__ import annotations

import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from django.conf import settings
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.automation.browser_manager import resolve_user_data_dir
from apps.automation.safety_guards import capture_screenshot
from utils.config import get_config

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)

WHATSAPP_WEB_URL = "https://web.whatsapp.com"


def _apply_anti_ban_jitter() -> None:
    """Sleep a random duration between sends with progressive scaling."""
    from apps.automation.rate_limiter import get_hourly_count

    batch_size = getattr(settings, "AUTOMATION_BATCH_SIZE", 50)
    multiplier = getattr(settings, "AUTOMATION_JITTER_MULTIPLIER", 1.5)
    batches_completed = get_hourly_count() // batch_size
    scale = multiplier**batches_completed

    jitter_min = get_config("AUTOMATION_JITTER_MIN", float) * scale
    jitter_max = get_config("AUTOMATION_JITTER_MAX", float) * scale

    delay = random.uniform(jitter_min, jitter_max)
    logger.debug("Anti-ban jitter: sleeping %.1fs (scale=%.1fx)", delay, scale)
    time.sleep(delay)


def _write_session_status(logged_in: bool) -> None:
    """Write WhatsApp session status to a JSON file for the dashboard."""
    worker_id = int(os.environ.get("WA_WORKER_ID", "0"))
    user_data_dir = resolve_user_data_dir(worker_id)
    status_file = Path(user_data_dir) / "status.json"
    try:
        status_file.write_text(
            json.dumps(
                {
                    "logged_in": logged_in,
                    "worker_id": worker_id,
                    "checked_at": datetime.now(tz=timezone.utc).isoformat(),
                }
            )
        )
    except OSError:
        logger.debug("Could not write session status file.")


def _ensure_whatsapp_loaded(page: "Page", load_timeout: int = 120_000) -> None:
    """Ensure WhatsApp Web is open and the chat list is fully rendered.

    Navigates to WhatsApp Web if not already there, then waits for the
    search box to confirm the UI is ready. If the chat list has not rendered
    (e.g. first load stalled), a page reload is attempted before giving up.

    Args:
        page: Active Playwright page.
        load_timeout: Max ms to wait for the search box. Use a lower value
            (e.g. 30_000) for health probes so workers are not blocked for
            the full 120 s each heartbeat cycle.
    """
    from apps.automation.selector_registry import find_element_resilient

    navigated = False
    if WHATSAPP_WEB_URL not in page.url:
        logger.info("Navigating to WhatsApp Web …")
        page.goto(WHATSAPP_WEB_URL, wait_until="domcontentloaded", timeout=60_000)
        navigated = True

    el = find_element_resilient(page, "search_box", timeout=load_timeout)
    if el:
        _write_session_status(logged_in=True)
        if navigated:
            logger.info("WhatsApp Web loaded.")
        return

    capture_screenshot(page, "whatsapp_load_timeout")
    logger.warning(
        "WhatsApp Web search box not visible after %dms — trying reload.", load_timeout
    )
    page.reload(wait_until="domcontentloaded", timeout=60_000)

    el = find_element_resilient(page, "search_box", timeout=load_timeout)
    if el:
        _write_session_status(logged_in=True)
        logger.info("WhatsApp Web loaded after reload.")
        return

    capture_screenshot(page, "whatsapp_load_timeout_after_reload")
    _write_session_status(logged_in=False)
    raise PlaywrightTimeout("WhatsApp Web search box not found after reload.")


def _click_chat_row(page: "Page", group_name: str) -> bool:
    """Click the search-result row for *group_name* using Playwright's native click.

    Playwright's `.click()` dispatches full pointer-event sequences (mousedown,
    mouseup, click) at real pixel coordinates, which triggers React's synthetic
    event handlers.  Plain JS ``element.click()`` only fires a synthetic DOM
    click event and is consistently ignored by WhatsApp Web's React SPA.

    Tries three scopes in order:
    1. ``#pane-side span[title="<name>"]`` — normal chat list
    2. ``span[title="<name>"]`` — broader fallback (e.g. pinned chats above pane-side)
    3. Mouse click at the span's bounding-box centre — last-resort for pointer-only listeners

    Returns ``True`` if a click was attempted (not guaranteed to open chat).
    """
    selectors = [
        f'#pane-side span[title="{group_name}"]',
        f'span[title="{group_name}"]',
    ]
    for sel in selectors:
        loc = page.locator(sel).first
        try:
            loc.wait_for(state="visible", timeout=2_000)
            loc.click()
            logger.info("Clicked chat row for '%s' via locator (%s)", group_name, sel)
            return True
        except PlaywrightTimeout:
            continue
        except Exception:
            continue

    # Bounding-box fallback — works even when `.click()` raises for off-screen elements
    for sel in selectors:
        try:
            box = page.locator(sel).first.bounding_box(timeout=2_000)
            if box:
                page.mouse.click(
                    box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
                )
                logger.info(
                    "Clicked chat row for '%s' via mouse.click (bbox fallback)",
                    group_name,
                )
                return True
        except Exception:
            continue

    logger.warning("Could not locate span[title] for group: %s", group_name)
    return False


def _search_and_open_chat(page: "Page", group_name: str) -> bool:
    """Search for a group by name and click into its chat.

    Returns ``True`` if the chat was opened successfully.
    """
    from apps.automation.compose_helpers import _find_compose_box, _type_slowly
    from apps.automation.selector_registry import find_element_resilient

    try:
        search_box = find_element_resilient(page, "search_box", timeout=10_000)
        if search_box is None:
            return False
        search_box.click()

        search_input = find_element_resilient(page, "search_input", timeout=5_000)
        if search_input is None:
            return False
        # Triple-click selects all text cross-platform (no Control/Meta ambiguity)
        search_input.click(click_count=3)
        search_input.press("Backspace")
        time.sleep(0.3)
        _type_slowly(search_input, group_name)
        time.sleep(3)

        try:
            page.wait_for_selector(f'span[title="{group_name}"]', timeout=10_000)
        except PlaywrightTimeout:
            logger.warning("Timed out searching for group: %s", group_name)
            return False

        capture_screenshot(page, f"search_results_{group_name}")

        if not _click_chat_row(page, group_name):
            return False

        time.sleep(1)

        try:
            page.wait_for_selector("#main", timeout=8_000)
        except PlaywrightTimeout:
            logger.warning(
                "Chat panel (#main) did not appear after clicking: %s", group_name
            )
            return False

        compose = _find_compose_box(page)
        if compose is None:
            logger.warning(
                "Compose box missing after clicking %s — group info may have opened.",
                group_name,
            )
            return False
        compose.click()
        time.sleep(0.3)
        return True

    except PlaywrightTimeout:
        logger.warning("Timed out searching for group: %s", group_name)
        return False
    except Exception as exc:
        logger.error("Error opening chat %s: %s", group_name, exc, exc_info=True)
        return False
