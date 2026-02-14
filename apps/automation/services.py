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
from utils.config import get_config

logger = logging.getLogger(__name__)

WHATSAPP_WEB_URL = "https://web.whatsapp.com"

# WhatsApp Web DOM selectors — covers personal and Business variants.
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
    ]),
    "send_button": ", ".join([
        '[data-testid="send"]',
        'button[aria-label="Send"]',
    ]),
}


def send_message_to_group(group_jid: str, message: str) -> bool:
    """Send a message to a WhatsApp group with human-like behaviour.

    Steps:
        1. Apply anti-ban jitter delay.
        2. Open WhatsApp Web (if not already open).
        3. Search for the group by its JID/name.
        4. Type the message with randomised per-character delay.
        5. Click send.

    Returns:
        ``True`` on success, ``False`` on recoverable failure.

    Raises:
        Exception: On unrecoverable errors (propagated to the caller).
    """
    _apply_anti_ban_jitter()

    manager = PlaywrightBrowserManager()
    page = manager.get_page()

    _ensure_whatsapp_loaded(page)

    if not _search_and_open_chat(page, group_jid):
        logger.error("Could not find group: %s", group_jid)
        return False

    _type_message_human_like(page, message)
    _click_send(page)

    logger.info("Message sent to group: %s", group_jid)
    return True


def _apply_anti_ban_jitter() -> None:
    """Sleep a random duration between sends to mimic human pacing."""
    delay = random.uniform(
        get_config("AUTOMATION_JITTER_MIN", float),
        get_config("AUTOMATION_JITTER_MAX", float),
    )
    logger.debug("Anti-ban jitter: sleeping %.1fs", delay)
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


def _search_and_open_chat(page, group_jid: str) -> bool:  # noqa: ANN001
    """Search for a group and click into its chat.

    Returns ``True`` if the chat was opened successfully.
    """
    try:
        search_box = page.wait_for_selector(SELECTORS["search_box"], timeout=10_000)
        search_box.click()

        search_input = page.wait_for_selector(SELECTORS["search_input"], timeout=5_000)
        search_input.fill("")
        _type_slowly(search_input, group_jid)

        time.sleep(2)

        chat = page.wait_for_selector(SELECTORS["chat_row"], timeout=10_000)
        chat.click()
        time.sleep(1)
        return True
    except PlaywrightTimeout:
        logger.warning("Timed out searching for group: %s", group_jid)
        return False
    except Exception as exc:
        logger.error("Error opening chat %s: %s", group_jid, exc, exc_info=True)
        return False


def _type_message_human_like(page, message: str) -> None:  # noqa: ANN001
    """Type the message into the compose box with random delays."""
    try:
        compose_box = page.wait_for_selector(SELECTORS["message_input"], timeout=10_000)
        compose_box.click()
        _type_slowly(compose_box, message)
    except PlaywrightTimeout:
        raise RuntimeError("Message input box not found — DOM may have changed.")


def _click_send(page) -> None:  # noqa: ANN001
    """Click the send button."""
    try:
        send_btn = page.wait_for_selector(SELECTORS["send_button"], timeout=5_000)
        send_btn.click()
        time.sleep(1)
    except PlaywrightTimeout:
        raise RuntimeError("Send button not found — DOM may have changed.")


def _type_slowly(element, text: str) -> None:  # noqa: ANN001
    """Simulate human typing: one character at a time with random delay."""
    for char in text:
        element.type(char, delay=0)
        delay = random.uniform(
            settings.AUTOMATION_TYPING_DELAY_MIN,
            settings.AUTOMATION_TYPING_DELAY_MAX,
        )
        time.sleep(delay)
