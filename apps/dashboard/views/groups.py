"""Dashboard group views — CRUD with htmx partial responses."""

from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render

from apps.campaigns.models import WhatsAppGroup
from apps.dashboard.forms import GroupForm


@login_required
def add_group(request: HttpRequest) -> HttpResponse:
    """Add a new WhatsApp group and return the updated list partial."""
    form = GroupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        form.save()
        groups = WhatsAppGroup.objects.all()
        return render(
            request,
            "dashboard/partials/group_list.html",
            {"groups": groups, "group_form": GroupForm()},
        )
    return render(
        request,
        "dashboard/partials/group_form.html",
        {"group_form": form},
    )


@login_required
def toggle_group(request: HttpRequest, pk: int) -> HttpResponse:
    """Toggle a group's active status and return the updated row."""
    group = get_object_or_404(WhatsAppGroup, pk=pk)
    if request.method == "POST":
        group.is_active = not group.is_active
        group.save(update_fields=["is_active"])
    return render(
        request,
        "dashboard/partials/group_row.html",
        {"group": group},
    )


@login_required
def mark_healthy(request: HttpRequest, pk: int) -> HttpResponse:
    """Reset a group's health: clear failures, mark healthy and active."""
    group = get_object_or_404(WhatsAppGroup, pk=pk)
    if request.method == "POST":
        group.is_healthy = True
        group.is_active = True
        group.consecutive_failures = 0
        group.save(update_fields=["is_healthy", "is_active", "consecutive_failures"])
    return render(
        request,
        "dashboard/partials/group_row.html",
        {"group": group},
    )


@login_required
def delete_group(request: HttpRequest, pk: int) -> HttpResponse:
    """Delete a group and return the updated list partial."""
    group = get_object_or_404(WhatsAppGroup, pk=pk)
    if request.method == "POST":
        group.delete()
    groups = WhatsAppGroup.objects.all()
    return render(
        request,
        "dashboard/partials/group_list.html",
        {"groups": groups, "group_form": GroupForm()},
    )
