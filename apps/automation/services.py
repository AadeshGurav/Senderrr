"""Automation services — WhatsApp Web message delivery with anti-ban measures."""

from __future__ import annotations

import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.automation.browser_manager import (
    PlaywrightBrowserManager,
    resolve_user_data_dir,
)
from apps.automation.rate_limiter import check_rate_limit, increment_send_counter
from apps.automation.safety_guards import (
    capture_screenshot,
    check_session_health,
    dump_main_dom,
)
from apps.automation.send_semaphore import acquire_send_slot, release_send_slot
from utils.config import get_config

logger = logging.getLogger(__name__)

WHATSAPP_WEB_URL = "https://web.whatsapp.com"


class RateLimitError(RuntimeError):
    """Raised when hourly/daily send cap is exceeded."""


class SessionExpiredError(RuntimeError):
    """Raised when the WhatsApp session requires re-authentication."""


class GroupNotFoundError(RuntimeError):
    """Raised when the target group cannot be found in search results."""


class SendFailedError(RuntimeError):
    """Raised when the compose/send UI interaction fails."""


class BotDetectedError(RuntimeError):
    """Raised when CAPTCHA or ban notice is detected."""


# WhatsApp Web DOM selectors — ordered from most-specific to broadest.
# WhatsApp frequently changes its DOM; keep multiple fallbacks.
SELECTORS = {
    "search_box": ", ".join(
        [
            '[data-testid="chat-list-search"]',
            'div[role="textbox"][data-tab="3"]',
            "#side header",
        ]
    ),
    "search_input": ", ".join(
        [
            '[data-testid="search-input"]',
            'div[role="textbox"][data-tab="3"]',
        ]
    ),
    "chat_row": ", ".join(
        [
            '[data-testid="cell-frame-container"]',
            '#pane-side div[role="listitem"]',
            '#pane-side div[role="row"]',
        ]
    ),
    "message_input": ", ".join(
        [
            '[data-testid="conversation-compose-box-input"]',
            'div[role="textbox"][data-tab="10"]',
            '#main footer div[contenteditable="true"]',
            'div[role="textbox"][data-tab="1"]',
            '[data-testid="lexical-rich-text-input"]',
            '#main div[contenteditable="true"][role="textbox"]',
            '#main div[contenteditable="true"]',
        ]
    ),
    "send_button": ", ".join(
        [
            '[data-testid="send"]',
            '[data-testid="compose-btn-send"]',
            'button[aria-label="Send"]',
            '#main footer button span[data-icon="send"]',
            'span[data-icon="wds-ic-send-filled"]',
            '[data-testid="send-button"]',
        ]
    ),
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
        raise RateLimitError(f"Rate limit exceeded: {reason}")

    _apply_anti_ban_jitter()

    worker_id = int(os.environ.get("WA_WORKER_ID", "0"))

    manager = PlaywrightBrowserManager()
    page = manager.get_page()

    _ensure_whatsapp_loaded(page)

    healthy, issue = check_session_health(page)
    if not healthy:
        if "qr" in issue.lower() or "re-auth" in issue.lower():
            raise SessionExpiredError(f"Session unhealthy: {issue}")
        if "banned" in issue.lower() or "captcha" in issue.lower():
            raise BotDetectedError(f"Session unhealthy: {issue}")
        raise SessionExpiredError(f"Session unhealthy: {issue}")

    if not _search_and_open_chat(page, group_jid):
        raise GroupNotFoundError(f"Could not find group: {group_jid}")

    token = acquire_send_slot()
    if token is None:
        raise SendFailedError("Timed out waiting for send slot.")
    try:
        _type_message_human_like(page, message)
        _click_send(page)
    finally:
        release_send_slot(token)

    increment_send_counter(worker_id=worker_id)
    logger.info("Message sent to group: %s (worker=%d)", group_jid, worker_id)
    return True


def send_image_to_group(
    group_jid: str,
    image_path: str,
    caption: str = "",
) -> bool:
    """Send an image with optional caption to a WhatsApp group.

    Uses WhatsApp Web's attachment flow: paperclip → file chooser → caption → send.
    Shares rate-limiting, anti-ban, and session-health logic with send_message_to_group.

    Args:
        group_jid: Group name to search for in WhatsApp.
        image_path: Absolute path to the image file on disk.
        caption: Optional caption text for the image.

    Returns:
        ``True`` on success, ``False`` on recoverable failure.
    """
    from pathlib import Path

    if not Path(image_path).exists():
        logger.warning("Image file not found: %s — falling back to text.", image_path)
        if caption:
            return send_message_to_group(group_jid, caption)
        return False

    allowed, reason = check_rate_limit()
    if not allowed:
        raise RateLimitError(f"Rate limit exceeded: {reason}")

    _apply_anti_ban_jitter()

    worker_id = int(os.environ.get("WA_WORKER_ID", "0"))
    manager = PlaywrightBrowserManager()
    page = manager.get_page()

    _ensure_whatsapp_loaded(page)

    healthy, issue = check_session_health(page)
    if not healthy:
        if "qr" in issue.lower() or "re-auth" in issue.lower():
            raise SessionExpiredError(f"Session unhealthy: {issue}")
        if "banned" in issue.lower() or "captcha" in issue.lower():
            raise BotDetectedError(f"Session unhealthy: {issue}")
        raise SessionExpiredError(f"Session unhealthy: {issue}")

    if not _search_and_open_chat(page, group_jid):
        raise GroupNotFoundError(f"Could not find group: {group_jid}")

    token = acquire_send_slot()
    if token is None:
        raise SendFailedError("Timed out waiting for send slot.")
    try:
        _attach_and_send_image(page, image_path, caption)
    finally:
        release_send_slot(token)

    increment_send_counter(worker_id=worker_id)
    logger.info("Image sent to group: %s (worker=%d)", group_jid, worker_id)
    return True


# WhatsApp Web attachment selectors
ATTACHMENT_SELECTORS = {
    "paperclip": ", ".join(
        [
            # Legacy selectors
            '[data-testid="clip"]',
            'div[title="Attach"]',
            '#main header button span[data-icon="clip"]',
            # Modern WhatsApp Web / Business (2024+)
            'span[data-icon="attach-menu-plus"]',
            '#main footer span[data-icon="attach-menu-plus"]',
            '#main span[data-icon="plus"]',
            '#main footer span[data-icon="plus"]',
            '[data-testid="attach"]',
            'button[aria-label="Attach"]',
        ]
    ),
    "media_input": ", ".join(
        [
            # Original: 'input[accept*="image"], input[accept*="video"]'
            # Modified: Require *both* so we don't accidentally pick the Sticker input (which is image-only).
            'input[accept*="image"][accept*="video"]',
        ]
    ),
    "caption_input": ", ".join(
        [
            '[data-testid="media-caption-input-container"] div[contenteditable="true"]',
            'div.copyable-text[data-tab] div[contenteditable="true"]',
            '#app div[contenteditable="true"][role="textbox"]',
        ]
    ),
    "image_send": ", ".join(
        [
            '[data-testid="send"]',
            'div[role="button"] span[data-icon="send"]',
        ]
    ),
}


def _attach_and_send_image(page, image_path: str, caption: str) -> None:  # noqa: ANN001
    """Type caption in compose box, attach image, confirm caption, and send.

    Typing the caption first anchors browser focus to the chat compose area so
    that subsequent clicks (paperclip, file chooser) land in the right element
    instead of the search input.
    """
    # Step 1 — type caption in compose box to anchor focus to the chat.
    if caption:
        try:
            compose_box = page.wait_for_selector(
                SELECTORS["message_input"], timeout=3_000
            )
            if compose_box:
                _type_slowly(compose_box, caption)
                time.sleep(0.3)
        except PlaywrightTimeout:
            logger.warning("Compose box not found for pre-typing caption.")

    # Step 2 — click paperclip / plus button to open attachment menu.
    try:
        clip_btn = page.wait_for_selector(
            ATTACHMENT_SELECTORS["paperclip"], timeout=15_000
        )
    except PlaywrightTimeout:
        dump_main_dom(page)
        capture_screenshot(page, "attach_btn_missing")
        raise SendFailedError("Attachment button not found — check screenshot in logs/screenshots/.")
    clip_btn.click()
    time.sleep(1)

    # Step 3 — use Playwright's file chooser to upload the image.
    with page.expect_file_chooser(timeout=5_000) as fc_info:
        media_input = page.locator(ATTACHMENT_SELECTORS["media_input"]).first
        media_input.dispatch_event("click")

    file_chooser = fc_info.value
    file_chooser.set_files(image_path)
    logger.debug("Image file set via file chooser: %s", image_path)

    # Wait for the image preview modal to load.
    time.sleep(3)

    # Step 4 — handle caption in the preview modal.
    # WhatsApp may have pre-filled the caption from the compose box; clear and
    # retype to guarantee the correct content regardless of WhatsApp version.
    if caption:
        try:
            caption_box = page.wait_for_selector(
                ATTACHMENT_SELECTORS["caption_input"], timeout=5_000
            )
            if caption_box:
                caption_box.click()
                caption_box.press("Control+a")
                caption_box.press("Delete")
                time.sleep(0.1)
                _type_slowly(caption_box, caption)
        except PlaywrightTimeout:
            logger.warning("Caption input not found — sending image without caption.")

    # Step 5 — send from the image preview screen.
    time.sleep(1)
    send_btn = _find_send_button(page)
    if send_btn is None:
        raise SendFailedError("Send button not found on image preview.")
    send_btn.click()
    time.sleep(2)

    # Step 6 — clear compose box in case WhatsApp left the pre-typed caption there.
    try:
        compose_box = page.wait_for_selector(
            SELECTORS["message_input"], timeout=2_000
        )
        if compose_box:
            compose_box.click()
            compose_box.press("Control+a")
            compose_box.press("Delete")
    except PlaywrightTimeout:
        pass


def _apply_anti_ban_jitter() -> None:
    """Sleep a random duration between sends with progressive scaling.

    Jitter increases as more messages are sent in the current hour,
    making high-volume sends appear more natural over time.
    """
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
        # .fill("") is unreliable on contenteditable divs — use keyboard clear instead
        search_input.click()
        search_input.press("Control+a")
        search_input.press("Delete")
        time.sleep(0.3)
        _type_slowly(search_input, group_name)

        time.sleep(3)

        # Find the search result that contains the group name
        result = page.locator(f'{SELECTORS["chat_row"]} >> text="{group_name}"').first
        try:
            result.wait_for(state="visible", timeout=10_000)
        except PlaywrightTimeout:
            # Fallback: click any row with matching title attribute
            result = page.locator(f'span[title="{group_name}"]').first
            result.wait_for(state="visible", timeout=5_000)

        result.click()
        time.sleep(1)

        # Verify the chat panel actually loaded
        try:
            page.wait_for_selector("#main", timeout=5_000)
        except PlaywrightTimeout:
            logger.warning(
                "Chat panel (#main) did not appear after clicking: %s", group_name
            )
            return False

        # Click the compose box to dismiss the search overlay and anchor focus
        # to the chat area — prevents subsequent text from going to the search input.
        try:
            compose = page.wait_for_selector(SELECTORS["message_input"], timeout=3_000)
            if compose:
                compose.click()
                time.sleep(0.3)
        except PlaywrightTimeout:
            pass  # Non-fatal — continue with caution

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
        raise SendFailedError("Message input box not found — DOM may have changed.")
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
        raise SendFailedError("Send button not found — DOM may have changed.")
    send_btn.click(force=True)
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
