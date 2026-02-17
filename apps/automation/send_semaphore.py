"""Redis-based semaphore to cap concurrent sends from a single IP.

Prevents multiple workers from clicking "send" at the exact same
instant, which would create a detectable burst of traffic to
WhatsApp servers.
"""

from __future__ import annotations

import logging
import time
import uuid

import redis
from django.conf import settings

from utils.config import get_config

logger = logging.getLogger(__name__)

SEMAPHORE_KEY = "wa:send_semaphore"
LOCK_TTL = 300  # 5 min max hold time (safety net against crashes)


def _redis() -> redis.Redis:
    """Get a Redis connection from the Celery broker URL."""
    return redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)


def acquire_send_slot(timeout: int = 600) -> str | None:
    """Block until a concurrent-send slot is available.

    Args:
        timeout: Maximum seconds to wait for a slot.

    Returns:
        A unique token to pass to ``release_send_slot``, or ``None``
        if the timeout expires.
    """
    max_slots = int(get_config("AUTOMATION_MAX_CONCURRENT_SENDS", int))
    conn = _redis()
    token = uuid.uuid4().hex
    deadline = time.time() + timeout

    while time.time() < deadline:
        current = conn.llen(SEMAPHORE_KEY)
        if current < max_slots:
            conn.rpush(SEMAPHORE_KEY, token)
            conn.expire(SEMAPHORE_KEY, LOCK_TTL)
            return token
        time.sleep(5)

    logger.warning("Timed out waiting for send slot after %ds.", timeout)
    return None


def release_send_slot(token: str) -> None:
    """Release a previously acquired send slot."""
    conn = _redis()
    conn.lrem(SEMAPHORE_KEY, 1, token)
