"""Dashboard status views — WhatsApp connection status badge."""

from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.dashboard.services import check_whatsapp_status


@login_required
def whatsapp_status(request: HttpRequest) -> HttpResponse:
    """Return the WhatsApp status badge partial for htmx polling."""
    status = check_whatsapp_status()
    return render(
        request,
        "dashboard/partials/whatsapp_status.html",
        {"wa_status": status},
    )
