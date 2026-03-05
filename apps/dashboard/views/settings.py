"""Dashboard settings views — edit runtime configuration."""

from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from apps.dashboard.forms import SettingsForm
from apps.dashboard.services import get_current_settings, save_settings


@login_required
def settings_view(request: HttpRequest) -> HttpResponse:
    """Display and handle the settings form."""
    if request.method == "POST":
        form = SettingsForm(request.POST)
        if form.is_valid():
            save_settings(form.cleaned_data)
            return render(
                request,
                "dashboard/partials/settings_form.html",
                {"settings_form": form, "saved": True},
            )
    else:
        form = SettingsForm(initial=get_current_settings())

    return render(
        request,
        "dashboard/pages/settings.html",
        {"settings_form": form},
    )
