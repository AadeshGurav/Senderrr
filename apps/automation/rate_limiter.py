"""Per-admin rate limiting for WhatsApp message sends using Redis counters.

Enforces hardcoded daily and hourly caps per admin account based on
WhatsApp's observed thresholds. New numbers go through a 7-day warm-up
phase with progressively increasing limits.
"""

from __future__ import annotations

import logging
import os
import zoneinfo
from datetime import datetime, timezone

import redis
from django.conf import settings

logger = logging.getLogger(__name__)

# --- Hardcoded limits (NOT user-configurable) ---
ADMIN_HOURLY_LIMIT = 15
ADMIN_DAILY_LIMIT = 60

# Daily limits during warm-up (day number → max daily sends).
# Day 1 is the day warm_up_started_at was set.
ADMIN_WARM_UP_DAILY = {
    1: 10,
    2: 25,
    3: 25,
    4: 40,
    5: 40,
    6: 60,
    7: 60,
}

# Redis key templates
ADMIN_HOURLY_KEY = "wa:rate:admin:{admin_id}:hourly:{hour}"
ADMIN_DAILY_KEY = "wa:rate:admin:{admin_id}:daily:{date}"
GLOBAL_HOURLY_KEY = "wa:rate:hourly:{hour}"
GLOBAL_DAILY_KEY = "wa:rate:daily:{date}"


def _redis():  # noqa: ANN202
    """Get a Redis connection from the Celery broker URL."""
    return redis.from_url(
        settings.CELERY_BROKER_URL,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


def get_admin_hourly_count(admin_id: int) -> int:
    """Return messages sent by a specific admin in the current hour."""
    hour_str = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H")
    key = ADMIN_HOURLY_KEY.format(admin_id=admin_id, hour=hour_str)
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def get_admin_daily_count(admin_id: int) -> int:
    """Return messages sent by a specific admin today (UTC)."""
    date_str = datetime.now(tz=timezone.utc).strftime("%Y%m%d")
    key = ADMIN_DAILY_KEY.format(admin_id=admin_id, date=date_str)
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def get_hourly_count() -> int:
    """Return total messages sent across all admins in the current hour."""
    key = GLOBAL_HOURLY_KEY.format(
        hour=datetime.now(tz=timezone.utc).strftime("%Y%m%d%H")
    )
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def get_daily_count() -> int:
    """Return total messages sent across all admins today (UTC)."""
    key = GLOBAL_DAILY_KEY.format(date=datetime.now(tz=timezone.utc).strftime("%Y%m%d"))
    try:
        return int(_redis().get(key) or 0)
    except redis.RedisError:
        return 0


def increment_send_counter(*, worker_id: int | None = None) -> None:
    """Bump global and per-admin counters after a successful send."""
    conn = _redis()
    now = datetime.now(tz=timezone.utc)
    hour_str = now.strftime("%Y%m%d%H")
    date_str = now.strftime("%Y%m%d")

    pipe = conn.pipeline()

    # Global counters
    g_hourly = GLOBAL_HOURLY_KEY.format(hour=hour_str)
    g_daily = GLOBAL_DAILY_KEY.format(date=date_str)
    pipe.incr(g_hourly)
    pipe.expire(g_hourly, 3600)
    pipe.incr(g_daily)
    pipe.expire(g_daily, 86400)

    # Per-admin counters
    admin_id = int(os.environ.get("WA_ADMIN_ID", "-1"))
    if admin_id >= 0:
        a_hourly = ADMIN_HOURLY_KEY.format(admin_id=admin_id, hour=hour_str)
        a_daily = ADMIN_DAILY_KEY.format(admin_id=admin_id, date=date_str)
        pipe.incr(a_hourly)
        pipe.expire(a_hourly, 3600)
        pipe.incr(a_daily)
        pipe.expire(a_daily, 86400)

    pipe.execute()


def check_rate_limit() -> tuple[bool, str]:
    """Check if sending is allowed for the current worker's admin.

    Returns:
        (allowed, reason) — ``True`` if under limits, else ``False``
        with a human-readable reason.
    """
    # Quiet hours
    quiet_start = int(getattr(settings, "AUTOMATION_QUIET_HOUR_START", 1))
    quiet_end = int(getattr(settings, "AUTOMATION_QUIET_HOUR_END", 7))
    tz = zoneinfo.ZoneInfo(settings.TIME_ZONE)
    local_hour = datetime.now(tz=tz).hour
    if quiet_start <= local_hour < quiet_end:
        reason = (
            f"Quiet hours ({quiet_start}:00\u2013{quiet_end}:00 {settings.TIME_ZONE})"
        )
        logger.warning("Rate limit: %s", reason)
        return False, reason

    admin_id = int(os.environ.get("WA_ADMIN_ID", "-1"))
    if admin_id < 0:
        return True, ""

    # Per-admin hourly check
    hourly = get_admin_hourly_count(admin_id)
    if hourly >= ADMIN_HOURLY_LIMIT:
        reason = f"Admin {admin_id} hourly limit ({hourly}/{ADMIN_HOURLY_LIMIT})"
        logger.warning("Rate limit: %s", reason)
        return False, reason

    # Per-admin daily check (with warm-up scaling)
    daily_limit = _get_daily_limit_for_admin(admin_id)
    daily = get_admin_daily_count(admin_id)
    if daily >= daily_limit:
        reason = f"Admin {admin_id} daily limit ({daily}/{daily_limit})"
        logger.warning("Rate limit: %s", reason)
        return False, reason

    return True, ""


def _get_daily_limit_for_admin(admin_id: int) -> int:
    """Return the daily send limit, accounting for warm-up phase."""
    try:
        from apps.campaigns.models import AdminAccount

        admin = AdminAccount.objects.filter(pk=admin_id).first()
        if admin and admin.warm_up_started_at:
            delta = datetime.now(tz=timezone.utc) - admin.warm_up_started_at
            day_number = delta.days + 1
            if day_number <= 7:
                return ADMIN_WARM_UP_DAILY.get(day_number, ADMIN_DAILY_LIMIT)
    except Exception:
        pass

    return ADMIN_DAILY_LIMIT
