"""Structural DOM probes for WhatsApp Web selector discovery.

Each probe is a self-contained JavaScript IIFE that locates an element by
position/role/semantics — NOT by data-testid or class names — and returns
the most stable CSS selector it can generate for that element.

Verified against live WhatsApp Web DOM, April 2026.
Key structural facts:
  - Search is a real <input role="textbox"> in #side, NOT a contenteditable.
  - #main exists when a chat is open; absent on the splash screen.
  - Send button: button[aria-label="Send"] / span[data-icon="wds-ic-send-filled"].
  - Attach button: button[aria-label="Attach"] / span[data-icon="plus-rounded"].
  - Chat rows: div[data-testid^="list-item"][role="row"] in #pane-side.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)

# Shared JS helper — generates the most stable selector from a DOM element.
# Priority: data-testid > aria-label > placeholder > id > role+data-tab > structural.
_STABLE_SELECTOR_JS = """
function stableSelector(el) {
    if (!el) return null;
    const testid = el.getAttribute('data-testid');
    if (testid) return '[data-testid="' + testid + '"]';
    const label = el.getAttribute('aria-label');
    if (label) return '[aria-label="' + label.replace(/"/g, '\\"') + '"]';
    const ph = el.getAttribute('placeholder');
    if (ph) return '[placeholder="' + ph.replace(/"/g, '\\"') + '"]';
    if (el.id && !el.id.startsWith('_r_')) return '#' + el.id; // skip React random ids
    const role = el.getAttribute('role');
    const tab  = el.getAttribute('data-tab');
    if (role && tab) return '[role="' + role + '"][data-tab="' + tab + '"]';
    const ce  = el.getAttribute('contenteditable');
    const tag = el.tagName.toLowerCase();
    if (ce === 'true') {
        if (role) return tag + '[role="' + role + '"][contenteditable="true"]';
        return '#main ' + tag + '[contenteditable="true"]';
    }
    if (role) return tag + '[role="' + role + '"]';
    return null;
}
"""


def _probe(js_body: str) -> str:
    return _STABLE_SELECTOR_JS + "(function(){\n" + js_body + "\n})();"


_PROBES: dict[str, str] = {
    # ── search_box ──────────────────────────────────────────────────────────
    # In Apr 2026 WA Web: a real <input role="textbox"> inside #side.
    # The container has data-testid="chat-list-search-container".
    "search_box": _probe("""
    const container = document.querySelector('[data-testid="chat-list-search-container"]');
    if (container) return '[data-testid="chat-list-search-container"]';

    const side = document.querySelector('#side');
    if (!side) return null;

    // Prefer the actual input, falling back to any interactive element near the top.
    const cands = [
        ...side.querySelectorAll('input[role="textbox"], input[type="text"]'),
        ...side.querySelectorAll('[role="textbox"], [contenteditable="true"]'),
        ...side.querySelectorAll('[role="search"], header'),
    ].filter(el => el.offsetParent !== null);

    if (!cands.length) return null;
    cands.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    for (const el of cands) {
        const s = stableSelector(el);
        if (s) return s;
    }
    return '#side header';
"""),

    # ── search_input ─────────────────────────────────────────────────────────
    # The actual text-entry element (may be same node as search_box in new WA).
    "search_input": _probe("""
    const side = document.querySelector('#side');
    if (!side) return null;

    // In Apr 2026: <input role="textbox" aria-label="Search or start a new chat">.
    const inputCands = [
        ...side.querySelectorAll('input[role="textbox"], input[type="text"]'),
        ...side.querySelectorAll('[contenteditable="true"]'),
        ...side.querySelectorAll('[role="textbox"]'),
    ].filter(el => el.offsetParent !== null || el.tagName === 'INPUT');

    if (!inputCands.length) return null;
    inputCands.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    for (const el of inputCands) {
        const s = stableSelector(el);
        if (s) return s;
    }
    return null;
"""),

    # ── chat_row ─────────────────────────────────────────────────────────────
    # In Apr 2026: div[data-testid^="list-item"][role="row"] inside #pane-side.
    # cell-frame-container still lives inside each row.
    "chat_row": _probe("""
    const pane = document.querySelector('#pane-side');
    if (!pane) return null;

    // Prefer the numbered list-item wrapper (new pattern).
    const listItem = pane.querySelector('[data-testid^="list-item"][role="row"]');
    if (listItem) return 'div[data-testid^="list-item"][role="row"]';

    // Fallback: cell-frame-container (older builds).
    const cell = pane.querySelector('[data-testid="cell-frame-container"]');
    if (cell) return '[data-testid="cell-frame-container"]';

    // Broadest: any row/listitem role.
    const row = pane.querySelector('[role="row"]');
    if (row) return '#pane-side [role="row"]';
    const li = pane.querySelector('[role="listitem"]');
    if (li) return '#pane-side [role="listitem"]';

    return null;
"""),

    # ── message_input ────────────────────────────────────────────────────────
    # A div[contenteditable="true"][role="textbox"] in #main footer.
    # data-testid="conversation-compose-box-input" confirmed Apr 2026.
    "message_input": _probe("""
    const main = document.querySelector('#main');
    if (!main) return null;

    // Primary: stable testid (confirmed working Apr 2026).
    const byTestid = main.querySelector('[data-testid="conversation-compose-box-input"]');
    if (byTestid && byTestid.offsetParent) return '[data-testid="conversation-compose-box-input"]';

    const areas = [main.querySelector('footer'), main].filter(Boolean);
    for (const area of areas) {
        const cands = [
            ...area.querySelectorAll('[role="textbox"][contenteditable="true"]'),
            ...area.querySelectorAll('[contenteditable="true"]'),
            ...area.querySelectorAll('[role="textbox"]'),
        ].filter(el => el.offsetParent !== null);
        if (!cands.length) continue;
        // Bottommost = compose box (header textbox sits at the top).
        cands.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
        for (const el of cands) {
            const s = stableSelector(el);
            if (s) return s;
        }
    }
    return null;
"""),

    # ── send_button ──────────────────────────────────────────────────────────
    # In Apr 2026: button[aria-label="Send"] / span[data-icon="wds-ic-send-filled"].
    # The button has NO data-testid; only visible when compose box has text.
    "send_button": _probe("""
    const main = document.querySelector('#main');
    if (!main) return null;

    // 1. aria-label on the button itself (most stable, language-aware but English default).
    const btnByLabel = main.querySelector('button[aria-label="Send"]');
    if (btnByLabel && btnByLabel.offsetParent) return 'button[aria-label="Send"]';

    // 2. Icon span inside the button (survives aria-label locale changes).
    const iconNames = ['wds-ic-send-filled', 'send-filled', 'send'];
    for (const name of iconNames) {
        const icon = main.querySelector('span[data-icon="' + name + '"]');
        if (icon && icon.offsetParent) {
            const testid = icon.getAttribute('data-testid');
            if (testid) return '[data-testid="' + testid + '"]';
            return 'span[data-icon="' + name + '"]';
        }
    }

    // 3. Structural: data-tab="11" is the send button slot.
    const tabEl = main.querySelector('[data-tab="11"]');
    if (tabEl && tabEl.offsetParent) return stableSelector(tabEl);

    // 4. Scan all visible buttons for send-related icon child.
    for (const btn of main.querySelectorAll('button,[role="button"]')) {
        if (!btn.offsetParent) continue;
        const lbl = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (lbl.includes('send')) return stableSelector(btn);
        // Check for send icon descendant.
        const child = btn.querySelector('span[data-icon*="send"]');
        if (child) {
            const icon = child.getAttribute('data-icon');
            return 'span[data-icon="' + icon + '"]';
        }
    }
    return null;
"""),
}


def run_probe(name: str, page: "Page") -> str | None:
    """Run the structural DOM probe for *name* against the live page.

    Args:
        name: Named selector key (e.g. "send_button").
        page: Active Playwright page with WhatsApp Web loaded.

    Returns:
        A CSS selector string if the element was found, else None.
    """
    probe_js = _PROBES.get(name)
    if not probe_js:
        logger.debug("No structural probe defined for: %s", name)
        return None
    try:
        result = page.evaluate(probe_js)
        if isinstance(result, str) and result.strip():
            return result.strip()
        return None
    except Exception as exc:
        logger.warning("Structural probe failed for '%s': %s", name, exc)
        return None
