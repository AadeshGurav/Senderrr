"""Attachment helpers — file attach and send via WhatsApp Web compose UI."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.automation.safety_guards import capture_screenshot, dump_main_dom

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)

# Confirmed Apr 2026: aria-label="Attach" / icon "plus-rounded" (was "clip").
ATTACH_SELECTORS = {
    "clip_button": ", ".join(
        [
            'button[aria-label="Attach"]',  # confirmed Apr 2026
            'span[data-icon="plus-rounded"]',  # confirmed Apr 2026
            '[data-testid="conversation-clip"]',  # older builds
            'span[data-icon="clip"]',  # older builds
        ]
    ),
    "photos_option": ", ".join(
        [
            'button[role="menuitem"][aria-label="Photos & videos"]',  # confirmed Apr 2026
            '[data-testid="conversation-clip-photos"]',
            '[data-testid="attach-image"]',
            'span[data-icon="photos"]',
        ]
    ),
    "docs_option": ", ".join(
        [
            'button[role="menuitem"][aria-label="Document"]',  # confirmed Apr 2026
            '[data-testid="conversation-clip-document"]',
            '[data-testid="attach-document"]',
            'span[data-icon="document"]',
        ]
    ),
    "caption_input": ", ".join(
        [
            '[data-testid="media-caption-input-container"] div[contenteditable="true"]',
            '[data-testid="media-caption-input"]',
            '[aria-label="Add a caption…"]',
            '[aria-label="Add a caption"]',
            'div.copyable-text[data-tab] div[contenteditable="true"]',
        ]
    ),
}

_MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi"}

# Scoped to #main to avoid sticker and group-icon inputs.
# Apr 2026: live DOM shows accept="image/*" (wildcard, not specific MIME types).
_FILE_INPUT_SELECTORS: dict[bool, list[str]] = {
    True: [
        '#main footer input[type="file"][accept="image/*"]',  # confirmed Apr 2026
        '#main input[type="file"][accept="image/*"]',
        '#main footer input[type="file"][accept*="video"]',
        '#main input[type="file"][accept*="video"]',
        '#main footer input[type="file"][accept*="image/jpeg"]',
        '#main input[type="file"][accept*="image/jpeg"]',
        '#main footer input[type="file"][accept*="image/png"]',
        '#main input[type="file"][accept*="image/png"]',
    ],
    False: [
        '#main footer input[type="file"][accept*="application"]',
        '#main input[type="file"][accept*="application"]',
        '#main footer input[type="file"][accept*="text/plain"]',
        '#main input[type="file"][accept*="text/plain"]',
    ],
}


def _attach_and_send_file(page: "Page", file_path: str, caption: str) -> None:
    """Attach a file and send it, optionally with a caption typed in the preview modal.

    Raises:
        SendFailedError: If neither attach strategy succeeds or send button is missing.
    """
    from apps.automation.compose_helpers import (
        _clear_input,
        _find_compose_box,
        _find_send_button,
        _type_slowly,
    )
    from apps.automation.services import SendFailedError

    is_media = Path(file_path).suffix.lower() in _MEDIA_EXTENSIONS
    logger.info("[attach] Attaching file (is_media=%s): %s", is_media, file_path)

    if caption:
        compose_box = _find_compose_box(page)
        if compose_box:
            _clear_input(compose_box)
            _type_slowly(compose_box, caption, page=page)
            time.sleep(0.5)

    logger.info("[attach] Trying direct file-input strategy.")
    if not _attach_via_direct_input(page, file_path, is_media):
        logger.info("[attach] Direct input failed — trying clip-menu strategy.")
        _attach_via_clip_menu(page, file_path, is_media)

    logger.info("[attach] File set on input. Waiting for preview modal…")
    time.sleep(2)

    if caption:
        try:
            caption_box = page.wait_for_selector(
                ATTACH_SELECTORS["caption_input"], timeout=5_000
            )
            if caption_box:
                existing = caption_box.inner_text().strip()
                if not existing:
                    _clear_input(caption_box)
                    _type_slowly(caption_box, caption, page=page)
                    logger.info("[attach] Caption typed in preview modal.")
                else:
                    logger.info(
                        "[attach] Caption already pre-populated in preview modal."
                    )
        except PlaywrightTimeout:
            logger.warning(
                "[attach] Caption input not found — sending without caption."
            )

    time.sleep(1)
    logger.info("[attach] Clicking send button in preview modal.")
    send_btn = _find_send_button(page)
    if send_btn is None:
        capture_screenshot(page, "send_button_not_found")
        dump_main_dom(page)
        raise SendFailedError("Send button not found on file preview.")
    send_btn.click()
    time.sleep(2)
    logger.info("[attach] Image message sent.")

    try:
        from apps.automation.compose_helpers import _find_compose_box as _fcb

        compose = _fcb(page)
        if compose:
            _clear_input(compose)
    except Exception:  # noqa: BLE001
        pass


def _attach_via_direct_input(page: "Page", file_path: str, is_media: bool) -> bool:
    """Set files on WhatsApp's hidden file input without clicking the menu."""
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


def _attach_via_clip_menu(page: "Page", file_path: str, is_media: bool) -> None:
    """Click the clip button then intercept the submenu file chooser.

    Raises:
        SendFailedError: If the clip button or submenu cannot be found.
    """
    from apps.automation.services import SendFailedError

    try:
        clip_btn = page.wait_for_selector(
            ATTACH_SELECTORS["clip_button"], timeout=8_000
        )
        clip_btn.click()
        time.sleep(1.5)
    except PlaywrightTimeout as exc:
        raise SendFailedError(f"Clip button not found: {exc}") from exc

    if _click_submenu_and_pick_file(page, file_path, is_media):
        return

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


def _click_submenu_and_pick_file(page: "Page", file_path: str, is_media: bool) -> bool:
    """Try CSS selectors then text-based matching to click the submenu option."""
    css_selector = (
        ATTACH_SELECTORS["photos_option"]
        if is_media
        else ATTACH_SELECTORS["docs_option"]
    )
    text_candidates = (
        ["Photos / Videos", "Photos", "Videos"] if is_media else ["Document", "Docs"]
    )

    try:
        with page.expect_file_chooser(timeout=5_000) as fc_info:
            option = page.wait_for_selector(css_selector, timeout=3_000)
            option.click()
        fc_info.value.set_files(file_path)
        logger.debug("Attached via clip menu (CSS).")
        return True
    except Exception:  # noqa: BLE001
        pass

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
