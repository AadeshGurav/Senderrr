"""Dashboard admin health view — per-admin session & rate-limit status."""

from __future__ import annotations

from datetime import datetime, timezone

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.automation.models import WorkerSession
from apps.automation.rate_limiter import (
    ADMIN_DAILY_LIMIT,
    ADMIN_HOURLY_LIMIT,
    ADMIN_WARM_UP_DAILY,
    get_admin_daily_count,
    get_admin_hourly_count,
)
from apps.automation.worker_mapping import build_worker_map
from apps.campaigns.models import AdminAccount


@login_required
def admin_health(request: HttpRequest) -> HttpResponse:
    """Return the admin health panel partial for htmx polling."""
    admins = AdminAccount.objects.filter(is_active=True).order_by("pk")
    slots = build_worker_map()

    worker_names = [f"worker-{s.worker_id}" for s in slots]
    db_sessions = {
        ws.worker_id: ws
        for ws in WorkerSession.objects.filter(worker_id__in=worker_names)
    }

    admin_data: list[dict] = []
    for admin in admins:
        daily_limit = _effective_daily_limit(admin)
        hourly_count = get_admin_hourly_count(admin.pk)
        daily_count = get_admin_daily_count(admin.pk)

        admin_slots = [s for s in slots if s.admin_id == admin.pk]
        sessions: list[dict] = []
        for slot in admin_slots:
            wname = f"worker-{slot.worker_id}"
            ws = db_sessions.get(wname)
            sessions.append(_build_session_entry(slot, ws))

        warm_up_day = _warm_up_day(admin)
        admin_data.append(
            {
                "admin": admin,
                "hourly_count": hourly_count,
                "hourly_limit": ADMIN_HOURLY_LIMIT,
                "daily_count": daily_count,
                "daily_limit": daily_limit,
                "warm_up_day": warm_up_day,
                "sessions": sessions,
            }
        )

    return render(
        request,
        "dashboard/partials/admin_health.html",
        {"admin_data": admin_data},
    )


def _build_session_entry(slot: object, ws: WorkerSession | None) -> dict:
    """Build a dict describing one worker session's health."""
    entry = {
        "worker_id": slot.worker_id,
        "session_index": slot.session_index,
        "status": "unknown",
        "browser_status": "",
        "total_sent": 0,
        "total_failed": 0,
        "current_group": "",
    }

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

    return entry


def _effective_daily_limit(admin: AdminAccount) -> int:
    """Return the effective daily limit accounting for warm-up."""
    if admin.skip_warmup or not admin.warm_up_started_at:
        return ADMIN_DAILY_LIMIT
    delta = datetime.now(tz=timezone.utc) - admin.warm_up_started_at
    day_number = delta.days + 1
    if day_number <= 7:
        return ADMIN_WARM_UP_DAILY.get(day_number, ADMIN_DAILY_LIMIT)
    return ADMIN_DAILY_LIMIT


def _warm_up_day(admin: AdminAccount) -> int | None:
    """Return current warm-up day (1-7), or None if past warm-up / skipped."""
    if admin.skip_warmup or not admin.warm_up_started_at:
        return None
    delta = datetime.now(tz=timezone.utc) - admin.warm_up_started_at
    day_number = delta.days + 1
    return day_number if day_number <= 7 else None
