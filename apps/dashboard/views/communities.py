"""Dashboard community views — CRUD and manual broadcast trigger."""

from __future__ import annotations

import logging

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render

from apps.campaigns.models import WhatsAppCommunity
from apps.dashboard.forms import CommunityForm

logger = logging.getLogger(__name__)


@login_required
def add_community(request: HttpRequest) -> HttpResponse:
    """Add a new WhatsApp Community and return the updated list partial."""
    form = CommunityForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        form.save()
        return _community_list_response(request)
    return render(
        request,
        "dashboard/partials/community_form.html",
        {"community_form": form},
    )


@login_required
def toggle_community(request: HttpRequest, pk: int) -> HttpResponse:
    """Toggle a community's active status and return the updated row."""
    community = get_object_or_404(WhatsAppCommunity, pk=pk)
    if request.method == "POST":
        community.is_active = not community.is_active
        community.save(update_fields=["is_active"])
    return render(
        request,
        "dashboard/partials/community_row.html",
        {"community": community},
    )


@login_required
def delete_community(request: HttpRequest, pk: int) -> HttpResponse:
    """Delete a community (sub-groups become standalone) and return updated list."""
    community = get_object_or_404(WhatsAppCommunity, pk=pk)
    if request.method == "POST":
        community.delete()
    return _community_list_response(request)


@login_required
def community_subgroups(request: HttpRequest, pk: int) -> HttpResponse:
    """Return the sub-groups partial for htmx accordion expand."""
    community = get_object_or_404(
        WhatsAppCommunity.objects.prefetch_related("subgroups"), pk=pk
    )
    return render(
        request,
        "dashboard/partials/community_subgroups.html",
        {"community": community},
    )


@login_required
def trigger_community_broadcast(request: HttpRequest, pk: int) -> HttpResponse:
    """Trigger a manual broadcast for a specific community.

    Uses the most recently scraped article. Returns the updated community row.
    """
    from apps.scraper.models import ScrapedArticle

    community = get_object_or_404(WhatsAppCommunity, pk=pk)

    if request.method == "POST":
        article = ScrapedArticle.objects.order_by("-created_at").first()
        if article is None:
            logger.warning("No articles found — cannot trigger community broadcast.")
            return render(
                request,
                "dashboard/partials/community_row.html",
                {"community": community, "broadcast_error": "No articles found."},
            )

        from apps.campaigns.community_tasks import fan_out_community_broadcast

        fan_out_community_broadcast.delay(
            community_pk=community.pk,
            article_pk=article.pk,
        )
        logger.info(
            "Manual community broadcast triggered: community=%d article=%d",
            community.pk,
            article.pk,
        )

    return render(
        request,
        "dashboard/partials/community_row.html",
        {"community": community, "broadcast_queued": True},
    )


def _community_list_response(request: HttpRequest) -> HttpResponse:
    """Render the full community list partial."""
    communities = WhatsAppCommunity.objects.prefetch_related("subgroups").all()
    return render(
        request,
        "dashboard/partials/community_list.html",
        {"communities": communities, "community_form": CommunityForm()},
    )
