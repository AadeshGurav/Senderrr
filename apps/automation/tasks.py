"""Automation Celery tasks — thin wrappers around the service layer."""

from __future__ import annotations

import logging
import os

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.automation.tasks.send_whatsapp_message",
    max_retries=2,
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
    from apps.automation.services import (
        BotDetectedError,
        SessionExpiredError,
        send_message_to_group,
    )

    try:
        success = send_message_to_group(group_jid=group_jid, message=message)
    except (SessionExpiredError, BotDetectedError) as exc:
        # Unrecoverable — re-authentication required; do not retry.
        logger.error("Unrecoverable automation error: %s", exc)
        raise
    except Exception as exc:
        logger.error("Automation task failed: %s", exc, exc_info=True)
        backoff = 180 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)

    if success:
        return f"Sent to {group_jid}"

    return f"Failed to send to {group_jid}"


@shared_task(
    bind=True,
    name="apps.automation.tasks.dispatch_heartbeats",
    max_retries=0,
    acks_late=False,
)
def dispatch_heartbeats(self) -> str:  # noqa: ANN001
    """Fan-out a heartbeat task to every active worker queue.

    Runs from beat every 2 minutes.  Beat only needs this one entry
    regardless of how many admins / workers are configured.
    """
    from apps.automation.worker_mapping import build_worker_map

    slots = build_worker_map()
    for slot in slots:
        worker_heartbeat.apply_async(queue=f"wa-worker-{slot.worker_id}")
    return f"Dispatched heartbeats to {len(slots)} worker(s)"


@shared_task(
    bind=True,
    name="apps.automation.tasks.worker_heartbeat",
    max_retries=0,
    acks_late=True,
)
def worker_heartbeat(self) -> str:  # noqa: ANN001
    """Periodic health check — probes browser state and records heartbeat.

    Runs every 2 minutes via celery-beat. Updates the WorkerSession
    with current browser/session status.
    """
    from apps.automation.browser_manager import PlaywrightBrowserManager
    from apps.automation.models import WorkerSession
    from apps.automation.worker_tracker import record_heartbeat, register_worker

    worker_id = int(os.environ.get("WA_WORKER_ID", "0"))
    worker_name = f"worker-{worker_id}"

    register_worker(worker_name)

    manager = PlaywrightBrowserManager()
    browser_status = WorkerSession.BrowserStatus.UNKNOWN

    try:
        page = manager.get_page()
        if page is None:
            browser_status = WorkerSession.BrowserStatus.LAUNCHING
        else:
            from apps.automation.navigation_helpers import _ensure_whatsapp_loaded
            from apps.automation.safety_guards import check_session_health

            _ensure_whatsapp_loaded(page)
            healthy, issue = check_session_health(page)
            if healthy:
                browser_status = WorkerSession.BrowserStatus.LOGGED_IN
            elif "qr" in issue.lower():
                browser_status = WorkerSession.BrowserStatus.QR_REQUIRED
            elif "banned" in issue.lower() or "captcha" in issue.lower():
                browser_status = WorkerSession.BrowserStatus.BANNED
            else:
                browser_status = WorkerSession.BrowserStatus.QR_REQUIRED
    except Exception as exc:
        logger.warning("Heartbeat browser probe failed: %s", exc)
        browser_status = WorkerSession.BrowserStatus.UNKNOWN

    record_heartbeat(worker_name, browser_status)
    return f"{worker_name}: browser={browser_status}"


@shared_task(
    bind=True,
    name="apps.automation.tasks.validate_selectors",
    max_retries=0,
    acks_late=True,
)
def validate_selectors(self) -> str:  # noqa: ANN001
    """Re-validate all WhatsApp Web CSS selectors against the live DOM.

    Runs once per week via celery-beat (dispatched to wa-worker-0). When a
    selector has drifted after a WhatsApp DOM rotation, the structural probe
    discovers the new selector and persists it to the DB so every worker
    picks it up on its next use — zero manual intervention required.
    """
    from apps.automation.browser_manager import PlaywrightBrowserManager
    from apps.automation.navigation_helpers import _ensure_whatsapp_loaded
    from apps.automation.selector_registry import validate_all_selectors

    manager = PlaywrightBrowserManager()
    page = manager.get_page()
    if page is None:
        return "validate_selectors: no browser page — skipped"

    try:
        _ensure_whatsapp_loaded(page, load_timeout=30_000)
    except Exception as exc:
        logger.warning("Selector validation aborted — WA not ready: %s", exc)
        return f"validate_selectors: WA not ready ({exc})"

    results = validate_all_selectors(page)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    logger.info("Selector validation complete: %d/%d — %s", passed, total, results)
    return f"validate_selectors: {passed}/{total} healthy"
