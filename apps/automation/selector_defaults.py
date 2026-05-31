"""Hardcoded CSS selector fallbacks — verified against live WhatsApp Web DOM (Apr 2026).

Each value is a comma-separated CSS string. Playwright tries each candidate
in order until it finds a visible match, so the list goes most-specific → broadest.

This module is the single source of truth for fallback selectors.
``selector_registry`` reads these when no DB record exists.
``services.SELECTORS`` mirrors this for the legacy attach path.

Key DOM facts (Apr 2026):
  - Search input is a real <input role="textbox">, NOT a contenteditable div.
  - Attach button: aria-label="Attach" / icon "plus-rounded" (was "clip").
  - Send button: no data-testid; use aria-label="Send" / wds-ic-send-filled.
  - Chat rows: data-testid^="list-item" role="row" (cell-frame-container still
    exists inside each row but is no longer the row itself).
  - QR screen: data-testid="link-device-qr-code".
"""

from __future__ import annotations

SELECTOR_DEFAULTS: dict[str, str] = {
    "search_box": ", ".join(
        [
            '[data-testid="chat-list-search-container"]',
            'input[aria-label="Search or start a new chat"]',
            '[aria-label="Search or start a new chat"]',
            '[data-testid="chat-list-search"]',
            "#side header",
        ]
    ),
    "search_input": ", ".join(
        [
            'input[aria-label="Search or start a new chat"]',
            '[aria-label="Search or start a new chat"]',
            'input[placeholder="Search or start a new chat"]',
            '[placeholder="Search or start a new chat"]',
            '[data-tab="3"][role="textbox"]',
            '[data-testid="search-input"]',
            'div[role="textbox"][data-tab="3"]',
        ]
    ),
    "chat_row": ", ".join(
        [
            'div[data-testid^="list-item"][role="row"]',
            '[data-testid="cell-frame-container"]',
            '#pane-side [role="row"]',
            '#pane-side [role="listitem"]',
        ]
    ),
    "message_input": ", ".join(
        [
            '[data-testid="conversation-compose-box-input"]',
            '[data-testid="compose-box"] [contenteditable="true"]',
            'div[role="textbox"][contenteditable="true"][data-tab="10"]',
            '#main footer div[contenteditable="true"]',
            '[data-testid="lexical-rich-text-input"]',
            '#main div[contenteditable="true"][role="textbox"]',
            '#main div[contenteditable="true"]',
        ]
    ),
    "send_button": ", ".join(
        [
            'button[aria-label="Send"]',
            '[data-testid="wds-ic-send-filled"]',
            'span[data-icon="wds-ic-send-filled"]',
            'button[data-tab="11"]',
            '[data-testid="send"]',
            '[data-testid="compose-btn-send"]',
            'span[data-icon="send"]',
            'span[data-icon="send-light"]',
        ]
    ),
}
