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
    "SCRAPER_TARGET_URL",
    "SCRAPER_REQUEST_TIMEOUT",
    "SCRAPER_MAX_RETRIES",
    "AUTOMATION_JITTER_MIN",
    "AUTOMATION_JITTER_MAX",
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
            age_minutes = (datetime.now(tz=timezone.utc) - checked_dt).total_seconds() / 60
            if age_minutes > 10:
                return {"status": "unknown", "checked_at": checked_at}

        status = "connected" if logged_in else "disconnected"
        return {"status": status, "checked_at": checked_at}
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return {"status": "unknown", "checked_at": ""}
