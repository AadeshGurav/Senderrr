"""Scraper Celery tasks — periodic content monitoring."""

from __future__ import annotations

import logging

from celery import shared_task

from apps.scraper.parsers import get_parser_for_url
from apps.scraper.services import detect_and_store_change, detect_new_articles
from utils.config import get_config

logger = logging.getLogger(__name__)


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
    urls = _get_target_urls()
    if not urls:
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
