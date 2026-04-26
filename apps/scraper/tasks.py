"""Scraper Celery tasks — periodic content monitoring."""

from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

from apps.scraper.parsers import get_parser_for_url
from apps.scraper.services import detect_and_store_change, detect_new_articles
from utils.config import get_config

logger = logging.getLogger(__name__)


def _is_scraper_active() -> bool:
    """Return True if the current local time falls inside the configured live-hours window.

    Checks both the day-of-week and the hour range.  If the owner has set
    office hours (e.g. Mon–Fri 09:00–18:00), the scraper skips outside that
    window so manual weekend/holiday posts aren't duplicated by the system.
    """
    now = timezone.localtime()
    current_hour = now.hour
    current_weekday = now.weekday()  # 0 = Monday … 6 = Sunday

    active_start = int(get_config("SCRAPER_ACTIVE_HOUR_START", int))
    active_end = int(get_config("SCRAPER_ACTIVE_HOUR_END", int))
    active_days_raw = str(get_config("SCRAPER_ACTIVE_WEEKDAYS", str))
    active_days = {int(d.strip()) for d in active_days_raw.split(",") if d.strip().isdigit()}

    if current_weekday not in active_days:
        logger.info(
            "Scraper skipped — day %d (%s) not in active weekdays %s.",
            current_weekday,
            now.strftime("%A"),
            sorted(active_days),
        )
        return False

    if not (active_start <= current_hour <= active_end):
        logger.info(
            "Scraper skipped — current hour %02d:xx is outside active window %02d:00–%02d:59.",
            current_hour,
            active_start,
            active_end,
        )
        return False

    return True


def _get_target_urls() -> list[str]:
    """Read target URLs from config, supporting comma-separated values."""
    raw = str(get_config("SCRAPER_TARGET_URLS", str))
    urls = [u.strip() for u in raw.split(",") if u.strip()]

    if not urls:
        single = str(get_config("SCRAPER_TARGET_URL"))
        if single and single != "https://example.com/articles":
            urls = [single]

    return urls


@shared_task(
    bind=True,
    name="apps.scraper.tasks.check_for_new_articles",
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def check_for_new_articles(self) -> str:  # noqa: ANN001
    """Periodic task: check all target URLs for new content.

    Uses listing-based detection for sites with a registered parser,
    hash-based detection for everything else.
    """
    if not _is_scraper_active():
        return "Scraper outside live-hours window — skipped."

    urls = _get_target_urls()
    if not urls:
        logger.warning(
            "No target URLs configured — set SCRAPER_TARGET_URLS in .env "
            "or via the dashboard Settings page."
        )
        return "No target URLs configured."

    results = []
    fatal_exc: Exception | None = None

    for url in urls:
        try:
            result = _check_single_url(url)
            results.append(result)
        except Exception as exc:
            logger.error("Scraper failed for %s: %s", url, exc, exc_info=True)
            results.append(f"ERROR: {url} — {exc}")
            # Preserve the first fatal exception so we can retry the whole task
            # if infrastructure-level failures (DB, Redis) occur.
            if fatal_exc is None:
                fatal_exc = exc

    all_failed = fatal_exc is not None and all(
        r.startswith("ERROR:") for r in results
    )
    if all_failed:
        # Every URL failed — likely an infrastructure outage; retry the task.
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=fatal_exc, countdown=backoff)

    return " | ".join(results)


def _check_single_url(url: str) -> str:
    """Run the appropriate detection strategy for a single URL."""
    parser = get_parser_for_url(url)

    if parser:
        articles = detect_new_articles(url)
        if not articles:
            return f"No new articles at {url}"
        for article in articles:
            _trigger_broadcast(article.pk)
        titles = ", ".join(a.title[:40] for a in articles)
        return f"{len(articles)} new from {parser.name}: {titles}"

    article = detect_and_store_change(url)
    if article is None:
        return f"No change at {url}"
    _trigger_broadcast(article.pk)
    return f"Change detected at {url}: {article.title!r}"


def _trigger_broadcast(article_pk: int) -> None:
    """Hand off to the campaigns module to fan out messages."""
    from apps.campaigns.tasks import fan_out_broadcast

    fan_out_broadcast.delay(article_pk)
    logger.info("Broadcast fan-out triggered for article pk=%d", article_pk)
