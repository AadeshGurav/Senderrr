"""Dashboard template tags — helpers for admin warm-up display."""

from __future__ import annotations

from datetime import datetime, timezone

from django import template

register = template.Library()


@register.simple_tag
def warm_up_day(warm_up_started_at: datetime) -> int:
    """Return the current warm-up day number (1-based).

    Day 1 is the day warm-up started.  Returns the day count capped
    at 8 so templates can simply check ``<= 7`` for the active phase.
    """
    if warm_up_started_at is None:
        return 0
    delta = datetime.now(tz=timezone.utc) - warm_up_started_at
    return min(delta.days + 1, 8)
