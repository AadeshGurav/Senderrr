"""Dashboard services — settings management and status checking."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings as django_settings

from apps.dashboard.models import RuntimeSetting

logger = logging.getLogger(__name__)

EDITABLE_SETTINGS = [
    "SCRAPER_REQUEST_TIMEOUT",
    "SCRAPER_MAX_RETRIES",
    "SCRAPER_MAX_ARTICLE_AGE_HOURS",
    "AUTOMATION_JITTER_MIN",
    "AUTOMATION_JITTER_MAX",
    "AUTOMATION_QUIET_HOUR_START",
    "AUTOMATION_QUIET_HOUR_END",
]


def get_current_settings() -> dict[str, object]:
    """Load current values for all editable settings (DB first, then fallback)."""
    overrides = dict(
        RuntimeSetting.objects.filter(key__in=EDITABLE_SETTINGS).values_list(
            "key", "value"
        )
    )
    result: dict[str, object] = {}
    for key in EDITABLE_SETTINGS:
        if key in overrides:
            result[key] = overrides[key]
        else:
            result[key] = getattr(django_settings, key, "")
    return result


def save_settings(data: dict[str, object]) -> None:
    """Persist settings to the RuntimeSetting table."""
    for key in EDITABLE_SETTINGS:
        if key in data:
            RuntimeSetting.objects.update_or_create(
                key=key,
                defaults={"value": str(data[key])},
            )


def check_whatsapp_status() -> dict[str, str]:
    """Read status.json and return connection status info.

    Returns:
        Dict with ``status`` ("connected", "disconnected", "unknown")
        and ``checked_at`` (ISO timestamp or empty string).
    """
    status_file = Path(django_settings.PLAYWRIGHT_USER_DATA_DIR) / "status.json"
    try:
        data = json.loads(status_file.read_text())
        checked_at = data.get("checked_at", "")
        logged_in = data.get("logged_in", False)

        if checked_at:
            checked_dt = datetime.fromisoformat(checked_at)
            age_minutes = (
                datetime.now(tz=timezone.utc) - checked_dt
            ).total_seconds() / 60
            if age_minutes > 10:
                return {"status": "unknown", "checked_at": checked_at}

        status = "connected" if logged_in else "disconnected"
        return {"status": status, "checked_at": checked_at}
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return {"status": "unknown", "checked_at": ""}


def check_all_worker_statuses() -> list[dict[str, object]]:
    """Return connection status for each worker, grouped by admin.

    Uses the admin-based worker map and per-admin rate counters.
    Falls back to JSON status files when no DB heartbeat exists.
    """
    from apps.automation.browser_manager import resolve_user_data_dir
    from apps.automation.models import WorkerSession
    from apps.automation.rate_limiter import get_admin_hourly_count
    from apps.automation.worker_mapping import build_worker_map

    slots = build_worker_map()
    statuses: list[dict[str, object]] = []

    worker_names = [f"worker-{s.worker_id}" for s in slots]
    db_sessions: dict[str, WorkerSession] = {
        ws.worker_id: ws
        for ws in WorkerSession.objects.filter(worker_id__in=worker_names)
    }

    for slot in slots:
        worker_name = f"worker-{slot.worker_id}"
        entry: dict[str, object] = {
            "worker_id": slot.worker_id,
            "admin_id": slot.admin_id,
            "admin_label": slot.admin_label,
            "session_index": slot.session_index,
            "status": "unknown",
            "browser_status": "",
            "checked_at": "",
            "msgs_hr": get_admin_hourly_count(slot.admin_id),
            "total_sent": 0,
            "total_failed": 0,
            "current_group": "",
        }

        ws = db_sessions.get(worker_name)
        if ws and ws.last_heartbeat_at:
            age = (
                datetime.now(tz=timezone.utc) - ws.last_heartbeat_at
            ).total_seconds() / 60
            entry["total_sent"] = ws.total_sent
            entry["total_failed"] = ws.total_failed
            entry["current_group"] = ws.current_group
            entry["browser_status"] = ws.get_browser_status_display()

            if age > 5:
                entry["status"] = "unknown"
            elif ws.browser_status == WorkerSession.BrowserStatus.LOGGED_IN:
                entry["status"] = "connected"
            elif ws.browser_status in (
                WorkerSession.BrowserStatus.QR_REQUIRED,
                WorkerSession.BrowserStatus.BANNED,
            ):
                entry["status"] = "disconnected"
            else:
                entry["status"] = "unknown"

            entry["checked_at"] = ws.last_heartbeat_at.isoformat()
            statuses.append(entry)
            continue

        # Fallback: read JSON status file
        user_data_dir = resolve_user_data_dir(slot.worker_id)
        status_file = Path(user_data_dir) / "status.json"
        try:
            data = json.loads(status_file.read_text())
            checked_at = data.get("checked_at", "")
            logged_in = data.get("logged_in", False)

            if checked_at:
                checked_dt = datetime.fromisoformat(checked_at)
                age = (datetime.now(tz=timezone.utc) - checked_dt).total_seconds() / 60
                if age > 10:
                    entry["status"] = "unknown"
                    entry["checked_at"] = checked_at
                    statuses.append(entry)
                    continue

            entry["status"] = "connected" if logged_in else "disconnected"
            entry["checked_at"] = checked_at
        except (FileNotFoundError, json.JSONDecodeError, ValueError):
            pass

        statuses.append(entry)

    return statuses
