"""Safety guards for WhatsApp Web automation.

Pre-send checks that detect session expiry, CAPTCHA challenges,
and temporary bans. Also captures diagnostic screenshots on failure.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from playwright.sync_api import Page

logger = logging.getLogger(__name__)

SCREENSHOTS_DIR = Path(settings.BASE_DIR) / "logs" / "screenshots"


def check_session_health(page: Page) -> tuple[bool, str]:
    """Verify the WhatsApp session is healthy before sending.

    Returns:
        (healthy, reason) — ``True`` if ready to send.
    """
    qr_visible = _is_qr_code_visible(page)
    if qr_visible:
        capture_screenshot(page, "qr_reauth_required")
        return False, "QR code visible — session expired, re-authentication needed"

    block_msg = _detect_block_or_captcha(page)
    if block_msg:
        capture_screenshot(page, "block_detected")
        return False, block_msg

    return True, ""


def _is_qr_code_visible(page: Page) -> bool:
    """Check if WhatsApp is showing a QR code for login."""
    qr_selectors = [
        '[data-testid="qrcode"]',
        "canvas[aria-label='Scan this QR code to link a device!']",
        "div._akau",  # QR container class
    ]
    for selector in qr_selectors:
        if page.locator(selector).count() > 0:
            logger.warning("QR code detected — session needs re-auth.")
            return True
    return False


def _detect_block_or_captcha(page: Page) -> str:
    """Detect WhatsApp ban notices or CAPTCHA challenges.

    Returns an empty string if no issues, or a description of the
    detected problem.
    """
    block_indicators = [
        ("iframe[src*='captcha']", "CAPTCHA challenge detected"),
        ("iframe[src*='recaptcha']", "reCAPTCHA challenge detected"),
        (
            "div:has-text('temporarily banned')",
            "Temporary ban notice detected",
        ),
        (
            "div:has-text('unusual activity')",
            "Unusual activity warning detected",
        ),
        (
            "div:has-text('too many attempts')",
            "Too many attempts warning detected",
        ),
    ]

    for selector, message in block_indicators:
        try:
            if page.locator(selector).count() > 0:
                logger.error("WhatsApp safety: %s", message)
                return message
        except Exception:
            continue

    return ""


def capture_screenshot(page: Page, label: str) -> Path | None:
    """Save a timestamped screenshot for debugging.

    Returns the screenshot path, or ``None`` on failure.
    """
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{label}_{timestamp}.png"
    filepath = SCREENSHOTS_DIR / filename

    try:
        page.screenshot(path=str(filepath), full_page=True)
        logger.info("Screenshot saved: %s", filepath)
        return filepath
    except Exception as exc:
        logger.error("Failed to capture screenshot: %s", exc)
        return None


def dump_main_dom(page: Page) -> None:
    """Log the DOM structure of #main for debugging stale selectors."""
    try:
        snippet = page.evaluate("""() => {
            const main = document.querySelector('#main');
            if (!main) return 'NO #main ELEMENT FOUND';
            const footer = main.querySelector('footer');
            if (!footer) return 'NO footer INSIDE #main. innerHTML (500ch): '
                + main.innerHTML.substring(0, 500);
            return 'footer innerHTML (1000ch): '
                + footer.innerHTML.substring(0, 1000);
        }""")
        logger.error("DOM DIAGNOSTIC:\n%s", snippet)
    except Exception as exc:
        logger.error("DOM diagnostic failed: %s", exc)
