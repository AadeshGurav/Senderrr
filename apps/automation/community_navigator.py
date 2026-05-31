"""Automation community navigator — WhatsApp Web Community → Sub-group navigation."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from apps.automation.safety_guards import capture_screenshot, dump_main_dom

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)

_NAVIGATION_TIMEOUT_MS = 10_000


def navigate_to_community_subgroup(
    page: Page,
    community_jid: str,
    subgroup_jid: str,
) -> None:
    """Navigate WhatsApp Web to a sub-group via its parent community.

    Two-step flow:
      1. Search for the community by name in the chat list.
      2. Click the community → Community Info panel opens.
      3. Locate and click the sub-group within the panel.
      4. Wait for the message compose box to be ready.

    Args:
        page: Active Playwright page with WhatsApp Web loaded.
        community_jid: Community search name (same semantics as group_jid).
        subgroup_jid: Sub-group search name within the community panel.

    Raises:
        GroupNotFoundError: If the community or sub-group cannot be found.
        SendFailedError: If navigation succeeds but compose box is unreachable.
    """
    logger.info(
        "Navigating to community sub-group: community=%s subgroup=%s",
        community_jid,
        subgroup_jid,
    )
    _search_and_open_community(page, community_jid)
    _open_subgroup_in_community(page, community_jid, subgroup_jid)
    _wait_for_compose_box(page, community_jid, subgroup_jid)


def _search_and_open_community(page: Page, community_jid: str) -> None:
    """Search for the community in the chat list and click it."""
    from apps.automation.selector_registry import find_element_resilient
    from apps.automation.services import GroupNotFoundError

    search_box = find_element_resilient(
        page, "search_box", timeout=_NAVIGATION_TIMEOUT_MS
    )
    if search_box is None:
        capture_screenshot(page, "community_search_box_missing")
        raise GroupNotFoundError(
            f"Search box not found while looking for community '{community_jid}'"
        )

    try:
        search_box.click(timeout=_NAVIGATION_TIMEOUT_MS)
    except Exception as exc:
        capture_screenshot(page, "community_search_click_failed")
        raise GroupNotFoundError(
            f"Could not click search box for community '{community_jid}'"
        ) from exc

    search_input = find_element_resilient(
        page, "search_input", timeout=_NAVIGATION_TIMEOUT_MS
    )
    if search_input is None:
        capture_screenshot(page, "community_search_input_missing")
        raise GroupNotFoundError(
            f"Search input not found while looking for community '{community_jid}'"
        )

    try:
        search_input.click(timeout=_NAVIGATION_TIMEOUT_MS)
        search_input.click(click_count=3)
        search_input.press("Backspace")
        page.wait_for_timeout(200)
        search_input.type(community_jid, delay=60)
        page.wait_for_timeout(1_500)
    except Exception as exc:
        capture_screenshot(page, "community_search_type_failed")
        raise GroupNotFoundError(
            f"Could not type community name '{community_jid}'"
        ) from exc

    matched = _find_row_by_text(page, community_jid)
    if matched is None:
        capture_screenshot(page, "community_not_found")
        dump_main_dom(page)
        raise GroupNotFoundError(
            f"Community '{community_jid}' not found in search results"
        )

    try:
        matched.click(timeout=_NAVIGATION_TIMEOUT_MS)
        page.wait_for_timeout(1_500)
    except Exception as exc:
        capture_screenshot(page, "community_click_failed")
        raise GroupNotFoundError(
            f"Could not click community '{community_jid}'"
        ) from exc

    logger.debug("Community '%s' opened", community_jid)


def _open_subgroup_in_community(
    page: Page,
    community_jid: str,
    subgroup_jid: str,
) -> None:
    """Locate and click a sub-group within the open community panel."""
    from apps.automation.services import GroupNotFoundError

    page.wait_for_timeout(1_000)

    matched = _find_row_by_text(page, subgroup_jid)
    if matched is None:
        capture_screenshot(page, "subgroup_not_found")
        dump_main_dom(page)
        raise GroupNotFoundError(
            f"Sub-group '{subgroup_jid}' not found within community '{community_jid}'"
        )

    try:
        matched.click(timeout=_NAVIGATION_TIMEOUT_MS)
        page.wait_for_timeout(1_000)
    except Exception as exc:
        capture_screenshot(page, "subgroup_click_failed")
        raise GroupNotFoundError(f"Could not click sub-group '{subgroup_jid}'") from exc

    logger.debug("Sub-group '%s' opened", subgroup_jid)


def _wait_for_compose_box(
    page: Page,
    community_jid: str,
    subgroup_jid: str,
) -> None:
    """Wait for the message compose input to appear after navigation."""
    from apps.automation.selector_registry import find_element_resilient
    from apps.automation.services import SendFailedError

    el = find_element_resilient(page, "message_input", timeout=_NAVIGATION_TIMEOUT_MS)
    if el is None:
        capture_screenshot(page, "subgroup_compose_box_missing")
        dump_main_dom(page)
        raise SendFailedError(
            f"Compose box not found after navigating to community='{community_jid}' "
            f"subgroup='{subgroup_jid}'"
        )


def _find_row_by_text(page: Page, text: str):
    """Return the first visible list-item/row in the chat panel whose text contains *text*.

    Uses a broad structural selector — any role="listitem" or role="row" — which
    survives data-testid rotation. Text matching is case-insensitive.

    Returns:
        Matching Playwright Locator, or None if not found.
    """
    selector = ", ".join(
        [
            'div[data-testid^="list-item"][role="row"]',  # confirmed Apr 2026
            '[data-testid="cell-frame-container"]',
            '#pane-side div[role="row"]',
            '#pane-side div[role="listitem"]',
            'div[role="row"]',
            'div[role="listitem"]',
        ]
    )
    try:
        rows = page.locator(selector)
        count = rows.count()
        text_lower = text.lower()
        for i in range(count):
            row = rows.nth(i)
            try:
                inner = row.inner_text(timeout=2_000).lower()
                if text_lower in inner:
                    return row
            except Exception:
                continue
    except Exception as exc:
        logger.debug("Row text scan failed: %s", exc)
    return None
