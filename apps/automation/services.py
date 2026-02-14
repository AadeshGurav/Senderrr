"""Automation services — WhatsApp Web message delivery with anti-ban measures."""

from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.automation.browser_manager import PlaywrightBrowserManager
from apps.automation.rate_limiter import check_rate_limit, increment_send_counter
from apps.automation.safety_guards import (
    capture_screenshot,
    check_session_health,
    dump_main_dom,
)
from utils.config import get_config

logger = logging.getLogger(__name__)

WHATSAPP_WEB_URL = "https://web.whatsapp.com"

# WhatsApp Web DOM selectors — ordered from most-specific to broadest.
# WhatsApp frequently changes its DOM; keep multiple fallbacks.
SELECTORS = {
    "search_box": ", ".join([
        '[data-testid="chat-list-search"]',
        'div[role="textbox"][data-tab="3"]',
        "#side header",
    ]),
    "search_input": ", ".join([
        '[data-testid="search-input"]',
        'div[role="textbox"][data-tab="3"]',
    ]),
    "chat_row": ", ".join([
        '[data-testid="cell-frame-container"]',
        '#pane-side div[role="listitem"]',
        '#pane-side div[role="row"]',
    ]),
    "message_input": ", ".join([
        '[data-testid="conversation-compose-box-input"]',
        'div[role="textbox"][data-tab="10"]',
        '#main footer div[contenteditable="true"]',
        'div[role="textbox"][data-tab="1"]',
        '[data-testid="lexical-rich-text-input"]',
        '#main div[contenteditable="true"][role="textbox"]',
        '#main div[contenteditable="true"]',
    ]),
    "send_button": ", ".join([
        '[data-testid="send"]',
        '[data-testid="compose-btn-send"]',
        'button[aria-label="Send"]',
        '#main footer button span[data-icon="send"]',
    ]),
}


def send_message_to_group(group_jid: str, message: str) -> bool:
    """Send a message to a WhatsApp group with human-like behaviour.

    Steps:
        1. Check rate limits (daily/hourly).
        2. Apply anti-ban jitter delay.
        3. Open WhatsApp Web (if not already open).
        4. Verify session health (QR, CAPTCHA, bans).
        5. Search for the group by its name.
        6. Type the message with randomised per-character delay.
        7. Click send and increment rate counters.

    Returns:
        ``True`` on success, ``False`` on recoverable failure.

    Raises:
        RuntimeError: On rate limit exceeded or session issues.
    """
    allowed, reason = check_rate_limit()
    if not allowed:
        raise RuntimeError(f"Rate limit exceeded: {reason}")

    _apply_anti_ban_jitter()

    manager = PlaywrightBrowserManager()
    page = manager.get_page()

    _ensure_whatsapp_loaded(page)

    healthy, issue = check_session_health(page)
    if not healthy:
        raise RuntimeError(f"Session unhealthy: {issue}")

    if not _search_and_open_chat(page, group_jid):
        logger.error("Could not find group: %s", group_jid)
        return False

    _type_message_human_like(page, message)
    _click_send(page)

    increment_send_counter()
    logger.info("Message sent to group: %s", group_jid)
    return True


def _apply_anti_ban_jitter() -> None:
    """Sleep a random duration between sends with progressive scaling.

    Jitter increases as more messages are sent in the current hour,
    making high-volume sends appear more natural over time.
    """
    from apps.automation.rate_limiter import get_hourly_count

    batch_size = getattr(settings, "AUTOMATION_BATCH_SIZE", 50)
    multiplier = getattr(settings, "AUTOMATION_JITTER_MULTIPLIER", 1.5)
    batches_completed = get_hourly_count() // batch_size
    scale = multiplier ** batches_completed

    jitter_min = get_config("AUTOMATION_JITTER_MIN", float) * scale
    jitter_max = get_config("AUTOMATION_JITTER_MAX", float) * scale

    delay = random.uniform(jitter_min, jitter_max)
    logger.debug(
        "Anti-ban jitter: sleeping %.1fs (scale=%.1fx)", delay, scale
    )
    time.sleep(delay)


def _write_session_status(logged_in: bool) -> None:
    """Write WhatsApp session status to a JSON file for the dashboard."""
    status_file = Path(settings.PLAYWRIGHT_USER_DATA_DIR) / "status.json"
    try:
        status_file.write_text(
            json.dumps(
                {
                    "logged_in": logged_in,
                    "checked_at": datetime.now(tz=timezone.utc).isoformat(),
                }
            )
        )
    except OSError:
        logger.debug("Could not write session status file.")


