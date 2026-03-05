"""Dashboard admin-account views — CRUD for WhatsApp sending accounts."""

from __future__ import annotations

import logging

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone

from apps.campaigns.models import AdminAccount
from apps.dashboard.forms import AdminForm

logger = logging.getLogger(__name__)


@login_required
def add_admin(request: HttpRequest) -> HttpResponse:
    """Create a new admin account and return the updated list partial."""
    form = AdminForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        admin = form.save(commit=False)
        admin.warm_up_started_at = timezone.now()
        admin.save()
        logger.info("Admin account created: %s", admin.label)
        return _admin_list_response(
            request,
            success=f"Admin '{admin.label}' added. Restart services (make start) to initialize browser sessions.",
        )
    return render(
        request,
        "dashboard/partials/admin_form.html",
        {"admin_form": form},
    )


@login_required
def toggle_admin(request: HttpRequest, pk: int) -> HttpResponse:
    """Toggle an admin's active status and return the updated row."""
    admin = get_object_or_404(AdminAccount, pk=pk)
    if request.method == "POST":
        admin.is_active = not admin.is_active
        admin.save(update_fields=["is_active"])
        logger.info("Admin %s toggled to %s", admin.label, admin.is_active)
    return render(
        request,
        "dashboard/partials/admin_row.html",
        {"admin": admin},
    )


@login_required
def edit_admin(request: HttpRequest, pk: int) -> HttpResponse:
    """Edit an admin account's details and return the updated row."""
    admin = get_object_or_404(AdminAccount, pk=pk)
    if request.method == "POST":
        form = AdminForm(request.POST, instance=admin)
        if form.is_valid():
            form.save()
            logger.info("Admin %s updated", admin.label)
            return render(
                request,
                "dashboard/partials/admin_row.html",
                {"admin": admin},
            )
        return render(
            request,
            "dashboard/partials/admin_edit_form.html",
            {"admin": admin, "admin_form": form},
        )
    form = AdminForm(instance=admin)
    return render(
        request,
        "dashboard/partials/admin_edit_form.html",
        {"admin": admin, "admin_form": form},
    )


@login_required
def delete_admin(request: HttpRequest, pk: int) -> HttpResponse:
    """Delete an admin account and return the updated list."""
    admin = get_object_or_404(AdminAccount, pk=pk)
    if request.method == "POST":
        logger.info("Admin account deleted: %s", admin.label)
        admin.delete()
    return _admin_list_response(request)


def _admin_list_response(request: HttpRequest, *, success: str = "") -> HttpResponse:
    """Render the full admin list partial."""
    admins = AdminAccount.objects.all()
    return render(
        request,
        "dashboard/partials/admin_list.html",
        {"admins": admins, "admin_form": AdminForm(), "success_message": success},
    )
