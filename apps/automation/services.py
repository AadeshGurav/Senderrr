"""Automation services — WhatsApp Web message delivery with anti-ban measures."""

from __future__ import annotations

import logging
import os
import time

from apps.automation.browser_manager import PlaywrightBrowserManager
from apps.automation.compose_helpers import _click_send, _type_message_human_like
from apps.automation.navigation_helpers import (
    _apply_anti_ban_jitter,
    _ensure_whatsapp_loaded,
    _search_and_open_chat,
)
from apps.automation.rate_limiter import check_rate_limit, increment_send_counter
from apps.automation.safety_guards import check_session_health
from apps.automation.send_semaphore import acquire_send_slot, release_send_slot

logger = logging.getLogger(__name__)


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
        RateLimitError: On rate limit exceeded.
        SessionExpiredError: When QR re-authentication is required.
        BotDetectedError: When a ban or CAPTCHA is detected.
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
    not carried over — and the combined image+caption is sent as a single message.

    Args:
        group_jid: Group name to search for in WhatsApp.
        image_path: Absolute path to the image file on disk.
        caption: Optional caption text for the image.

    Returns:
        ``True`` on success, ``False`` on recoverable failure.
    """
    from pathlib import Path as _Path

    from apps.automation.attachment_helpers import _attach_and_send_file

    if not _Path(image_path).exists():
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
        if caption:
            logger.info("[send] Step 1/4 — typing text message into compose box.")
            _type_message_human_like(page, caption)

            logger.info("[send] Step 2/4 — clicking send button to send text first.")
            _click_send(page)
            logger.info("[send] Text message sent.")

            logger.info(
                "[send] Step 3/4 — waiting 2s for WhatsApp to process text message."
            )
            time.sleep(2)
            logger.info("[send] Text message delivered. Preparing image attach.")

        logger.info("[send] Step 4/4 — attaching and sending image.")
        _attach_and_send_file(page, image_path, "")
    finally:
        release_send_slot(token)

    increment_send_counter(worker_id=worker_id)
    logger.info(
        "[send] Done — text + image sent to %s (worker=%d).", group_jid, worker_id
    )
    return True


def send_message_to_subgroup(
    community_jid: str,
    subgroup_jid: str,
    message: str,
) -> bool:
    """Send a message to a community sub-group via 2-step Community navigation.

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
