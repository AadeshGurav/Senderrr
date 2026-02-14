"""Automation Celery tasks — thin wrappers around the service layer."""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.automation.tasks.send_whatsapp_message",
    max_retries=1,
    default_retry_delay=180,
    acks_late=True,
)
def send_whatsapp_message(
    self,  # noqa: ANN001
    group_jid: str,
    message: str,
) -> str:
    """Send a single WhatsApp message via browser automation.

    This task exists so the automation layer can also be invoked
    independently (outside of the campaign pipeline) if needed.
    """
    from apps.automation.services import send_message_to_group

    try:
        success = send_message_to_group(group_jid=group_jid, message=message)
    except Exception as exc:
        logger.error("Automation task failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)

    if success:
        return f"Sent to {group_jid}"

    return f"Failed to send to {group_jid}"
