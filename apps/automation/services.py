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
    """Send an image with caption as one combined WhatsApp message.

    Types the caption in the compose box first (human-like), then attaches the
    image. In the preview modal the caption is verified — typed there if it was
    not carried over — and the combined image+caption is sent as a single
    message. Shares rate-limiting, anti-ban, and session-health logic with
    send_message_to_group.

    Args:
        group_jid: Group name to search for in WhatsApp.
        image_path: Absolute path to the image file on disk.
        caption: Optional caption text for the image.

    Returns:
        ``True`` on success, ``False`` on recoverable failure.
    """
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
        _attach_and_send_file(page, image_path, caption)
    finally:
        release_send_slot(token)

    increment_send_counter(worker_id=worker_id)
    logger.info("File sent to group: %s (worker=%d)", group_jid, worker_id)
    return True


def send_message_to_subgroup(
    community_jid: str,
    subgroup_jid: str,
    message: str,
) -> bool:
    """Send a message to a community sub-group via 2-step Community navigation.

    Follows the same anti-ban pipeline as send_message_to_group but navigates
    through the parent Community → Sub-group flow in WhatsApp Web instead of
    searching for the sub-group directly.

    Args:
        community_jid: Community search name (used to find community in chat list).
        subgroup_jid: Sub-group search name within the community panel.
        message: Text to send.

    Returns:
        ``True`` on success.

    Raises:
        RateLimitError: When hourly/daily send cap is exceeded.
        SessionExpiredError: When WhatsApp session requires re-authentication.
        GroupNotFoundError: When community or sub-group cannot be found.
        SendFailedError: When compose/send UI interaction fails.
        BotDetectedError: When CAPTCHA or ban notice is detected.
    """
    from apps.automation.community_navigator import navigate_to_community_subgroup

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

    navigate_to_community_subgroup(page, community_jid, subgroup_jid)

    token = acquire_send_slot()
    if token is None:
        raise SendFailedError("Timed out waiting for send slot.")
    try:
        _type_message_human_like(page, message)
        _click_send(page)
    finally:
        release_send_slot(token)

    increment_send_counter(worker_id=worker_id)
    logger.info(
        "Message sent to community sub-group: community=%s subgroup=%s (worker=%d)",
        community_jid,
        subgroup_jid,
        worker_id,
    )
    return True


# WhatsApp Web attachment selectors — ordered most-specific to broadest.
ATTACH_SELECTORS = {
    "clip_button": ", ".join(
        [
            '[data-testid="conversation-clip"]',
            'span[data-icon="clip"]',
            'button[aria-label="Attach"]',
        ]
    ),
    "photos_option": ", ".join(
        [
            '[data-testid="conversation-clip-photos"]',
            '[data-testid="attach-image"]',
            'span[data-icon="photos"]',
        ]
    ),
    "docs_option": ", ".join(
        [
            '[data-testid="conversation-clip-document"]',
            '[data-testid="attach-document"]',
            'span[data-icon="document"]',
        ]
    ),
    "caption_input": ", ".join(
        [
            '[data-testid="media-caption-input-container"] div[contenteditable="true"]',
            'div.copyable-text[data-tab] div[contenteditable="true"]',
            '#app div[contenteditable="true"][role="textbox"]',
        ]
    ),
}

_MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi"}

# Selectors for hidden file inputs WhatsApp keeps in the DOM inside the chat panel.
# Strategy A (preferred): set files directly without navigating the UI menu.
#
# IMPORTANT: WhatsApp also has a sticker input that accepts image/webp — we must
# avoid it.  The Photos & Videos input always includes "video" in its accept
# attribute, so targeting that is the safest way to skip the sticker input.
_FILE_INPUT_SELECTORS: dict[bool, list[str]] = {
    True: [  # media — target photos/videos input, NOT sticker input
        'input[type="file"][accept*="video"]',  # photos & videos (always has video)
        'input[type="file"][accept*="image/jpeg"]',  # explicit jpeg avoids sticker
        'input[type="file"][accept*="image/png"]',
    ],
    False: [  # documents
        'input[type="file"][accept*="application"]',
        'input[type="file"][accept*="text/plain"]',
        'input[type="file"]:not([accept*="image"])',
    ],
}


def _attach_and_send_file(page, file_path: str, caption: str) -> None:  # noqa: ANN001
    """Send a file + caption as ONE combined WhatsApp message.

    Flow:
    1. Type caption in compose box first (human-like, visible as user types).
    2. Attach file via Strategy A (direct input) or Strategy B (clip menu).
    3. In preview modal: if caption field is empty, type caption there.
    4. Click send → image + caption delivered as a single message.
    5. Clear compose box if caption text lingers after send.

    Args:
        page: Active Playwright page with an open chat.
        file_path: Absolute path to the file to attach.
        caption: Caption to accompany the file.

    Raises:
        SendFailedError: If neither strategy can attach the file.
    """
    is_media = Path(file_path).suffix.lower() in _MEDIA_EXTENSIONS

    # Step 1: Type caption in compose box first (human-like UX)
    if caption:
        compose_box = _find_compose_box(page)
        if compose_box:
            _clear_input(compose_box)
            _type_slowly(compose_box, caption)
            time.sleep(0.5)

    # Step 2: Attach file (Strategy A → Strategy B fallback)
    if not _attach_via_direct_input(page, file_path, is_media):
        _attach_via_clip_menu(page, file_path, is_media)

    time.sleep(2)

    # Step 3: Ensure caption appears in preview modal
    if caption:
        try:
            caption_box = page.wait_for_selector(
                ATTACH_SELECTORS["caption_input"], timeout=5_000
            )
            if caption_box:
                existing = caption_box.inner_text().strip()
                if not existing:
                    _clear_input(caption_box)
                    _type_slowly(caption_box, caption)
                else:
                    logger.debug("Caption already pre-populated in preview modal.")
        except PlaywrightTimeout:
            logger.warning("Caption input not found — sending file without caption.")

    # Step 4: Send combined message from the preview modal
    time.sleep(1)
    send_btn = _find_send_button(page)
    if send_btn is None:
        raise SendFailedError("Send button not found on file preview.")
    send_btn.click()
    time.sleep(2)

    # Step 5: Clear any lingering caption text from compose box
    try:
        compose = _find_compose_box(page)
        if compose:
            _clear_input(compose)
    except Exception:  # noqa: BLE001
        pass


