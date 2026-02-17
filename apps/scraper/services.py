"""Scraper services — fetch, hash, and detect content changes."""

from __future__ import annotations

import logging

import requests
from bs4 import BeautifulSoup

from apps.scraper.models import ArticleHash, ScrapedArticle
from apps.scraper.parsers import get_parser_for_url
from utils.config import get_config
from utils.hashing import sha256_digest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP fetching
# ---------------------------------------------------------------------------


def fetch_page_content(url: str) -> str:
    """Fetch a URL and return its visible text content."""
    return _extract_visible_text(_fetch_raw_html(url))


def _fetch_raw_html(url: str) -> str:
    """Fetch a URL with retries and return raw HTML."""
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


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def compute_content_hash(content: str) -> str:
    """Return a SHA-256 hex digest of the content string."""
    return sha256_digest(content)


# ---------------------------------------------------------------------------
# Change detection — listing-based (for sites with a registered parser)
# ---------------------------------------------------------------------------


def detect_new_articles(url: str) -> list[ScrapedArticle]:
    """Fetch a listing page, find new article URLs, parse and store each.

    On first run (no known URLs for the site), seeds all current URLs
    into ArticleHash without broadcasting — only genuinely new articles
    appearing after the seed will trigger broadcasts.

    Returns a list of newly created ScrapedArticle instances.
    """
    parser = get_parser_for_url(url)
    if parser is None:
        logger.warning("No parser registered for %s — skipping listing detection.", url)
        return []

    listing_html = _fetch_raw_html(url)
    previews = parser.parse_listing(listing_html)
    if not previews:
        logger.info("No articles found on listing page %s", url)
        return []

    preview_urls = [p.url for p in previews]
    known_urls = set(
        ArticleHash.objects.filter(url__in=preview_urls).values_list("url", flat=True)
    )

    # First run: seed all current URLs so future runs detect only new ones
    if not known_urls:
        _seed_known_urls(preview_urls)
        logger.info(
            "First run for %s — seeded %d URLs. No broadcasts triggered.",
            url,
            len(preview_urls),
        )
        return []

    new_previews = [p for p in previews if p.url not in known_urls]
    if not new_previews:
        logger.info("No new articles at %s (%d already known).", url, len(previews))
        return []

    logger.info("Found %d new article(s) at %s.", len(new_previews), url)
    articles = []
    for preview in new_previews:
        article = _fetch_parse_and_store(preview.url, parser)
        if article:
            articles.append(article)

    return articles


def _seed_known_urls(urls: list[str]) -> None:
    """Bulk-create ArticleHash entries to mark URLs as known."""
    ArticleHash.objects.bulk_create(
        [ArticleHash(url=url, content_hash="seeded") for url in urls],
        ignore_conflicts=True,
    )


def _fetch_parse_and_store(article_url, parser):
    """Fetch a single article, parse it, and persist."""
    try:
        raw_html = _fetch_raw_html(article_url)
    except Exception as exc:
        logger.error("Failed to fetch article %s: %s", article_url, exc)
        return None

    parsed = parser.parse_article(raw_html, article_url)
    if not parsed:
        logger.warning("Parser returned None for %s", article_url)
        return None

    content_hash = compute_content_hash(parsed.body)
    body = parser.format_message(parsed)

    article = ScrapedArticle.objects.create(
        url=parsed.url,
        title=parsed.title,
        body=body,
        image_url=parsed.image_url,
        content_hash=content_hash,
    )

    ArticleHash.objects.update_or_create(
        url=parsed.url,
        defaults={"content_hash": content_hash},
    )

    logger.info("Stored article: %s", parsed.title[:80])
    return article


# ---------------------------------------------------------------------------
# Change detection — hash-based (generic fallback)
# ---------------------------------------------------------------------------


def detect_and_store_change(url: str) -> ScrapedArticle | None:
    """Hash-based detection for sites without a registered parser.

    1. Fetch the page content.
    2. Compute its SHA-256 hash.
    3. Compare against the last stored hash.
    4. If changed — persist the new article and update the hash.
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
    """Extract via registered parser, or fall back to generic."""
    parser = get_parser_for_url(url)
    if parser:
        try:
            parsed = parser.parse_article(raw_html, url)
            if parsed:
                return parsed.title, parsed.url, parser.format_message(parsed)
        except Exception as exc:
            logger.warning("Parser failed for %s, falling back: %s", url, exc)

    title = _extract_title(text_content)
    return title, url, text_content