def _ensure_whatsapp_loaded(page) -> None:  # noqa: ANN001
    """Navigate to WhatsApp Web if the page isn't already there."""
    current_url = page.url
    if WHATSAPP_WEB_URL not in current_url:
        logger.info("Navigating to WhatsApp Web …")
        page.goto(WHATSAPP_WEB_URL, wait_until="domcontentloaded", timeout=60_000)
        try:
            page.wait_for_selector(
                SELECTORS["search_box"],
                timeout=120_000,
            )
            _write_session_status(logged_in=True)
        except PlaywrightTimeout:
            _write_session_status(logged_in=False)
            raise
        logger.info("WhatsApp Web loaded.")


def _search_and_open_chat(page, group_name: str) -> bool:  # noqa: ANN001
    """Search for a group by name and click into its chat.

    Returns ``True`` if the chat was opened successfully.
    """
    try:
        search_box = page.wait_for_selector(SELECTORS["search_box"], timeout=10_000)
        search_box.click()

        search_input = page.wait_for_selector(SELECTORS["search_input"], timeout=5_000)
        search_input.fill("")
        _type_slowly(search_input, group_name)

        time.sleep(3)

        # Find the search result that contains the group name
        result = page.locator(
            f'{SELECTORS["chat_row"]} >> text="{group_name}"'
        ).first
        try:
            result.wait_for(state="visible", timeout=10_000)
        except PlaywrightTimeout:
            # Fallback: click any row with matching title attribute
            result = page.locator(f'span[title="{group_name}"]').first
            result.wait_for(state="visible", timeout=5_000)

        result.click()
        time.sleep(2)

        # Verify the chat panel actually loaded
        try:
            page.wait_for_selector("#main", timeout=5_000)
        except PlaywrightTimeout:
            logger.warning(
                "Chat panel (#main) did not appear after clicking: %s", group_name
            )
            return False

        return True
    except PlaywrightTimeout:
        logger.warning("Timed out searching for group: %s", group_name)
        return False
    except Exception as exc:
        logger.error("Error opening chat %s: %s", group_name, exc, exc_info=True)
        return False




def _find_compose_box(page):  # noqa: ANN001, ANN202
    """Locate the message compose box using multiple strategies.

    Tries CSS selectors first, then falls back to Playwright's
    role-based locator API for resilience against DOM changes.
    """
    try:
        box = page.wait_for_selector(SELECTORS["message_input"], timeout=8_000)
        if box:
            return box
    except PlaywrightTimeout:
        logger.debug("CSS selector strategy failed, trying role-based fallback.")

    # Fallback: role-based locator scoped to #main
    main = page.locator("#main")
    textbox = main.get_by_role("textbox").first
    try:
        textbox.wait_for(state="visible", timeout=5_000)
        return textbox
    except PlaywrightTimeout:
        pass

    # Last resort: any contenteditable inside footer
    editable = page.locator("#main footer [contenteditable='true']").first
    try:
        editable.wait_for(state="visible", timeout=3_000)
        return editable
    except PlaywrightTimeout:
        pass

    dump_main_dom(page)
    return None


def _type_message_human_like(page, message: str) -> None:  # noqa: ANN001
    """Type the message into the compose box with random delays."""
    compose_box = _find_compose_box(page)
    if compose_box is None:
        capture_screenshot(page, "compose_box_missing")
        raise RuntimeError("Message input box not found — DOM may have changed.")
    compose_box.click()
    _type_slowly(compose_box, message)


def _find_send_button(page):  # noqa: ANN001, ANN202
    """Locate the send button using multiple strategies."""
    try:
        btn = page.wait_for_selector(SELECTORS["send_button"], timeout=4_000)
        if btn:
            return btn
    except PlaywrightTimeout:
        logger.debug("CSS selector strategy failed for send button, trying fallback.")

    # Fallback: aria-label locator
    send = page.get_by_role("button", name="Send").first
    try:
        send.wait_for(state="visible", timeout=3_000)
        return send
    except PlaywrightTimeout:
        return None


def _click_send(page) -> None:  # noqa: ANN001
    """Click the send button."""
    send_btn = _find_send_button(page)
    if send_btn is None:
        raise RuntimeError("Send button not found — DOM may have changed.")
    send_btn.click()
    time.sleep(1)


def _type_slowly(element, text: str, *, page=None) -> None:  # noqa: ANN001
    """Simulate human typing: one character at a time with random delay.

    Newlines are sent as Shift+Enter so WhatsApp creates a line break
    instead of sending the message prematurely.
    """
    for char in text:
        if char == "\n":
            element.press("Shift+Enter")
        else:
            element.type(char, delay=0)
        delay = random.uniform(
            settings.AUTOMATION_TYPING_DELAY_MIN,
            settings.AUTOMATION_TYPING_DELAY_MAX,
        )
        time.sleep(delay)
