"""Dashboard scraper views — manual scraper controls.

Exposes two HTMX endpoints:
  POST /scraper/run/     — trigger check_for_new_articles immediately.
  POST /scraper/unseed/  — delete seeded hashes so the next run broadcasts them.
"""

from __future__ import annotations

import logging

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from apps.scraper.models import ArticleHash

logger = logging.getLogger(__name__)


@login_required
def scraper_page(request: HttpRequest) -> HttpResponse:
    """Render the scraper control panel."""
    context = _build_context()
    return render(request, "dashboard/pages/scraper.html", context)


@login_required
@require_POST
def run_scraper_now(request: HttpRequest) -> HttpResponse:
    """Immediately enqueue the scraper task and return a status partial."""
    from apps.scraper.tasks import check_for_new_articles

    try:
        check_for_new_articles.delay()
        message = (
            "Scraper task queued — results will appear in Broadcasts within a minute."
        )
        level = "success"
    except Exception as exc:
        logger.error("Failed to queue scraper task: %s", exc)
        message = f"Failed to queue scraper: {exc}"
        level = "error"

    context = {**_build_context(), "action_message": message, "action_level": level}
    return render(request, "dashboard/partials/scraper_status.html", context)


@login_required
@require_POST
def unseed_and_run(request: HttpRequest) -> HttpResponse:
    """Delete seeded ArticleHash entries, then queue the scraper.

    After first-run seeding, all existing articles are marked as already-known.
    This endpoint removes those "seeded" sentinels so the next scraper run
    treats them as new and fires broadcasts.

    Keeps one sentinel entry to prevent the next run from re-triggering the
    first-run seed path.
    """
    from apps.scraper.tasks import check_for_new_articles

    seeded_qs = ArticleHash.objects.filter(content_hash="seeded").order_by("pk")
    total = seeded_qs.count()

    if total == 0:
        message = (
            "No seeded entries found. "
            "Queuing scraper anyway — any genuinely new articles will broadcast."
        )
        level = "info"
    else:
        # Keep one sentinel so the next run knows the site has been visited before.
        sentinel = seeded_qs.last()
        deleted, _ = seeded_qs.exclude(pk=sentinel.pk).delete()
        logger.info(
            "Unseeded %d / %d ArticleHash entries (sentinel pk=%d).",
            deleted,
            total,
            sentinel.pk,
        )
        message = (
            f"Unseeded {deleted} of {total} entries — scraper will now treat them as new. "
            "Queuing scraper now…"
        )
        level = "success"

    try:
        check_for_new_articles.delay()
    except Exception as exc:
        logger.error("Failed to queue scraper after unseed: %s", exc)
        message += f" (WARNING: failed to queue scraper task: {exc})"
        level = "error"

    context = {**_build_context(), "action_message": message, "action_level": level}
    return render(request, "dashboard/partials/scraper_status.html", context)


def _build_context() -> dict:
    """Compute scraper dashboard context."""
    from django.conf import settings

    total_hashes = ArticleHash.objects.count()
    seeded_count = ArticleHash.objects.filter(content_hash="seeded").count()
    real_count = total_hashes - seeded_count
    max_age_hours = getattr(settings, "SCRAPER_MAX_ARTICLE_AGE_HOURS", 12)

    return {
        "total_hashes": total_hashes,
        "seeded_count": seeded_count,
        "real_count": real_count,
        "max_age_hours": max_age_hours,
    }
