"""Dashboard page views — overview and dedicated section pages."""

from __future__ import annotations

from django.conf import settings
from django.core.paginator import Paginator
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.campaigns.models import (
    AdminAccount,
    BroadcastEvent,
    MessageTask,
    WhatsAppCommunity,
    WhatsAppGroup,
)
from apps.dashboard.forms import AdminForm, CommunityForm, GroupForm


def _base_stats() -> dict:
    """Compute summary stats shared across multiple pages."""
    groups = WhatsAppGroup.objects.all()
    communities = WhatsAppCommunity.objects.all()
    admins = AdminAccount.objects.all()

    max_attempts = getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)
    total_failed = MessageTask.objects.filter(status=MessageTask.Status.FAILED).count()
    retryable_failed = MessageTask.objects.filter(
        status=MessageTask.Status.FAILED,
        attempt_count__lt=max_attempts,
        group__is_active=True,
        group__is_healthy=True,
    ).count()

    return {
        "total_admins": admins.count(),
        "active_admins": admins.filter(is_active=True).count(),
        "total_groups": groups.count(),
        "active_groups": groups.filter(is_active=True).count(),
        "healthy_groups": groups.filter(is_active=True, is_healthy=True).count(),
        "unhealthy_groups": groups.filter(is_healthy=False).count(),
        "total_communities": communities.count(),
        "active_communities": communities.filter(is_active=True).count(),
        "total_broadcasts": BroadcastEvent.objects.count(),
        "total_failed": total_failed,
        "retryable_failed": retryable_failed,
    }


def index(request: HttpRequest) -> HttpResponse:
    """Render the overview page with top-level stats and live widgets."""
    return render(request, "dashboard/overview.html", _base_stats())


def admins_page(request: HttpRequest) -> HttpResponse:
    """Render the admins management page."""
    admins = AdminAccount.objects.all()
    return render(
        request,
        "dashboard/pages/admins.html",
        {
            "admins": admins,
            "admin_form": AdminForm(),
            **_base_stats(),
        },
    )


def groups_page(request: HttpRequest) -> HttpResponse:
    """Render the groups management page."""
    groups = WhatsAppGroup.objects.select_related("community").all()
    return render(
        request,
        "dashboard/pages/groups.html",
        {
            "groups": groups,
            "group_form": GroupForm(),
            **_base_stats(),
        },
    )


def communities_page(request: HttpRequest) -> HttpResponse:
    """Render the communities management page."""
    communities = WhatsAppCommunity.objects.prefetch_related("subgroups").all()
    return render(
        request,
        "dashboard/pages/communities.html",
        {
            "communities": communities,
            "community_form": CommunityForm(),
            **_base_stats(),
        },
    )


def broadcasts_page(request: HttpRequest) -> HttpResponse:
    """Render the broadcasts history page with pagination."""
    max_attempts = getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)
    qs = BroadcastEvent.objects.select_related("article").order_by("-created_at")
    paginator = Paginator(qs, 20)
    page = paginator.get_page(request.GET.get("page", 1))

    for b in page:
        b.retryable_count = MessageTask.objects.filter(
            broadcast=b,
            status=MessageTask.Status.FAILED,
            attempt_count__lt=max_attempts,
            group__is_active=True,
            group__is_healthy=True,
        ).count()
        b.stuck_count = MessageTask.objects.filter(
            broadcast=b,
            status__in=[MessageTask.Status.QUEUED, MessageTask.Status.SENDING],
        ).count()
        b.can_resend = (
            b.status == BroadcastEvent.Status.IN_PROGRESS and b.stuck_count == 0
        )
        b.is_retrying = b.stuck_count > 0 and b.failed_count > 0

    return render(
        request,
        "dashboard/pages/broadcasts.html",
        {
            "broadcasts": page,
            "page": page,
            "paginator": paginator,
            **_base_stats(),
        },
    )
