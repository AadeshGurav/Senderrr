"""Rate limiting for WhatsApp message sends using Redis counters.

Enforces daily and hourly caps to prevent WhatsApp bans. Uses Redis
TTL-based counters that auto-expire, so no cleanup is needed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import redis
from django.conf import settings

logger = logging.getLogger(__name__)

HOURLY_KEY = "wa:rate:hourly:{hour}"
DAILY_KEY = "wa:rate:daily:{date}"


def _redis():  # noqa: ANN202
    """Get a Redis connection from the Celery broker URL."""
    return redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)


def get_hourly_count() -> int:
    """Return the number of messages sent in the current hour."""
    key = HOURLY_KEY.format(hour=datetime.now(tz=timezone.utc).strftime("%Y%m%d%H"))
    return int(_redis().get(key) or 0)


def get_daily_count() -> int:
    """Return the number of messages sent today (UTC)."""
    key = DAILY_KEY.format(date=datetime.now(tz=timezone.utc).strftime("%Y%m%d"))
    return int(_redis().get(key) or 0)


def increment_send_counter() -> None:
    """Bump both hourly and daily counters after a successful send."""
    conn = _redis()
    now = datetime.now(tz=timezone.utc)

    hourly_key = HOURLY_KEY.format(hour=now.strftime("%Y%m%d%H"))
    daily_key = DAILY_KEY.format(date=now.strftime("%Y%m%d"))

    pipe = conn.pipeline()
    pipe.incr(hourly_key)
    pipe.expire(hourly_key, 3600)
    pipe.incr(daily_key)
    pipe.expire(daily_key, 86400)
    pipe.execute()


def check_rate_limit() -> tuple[bool, str]:
    """Check if sending is allowed under current rate limits.

    Returns:
        (allowed, reason) — ``True`` if under limits, else ``False``
        with a human-readable reason.
    """
    # Quiet hours check
    quiet_start = getattr(settings, "AUTOMATION_QUIET_HOUR_START", 1)
    quiet_end = getattr(settings, "AUTOMATION_QUIET_HOUR_END", 7)
    current_hour = datetime.now(tz=timezone.utc).hour
    if quiet_start <= current_hour < quiet_end:
        reason = f"Quiet hours ({quiet_start}:00\u2013{quiet_end}:00 UTC)"
        logger.warning("Rate limit: %s", reason)
        return False, reason

    hourly_limit = getattr(settings, "AUTOMATION_HOURLY_LIMIT", 30)
    daily_limit = getattr(settings, "AUTOMATION_DAILY_LIMIT", 150)

    hourly = get_hourly_count()
    if hourly >= hourly_limit:
        reason = f"Hourly limit reached ({hourly}/{hourly_limit})"
        logger.warning("Rate limit: %s", reason)
        return False, reason

    daily = get_daily_count()
    if daily >= daily_limit:
        reason = f"Daily limit reached ({daily}/{daily_limit})"
        logger.warning("Rate limit: %s", reason)
        return False, reason

    return True, ""
