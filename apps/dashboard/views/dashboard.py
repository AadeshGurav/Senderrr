"""Dashboard main view — overview page with groups, broadcasts, status."""

from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.campaigns.models import BroadcastEvent, WhatsAppGroup
from apps.dashboard.forms import GroupForm


@login_required
def index(request: HttpRequest) -> HttpResponse:
    """Render the main dashboard with groups, broadcasts, and status."""
    groups = WhatsAppGroup.objects.all()
    broadcasts = BroadcastEvent.objects.select_related("article")[:10]
    group_form = GroupForm()

    return render(
        request,
        "dashboard/index.html",
        {
            "groups": groups,
            "broadcasts": broadcasts,
            "group_form": group_form,
            "total_groups": groups.count(),
            "active_groups": groups.filter(is_active=True).count(),
            "total_broadcasts": BroadcastEvent.objects.count(),
        },
    )
