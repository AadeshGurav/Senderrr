"""Scraper services — fetch, hash, and detect content changes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import requests
from bs4 import BeautifulSoup

from apps.scraper.models import ArticleHash, ScrapedArticle
from utils.config import get_config
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
    return _extract_visible_text(_fetch_raw_html(url))


def _fetch_raw_html(url: str) -> str:
    """Fetch a URL and return the raw HTML response body.

    Retries up to ``SCRAPER_MAX_RETRIES`` on transient failures.
    """
    last_exception: Exception | None = None

    max_retries = get_config("SCRAPER_MAX_RETRIES", int)
    timeout = get_config("SCRAPER_REQUEST_TIMEOUT", int)

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(
                url,
                timeout=timeout,
                headers={"User-Agent": "WhatsAppAutomation/1.0"},
            )
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            last_exception = exc
            logger.warning(
                "Fetch attempt %d/%d failed for %s: %s",
                attempt,
                max_retries,
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
    raw_html = _fetch_raw_html(url)
    content = _extract_visible_text(raw_html)
    new_hash = compute_content_hash(content)

    stored, _created = ArticleHash.objects.get_or_create(
        url=url,
        defaults={"content_hash": new_hash},
    )

    if stored.content_hash == new_hash and not _created:
        logger.info("No change detected for %s", url)
        return None

    logger.info("Change detected for %s — storing new article.", url)

    title, article_url, body = _extract_structured_data(url, raw_html, content)

    article = ScrapedArticle.objects.create(
        url=article_url,
        title=title,
        body=body,
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


def _extract_structured_data(
    url: str, raw_html: str, text_content: str
) -> tuple[str, str, str]:
    """Extract structured data if a site-specific parser exists.

    Returns:
        (title, article_url, body) — falls back to generic extraction
        if no parser matches or parsing fails.
    """
    # DEMO: Hacker News parser — delete this block to remove HN support
    if "news.ycombinator.com" in url:
        try:
            from apps.scraper.parsers import format_hn_message, parse_top_story

            story = parse_top_story(raw_html)
            if story:
                return story.title, story.url, format_hn_message(story)
        except ImportError:
            logger.debug("HN parser not installed — using generic extraction.")
        except Exception as exc:
            logger.warning("HN parser failed, falling back: %s", exc)

    # Generic fallback
    title = _extract_title(text_content)
    return title, url, text_content
