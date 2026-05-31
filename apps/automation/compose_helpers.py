"""Compose-box and send-button helpers for WhatsApp Web automation."""

from __future__ import annotations

import logging
import random
import time
from typing import TYPE_CHECKING

from django.conf import settings
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.automation.safety_guards import capture_screenshot, dump_main_dom

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)


def _find_compose_box(page: "Page"):  # noqa: ANN202
    """Locate the message compose box using self-healing + role fallbacks."""
    from apps.automation.selector_registry import find_element_resilient

    el = find_element_resilient(page, "message_input", timeout=8_000)
    if el:
        return el

    main = page.locator("#main")
    textbox = main.get_by_role("textbox").first
    try:
        textbox.wait_for(state="visible", timeout=5_000)
        return textbox
    except PlaywrightTimeout:
        pass

    editable = page.locator("#main footer [contenteditable='true']").first
    try:
        editable.wait_for(state="visible", timeout=3_000)
        return editable
    except PlaywrightTimeout:
        pass

    dump_main_dom(page)
    return None


def _clear_input(element) -> None:  # noqa: ANN001
    """Clear a contenteditable input using triple-click + Backspace.

    Triple-click selects all text cross-platform without the Control/Meta
    ambiguity (Control+a moves to line start on macOS instead of selecting).
    """
    element.click(click_count=3)
    element.press("Backspace")
    time.sleep(0.2)


def _type_message_human_like(page: "Page", message: str) -> None:
    """Type the message into the compose box with random delays."""
    from apps.automation.services import SendFailedError

    compose_box = _find_compose_box(page)
    if compose_box is None:
        capture_screenshot(page, "compose_box_missing")
        raise SendFailedError("Message input box not found — DOM may have changed.")
    _clear_input(compose_box)
    _type_slowly(compose_box, message, page=page)


def _find_send_button(page: "Page"):  # noqa: ANN202
    """Locate the send button using self-healing + JS icon scan fallback."""
    from apps.automation.selector_registry import find_element_resilient

    el = find_element_resilient(page, "send_button", timeout=4_000)
    if el:
        return el

    send = page.get_by_role("button", name="Send").first
    try:
        send.wait_for(state="visible", timeout=3_000)
        return send
    except PlaywrightTimeout:
        pass

    try:
        handle = page.evaluate_handle("""
            () => {
                const icons = document.querySelectorAll(
                    'span[data-icon*="send"], span[data-icon*="forward"]'
                );
                for (const icon of icons) {
                    const btn = icon.closest('button, [role="button"]');
                    if (btn && btn.offsetParent !== null) return btn;
                }
                return null;
            }
            """)
        el = handle.as_element()
        if el:
            return el
    except Exception:  # noqa: BLE001
        pass

    return None


def _click_send(page: "Page") -> None:
    """Click the send button."""
    from apps.automation.services import SendFailedError

    send_btn = _find_send_button(page)
    if send_btn is None:
        raise SendFailedError("Send button not found — DOM may have changed.")
    send_btn.click()
    time.sleep(1)


def _type_slowly(
    element, text: str, *, page: "Page | None" = None  # noqa: ANN001
) -> None:
    """Simulate human typing: one character at a time with random delay.

    When ``page`` is supplied, keyboard events are dispatched via the page
    rather than through the element handle. This avoids stale-element errors
    when WhatsApp re-renders the compose box after a navigation event.

    Newlines are sent as Shift+Enter so WhatsApp creates a line break instead
    of sending prematurely. Carriage returns (\\r) are silently skipped.
    """
    for char in text:
        if char == "\r":
            continue
        if char == "\n":
            if page:
                page.keyboard.press("Shift+Enter")
            else:
                element.press("Shift+Enter")
        else:
            if page:
                page.keyboard.type(char)
            else:
                element.type(char, delay=0)
        delay = random.uniform(
            settings.AUTOMATION_TYPING_DELAY_MIN,
            settings.AUTOMATION_TYPING_DELAY_MAX,
        )
        time.sleep(delay)
