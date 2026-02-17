"""Rate limiting for WhatsApp message sends using Redis counters.

Enforces daily and hourly caps to prevent WhatsApp bans. Uses Redis
TTL-based counters that auto-expire, so no cleanup is needed.
"""

from __future__ import annotations

import logging
import zoneinfo
from datetime import datetime, timezone

import redis
from django.conf import settings

from utils.config import get_config

logger = logging.getLogger(__name__)

HOURLY_KEY = "wa:rate:hourly:{hour}"
DAILY_KEY = "wa:rate:daily:{date}"
WORKER_HOURLY_KEY = "wa:rate:worker:{worker_id}:hourly:{hour}"


def _redis():  # noqa: ANN202
    """Get a Redis connection from the Celery broker URL.

    Socket timeouts prevent the web process from hanging indefinitely
    when Redis is slow or a connection is stale.
    """
    return redis.from_url(
        settings.CELERY_BROKER_URL,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


def get_hourly_count() -> int:
    """Return the number of messages sent in the current hour."""
    key = HOURLY_KEY.format(hour=datetime.now(tz=timezone.utc).strftime("%Y%m%d%H"))
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def get_daily_count() -> int:
    """Return the number of messages sent today (UTC)."""
    key = DAILY_KEY.format(date=datetime.now(tz=timezone.utc).strftime("%Y%m%d"))
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def increment_send_counter(*, worker_id: int | None = None) -> None:
    """Bump global and per-worker counters after a successful send.

    Args:
        worker_id: If provided, also increments the worker-specific
            hourly counter for dashboard display.
    """
    conn = _redis()
    now = datetime.now(tz=timezone.utc)
    hour_str = now.strftime("%Y%m%d%H")

    hourly_key = HOURLY_KEY.format(hour=hour_str)
    daily_key = DAILY_KEY.format(date=now.strftime("%Y%m%d"))

    pipe = conn.pipeline()
    pipe.incr(hourly_key)
    pipe.expire(hourly_key, 3600)
    pipe.incr(daily_key)
    pipe.expire(daily_key, 86400)

    if worker_id is not None:
        worker_key = WORKER_HOURLY_KEY.format(
            worker_id=worker_id, hour=hour_str
        )
        pipe.incr(worker_key)
        pipe.expire(worker_key, 3600)

    pipe.execute()


def get_worker_hourly_count(worker_id: int) -> int:
    """Return messages sent by a specific worker in the current hour."""
    hour_str = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H")
    key = WORKER_HOURLY_KEY.format(worker_id=worker_id, hour=hour_str)
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def check_rate_limit() -> tuple[bool, str]:
    """Check if sending is allowed under current rate limits.

    Returns:
        (allowed, reason) — ``True`` if under limits, else ``False``
        with a human-readable reason.
    """
    # Quiet hours — checked in the project's configured timezone
    quiet_start = int(get_config("AUTOMATION_QUIET_HOUR_START", int))
    quiet_end = int(get_config("AUTOMATION_QUIET_HOUR_END", int))
    tz = zoneinfo.ZoneInfo(settings.TIME_ZONE)
    local_hour = datetime.now(tz=tz).hour
    if quiet_start <= local_hour < quiet_end:
        reason = (
            f"Quiet hours ({quiet_start}:00\u2013{quiet_end}:00 "
            f"{settings.TIME_ZONE})"
        )
        logger.warning("Rate limit: %s", reason)
        return False, reason

    hourly_limit = int(get_config("AUTOMATION_HOURLY_LIMIT", int))
    daily_limit = int(get_config("AUTOMATION_DAILY_LIMIT", int))

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
