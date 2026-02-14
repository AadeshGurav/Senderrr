"""Dashboard broadcast views — recent broadcast listing."""

from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.campaigns.models import BroadcastEvent


@login_required
def broadcast_list(request: HttpRequest) -> HttpResponse:
    """Return the recent broadcasts partial for htmx polling."""
    broadcasts = BroadcastEvent.objects.select_related("article")[:10]
    return render(
        request,
        "dashboard/partials/broadcast_list.html",
        {"broadcasts": broadcasts},
    )
