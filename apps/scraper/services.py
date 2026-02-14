"""Scraper services — fetch, hash, and detect content changes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import requests
from bs4 import BeautifulSoup
from django.conf import settings

from apps.scraper.models import ArticleHash, ScrapedArticle
from utils.hashing import sha256_digest

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def fetch_page_content(url: str) -> str:
    """Fetch a URL and return its visible text content.

    Retries up to ``SCRAPER_MAX_RETRIES`` on transient failures.

    Raises:
        requests.RequestException: After all retries are exhausted.
    """
    last_exception: Exception | None = None

    for attempt in range(1, settings.SCRAPER_MAX_RETRIES + 1):
        try:
            response = requests.get(
                url,
                timeout=settings.SCRAPER_REQUEST_TIMEOUT,
                headers={"User-Agent": "WhatsAppAutomation/1.0"},
            )
            response.raise_for_status()
            return _extract_visible_text(response.text)
        except requests.RequestException as exc:
            last_exception = exc
            logger.warning(
                "Fetch attempt %d/%d failed for %s: %s",
                attempt,
                settings.SCRAPER_MAX_RETRIES,
                url,
                exc,
            )

    raise last_exception  # type: ignore[misc]


def _extract_visible_text(html: str) -> str:
    """Strip HTML and return only visible text from the page body."""
    soup = BeautifulSoup(html, "lxml")

    for invisible in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        invisible.decompose()

    return soup.get_text(separator="\n", strip=True)


def compute_content_hash(content: str) -> str:
    """Return a SHA-256 hex digest of the content string."""
    return sha256_digest(content)


def detect_and_store_change(url: str) -> ScrapedArticle | None:
    """Orchestrate the full change-detection pipeline.

    1. Fetch the page content.
    2. Compute its SHA-256 hash.
    3. Compare against the last stored hash.
    4. If changed — persist the new article and update the hash.

    Returns:
        The newly created ``ScrapedArticle`` if content changed,
        or ``None`` if there is no change.
    """
    content = fetch_page_content(url)
    new_hash = compute_content_hash(content)

    stored, _created = ArticleHash.objects.get_or_create(
        url=url,
        defaults={"content_hash": new_hash},
    )

    if stored.content_hash == new_hash and not _created:
        logger.info("No change detected for %s", url)
        return None

    logger.info("Change detected for %s — storing new article.", url)

    title = _extract_title(content)
    article = ScrapedArticle.objects.create(
        url=url,
        title=title,
        body=content,
        content_hash=new_hash,
    )

    stored.content_hash = new_hash
    stored.save(update_fields=["content_hash", "checked_at"])

    return article


def _extract_title(text: str) -> str:
    """Best-effort title extraction: first non-empty line of text."""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped[:500]
    return ""
