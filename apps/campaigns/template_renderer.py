"""Template renderer — substitutes {news.*} placeholders with article data."""

from __future__ import annotations

import logging

from django.utils import timezone

from apps.campaigns.message_template_models import MessageTemplate
from apps.scraper.models import ScrapedArticle

logger = logging.getLogger(__name__)


def get_active_template() -> MessageTemplate | None:
    """Return the currently active MessageTemplate, or None."""
    return MessageTemplate.objects.filter(is_active=True).first()


def render_message(article: ScrapedArticle, template: MessageTemplate) -> str:
    """Render a message by substituting {news.*} placeholders.

    Args:
        article: The source article supplying field values.
        template: The active MessageTemplate containing the template_text.

    Returns:
        Fully rendered WhatsApp message string.
    """
    now = timezone.localtime(timezone.now())
    timestamp = now.strftime("%H:%M %d-%m-%Y")

    published_str = ""
    if article.published_at:
        local_pub = timezone.localtime(article.published_at)
        published_str = local_pub.strftime("%d %b %Y, %I:%M %p")

    substitutions = {
        "{news.title}": article.title or "",
        "{news.description}": article.description or "",
        "{news.url}": article.url or "",
        "{news.image_url}": article.image_url or "",
        "{news.source}": article.source_name or "",
        "{news.published_at}": published_str,
        "{news.time}": timestamp,
    }

    text = template.template_text
    for placeholder, value in substitutions.items():
        text = text.replace(placeholder, value)

    return text


def activate_template(template: MessageTemplate) -> None:
    """Set this template as active and deactivate all others."""
    MessageTemplate.objects.exclude(pk=template.pk).update(is_active=False)
    MessageTemplate.objects.filter(pk=template.pk).update(is_active=True)
    template.is_active = True