def _attach_via_direct_input(
    page, file_path: str, is_media: bool
) -> bool:  # noqa: ANN001
    """Set files directly on WhatsApp's hidden file input without clicking the menu.

    Returns True if the file was successfully handed to the input element.
    """
    for selector in _FILE_INPUT_SELECTORS[is_media]:
        try:
            loc = page.locator(selector).first
            loc.wait_for(state="attached", timeout=2_000)
            loc.set_input_files(file_path)
            logger.debug("Attached file via direct input (%s).", selector)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.debug("Direct input '%s' failed: %s", selector, exc)
    return False


def _attach_via_clip_menu(page, file_path: str, is_media: bool) -> None:  # noqa: ANN001
    """Click the clip button, then intercept the submenu file chooser.

    Tries CSS selectors first, then falls back to text-based matching which
    is resilient to WhatsApp data-testid / data-icon changes.

    Raises:
        SendFailedError: If the clip button or submenu cannot be found.
    """
    try:
        clip_btn = page.wait_for_selector(
            ATTACH_SELECTORS["clip_button"], timeout=8_000
        )
        clip_btn.click()
        time.sleep(1.5)  # Allow the popup menu to fully render
    except PlaywrightTimeout as exc:
        raise SendFailedError(f"Clip button not found: {exc}") from exc

    if _click_submenu_and_pick_file(page, file_path, is_media):
        return

    # All strategies failed — dump artefacts for selector debugging
    capture_screenshot(page, "attach_menu_selector_miss")
    dump_main_dom(page)
    css_sel = (
        ATTACH_SELECTORS["photos_option"]
        if is_media
        else ATTACH_SELECTORS["docs_option"]
    )
    raise SendFailedError(
        f"Attachment submenu not found (tried CSS + text fallback; last CSS: {css_sel!r}). "
        "Screenshot + DOM saved for debugging."
    )


def _click_submenu_and_pick_file(  # noqa: ANN001
    page, file_path: str, is_media: bool
) -> bool:
    """Try CSS selectors then text-based matching to click the submenu option."""
    css_selector = (
        ATTACH_SELECTORS["photos_option"]
        if is_media
        else ATTACH_SELECTORS["docs_option"]
    )
    # Text labels WhatsApp may show for each option type
    text_candidates = (
        ["Photos / Videos", "Photos", "Videos"] if is_media else ["Document", "Docs"]
    )

    # Pass 1: testid / icon CSS selectors
    try:
        with page.expect_file_chooser(timeout=5_000) as fc_info:
            option = page.wait_for_selector(css_selector, timeout=3_000)
            option.click()
        fc_info.value.set_files(file_path)
        logger.debug("Attached via clip menu (CSS).")
        return True
    except Exception:  # noqa: BLE001
        pass

    # Pass 2: text-based (survives data-testid / data-icon rotation)
    for text in text_candidates:
        try:
            with page.expect_file_chooser(timeout=5_000) as fc_info:
                item = page.get_by_text(text, exact=False).first
                item.wait_for(state="visible", timeout=3_000)
                item.click()
            fc_info.value.set_files(file_path)
            logger.debug("Attached via clip menu (text=%r).", text)
            return True
        except Exception:  # noqa: BLE001
            pass

    return False


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
            page.wait_for_selector("#main", timeout=8_000)
        except PlaywrightTimeout:
            logger.warning(
                "Chat panel (#main) did not appear after clicking: %s", group_name
            )
            return False

        # Use the multi-strategy compose-box finder (all selectors are scoped to
        # #main so this cannot accidentally target the search input).
        compose = _find_compose_box(page)
        if compose:
            compose.click()
            time.sleep(0.3)

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


def _clear_input(element) -> None:  # noqa: ANN001
    """Clear a contenteditable input using keyboard selection + delete.

    ``Control+a`` → ``Delete`` works reliably on WhatsApp Web's
    contenteditable divs, unlike ``.fill("")`` which is unreliable.
    """
    element.click()
    element.press("Control+a")
    element.press("Delete")
    time.sleep(0.2)


def _type_message_human_like(page, message: str) -> None:  # noqa: ANN001
    """Type the message into the compose box with random delays."""
    compose_box = _find_compose_box(page)
    if compose_box is None:
        capture_screenshot(page, "compose_box_missing")
        raise SendFailedError("Message input box not found — DOM may have changed.")
    _clear_input(compose_box)
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
    instead of sending the message prematurely.  Carriage returns (\r)
    are silently skipped — browsers submit textarea content as \r\n and
    typing \r into WhatsApp's contenteditable triggers an Enter/send.
    """
    for char in text:
        if char == "\r":
            continue  # skip CR; the \n that follows handles the line break
        if char == "\n":
            element.press("Shift+Enter")
        else:
            element.type(char, delay=0)
        delay = random.uniform(
            settings.AUTOMATION_TYPING_DELAY_MIN,
            settings.AUTOMATION_TYPING_DELAY_MAX,
        )
        time.sleep(delay)
