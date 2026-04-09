"""Dashboard views — message template management."""

from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from apps.campaigns.message_template_models import DEFAULT_TEMPLATE_TEXT, MessageTemplate
from apps.campaigns.template_renderer import activate_template, render_message
from apps.dashboard.forms import MessageTemplateForm


def message_templates_page(request: HttpRequest) -> HttpResponse:
    """Render the message template editor page."""
    active = MessageTemplate.objects.filter(is_active=True).first()
    initial = {"template_text": DEFAULT_TEMPLATE_TEXT, "name": "Default"}
    form = MessageTemplateForm(instance=active, initial=None if active else initial)
    return render(
        request,
        "dashboard/pages/message_templates.html",
        {"form": form, "active_template": active},
    )


@require_POST
def save_message_template(request: HttpRequest) -> HttpResponse:
    """Save (create or update) the active message template."""
    active = MessageTemplate.objects.filter(is_active=True).first()
    form = MessageTemplateForm(request.POST, instance=active)
    if form.is_valid():
        obj = form.save(commit=False)
        obj.save()
        activate_template(obj)
        return render(
            request,
            "dashboard/partials/message_template_form.html",
            {"form": MessageTemplateForm(instance=obj), "active_template": obj, "saved": True},
        )
    return render(
        request,
        "dashboard/partials/message_template_form.html",
        {"form": form, "active_template": active},
    )


@require_POST
def preview_message_template(request: HttpRequest) -> HttpResponse:
    """Render a live preview of the template text using the latest article."""
    from apps.scraper.models import ScrapedArticle

    template_text = request.POST.get("template_text", "")
    article = (
        ScrapedArticle.objects.filter(published_at__isnull=False).order_by("-published_at").first()
        or ScrapedArticle.objects.order_by("-created_at").first()
    )

    preview = ""
    if article and template_text:
        tmp = MessageTemplate(template_text=template_text, name="preview")
        preview = render_message(article, tmp)

    return render(
        request,
        "dashboard/partials/template_preview.html",
        {"preview": preview, "has_article": article is not None},
    )
