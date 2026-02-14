"""Scraper Celery tasks — periodic content monitoring."""

from __future__ import annotations

import logging

from celery import shared_task

from apps.scraper.services import detect_and_store_change
from utils.config import get_config

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.scraper.tasks.check_for_new_articles",
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def check_for_new_articles(self) -> str:  # noqa: ANN001
    """Periodic task: check the target URL for new content.

    If a change is detected, triggers the campaign fan-out pipeline.
    """
    url = get_config("SCRAPER_TARGET_URL")
    logger.info("Checking for new articles at %s", url)

    try:
        article = detect_and_store_change(url)
    except Exception as exc:
        logger.error("Scraper failed for %s: %s", url, exc, exc_info=True)
        raise self.retry(exc=exc)

    if article is None:
        return f"No change detected for {url}"

    _trigger_broadcast(article.pk)
    return f"New article detected: {article.title!r} (pk={article.pk})"


def _trigger_broadcast(article_pk: int) -> None:
    """Hand off to the campaigns module to fan out messages."""
    from apps.campaigns.tasks import fan_out_broadcast

    fan_out_broadcast.delay(article_pk)
    logger.info("Broadcast fan-out triggered for article pk=%d", article_pk)
