"""Attempt tracker — record, classify, and update delivery attempts."""

from __future__ import annotations

import logging

from django.conf import settings
from django.db.models import F
from django.utils import timezone
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.campaigns.models import (
    ErrorCategory,
    MessageAttempt,
    MessageTask,
    WhatsAppGroup,
)

logger = logging.getLogger(__name__)


def record_attempt_start(message_task: MessageTask) -> MessageAttempt:
    """Create a new attempt row and bump the task's attempt_count.

    Returns:
        The newly created ``MessageAttempt`` in STARTED status.
    """
    MessageTask.objects.filter(pk=message_task.pk).update(
        attempt_count=F("attempt_count") + 1,
        last_attempted_at=timezone.now(),
    )
    message_task.refresh_from_db()

    attempt = MessageAttempt.objects.create(
        message_task=message_task,
        attempt_number=message_task.attempt_count,
        status=MessageAttempt.Status.STARTED,
    )
    return attempt


def record_attempt_success(attempt: MessageAttempt) -> None:
    """Mark an attempt as succeeded and update group health stats."""
    now = timezone.now()
    attempt.status = MessageAttempt.Status.SUCCEEDED
    attempt.completed_at = now
    attempt.save(update_fields=["status", "completed_at"])

    group = attempt.message_task.group
    WhatsAppGroup.objects.filter(pk=group.pk).update(
        total_sent=F("total_sent") + 1,
        last_sent_at=now,
        consecutive_failures=0,
        is_healthy=True,
    )


def record_attempt_failure(
    attempt: MessageAttempt,
    error_category: str,
    error_message: str,
    screenshot_path: str = "",
    *,
    count_as_failure: bool = True,
) -> None:
    """Mark an attempt as failed and update group health stats.

    Args:
        count_as_failure: When ``False``, increments ``total_failed`` but does
            NOT bump ``consecutive_failures`` — used for transient rate-limit
            refusals that don't indicate a broken group.

    Auto-disables the group if consecutive failures exceed the threshold.
    """
    now = timezone.now()
    attempt.status = MessageAttempt.Status.FAILED
    attempt.error_category = error_category
    attempt.error_message = error_message[:2000]
    attempt.screenshot_path = screenshot_path
    attempt.completed_at = now
    attempt.save(
        update_fields=[
            "status",
            "error_category",
            "error_message",
            "screenshot_path",
            "completed_at",
        ]
    )

    group = attempt.message_task.group
    group_updates: dict = {
        "total_failed": F("total_failed") + 1,
        "last_failed_at": now,
    }
    if count_as_failure:
        group_updates["consecutive_failures"] = F("consecutive_failures") + 1
    WhatsAppGroup.objects.filter(pk=group.pk).update(**group_updates)

    if not count_as_failure:
        return

    group.refresh_from_db()

    threshold = getattr(settings, "GROUP_MAX_CONSECUTIVE_FAILURES", 5)
    auto_disable = getattr(settings, "GROUP_AUTO_DISABLE_ON_UNHEALTHY", False)

    if group.consecutive_failures >= threshold:
        updates: dict[str, bool] = {"is_healthy": False}
        if auto_disable:
            updates["is_active"] = False
        WhatsAppGroup.objects.filter(pk=group.pk).update(**updates)
        logger.warning(
            "Group '%s' marked unhealthy after %d consecutive failures.",
            group.name,
            group.consecutive_failures,
        )


def classify_error(exc: Exception) -> str:
    """Map an exception to an ``ErrorCategory`` value.

    Returns:
        The ``ErrorCategory`` string matching the exception type/message.
    """
    msg = str(exc).lower()

    if isinstance(exc, PlaywrightTimeout):
        return ErrorCategory.TIMEOUT

    if "rate limit" in msg:
        return ErrorCategory.RATE_LIMITED

    if "session" in msg or "qr" in msg or "re-auth" in msg:
        return ErrorCategory.SESSION_EXPIRED

    if "not found" in msg or "could not find" in msg:
        return ErrorCategory.GROUP_NOT_FOUND

    if "captcha" in msg or "banned" in msg or "unusual activity" in msg:
        return ErrorCategory.BOT_DETECTED

    if "send button" in msg or "compose" in msg or "input box" in msg:
        return ErrorCategory.SEND_FAILED

    return ErrorCategory.UNKNOWN
