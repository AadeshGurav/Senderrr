"""Dashboard main view — overview page with groups, broadcasts, status."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.campaigns.models import (
    BroadcastEvent,
    MessageTask,
    WhatsAppCommunity,
    WhatsAppGroup,
)
from apps.dashboard.forms import CommunityForm, GroupForm


@login_required
def index(request: HttpRequest) -> HttpResponse:
    """Render the main dashboard with groups, broadcasts, and status."""
    groups = WhatsAppGroup.objects.select_related("community").all()
    communities = WhatsAppCommunity.objects.prefetch_related("subgroups").all()
    broadcasts = BroadcastEvent.objects.select_related("article")[:10]
    group_form = GroupForm()
    community_form = CommunityForm()

    active_groups = groups.filter(is_active=True).count()
    healthy_groups = groups.filter(is_active=True, is_healthy=True).count()
    unhealthy_groups = groups.filter(is_healthy=False).count()
    total_communities = communities.count()
    active_communities = communities.filter(is_active=True).count()

    max_attempts = getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)
    total_failed = MessageTask.objects.filter(
        status=MessageTask.Status.FAILED,
    ).count()
    retryable_failed = MessageTask.objects.filter(
        status=MessageTask.Status.FAILED,
        attempt_count__lt=max_attempts,
        group__is_active=True,
        group__is_healthy=True,
    ).count()

    return render(
        request,
        "dashboard/index.html",
        {
            "groups": groups,
            "communities": communities,
            "broadcasts": broadcasts,
            "group_form": group_form,
            "community_form": community_form,
            "total_groups": groups.count(),
            "active_groups": active_groups,
            "healthy_groups": healthy_groups,
            "unhealthy_groups": unhealthy_groups,
            "total_communities": total_communities,
            "active_communities": active_communities,
            "total_broadcasts": BroadcastEvent.objects.count(),
            "total_failed": total_failed,
            "retryable_failed": retryable_failed,
        },
    )
