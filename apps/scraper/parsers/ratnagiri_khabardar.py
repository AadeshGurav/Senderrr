"""Ratnagiri Khabardar parser — Marathi regional news site.

Extracts articles from ratnagirikhabardar.com (WordPress/TagDiv theme).
Homepage lists articles at /news/{id}/ URLs.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from django.utils import timezone

from apps.scraper.parsers.base import (
    ArticlePreview,
    BaseSiteParser,
    ParsedArticle,
)
from apps.scraper.parsers.registry import register

logger = logging.getLogger(__name__)

ARTICLE_URL_PATTERN = re.compile(r"/news/\d+/?$")


@register
class RatnagiriKhabardarParser(BaseSiteParser):
    """Structured extraction for ratnagirikhabardar.com."""

    name = "Ratnagiri Khabardar"
    domains = ["ratnagirikhabardar.com"]

    def parse_listing(self, html: str) -> list[ArticlePreview]:
        soup = BeautifulSoup(html, "lxml")
        seen_urls: set[str] = set()
        previews: list[ArticlePreview] = []

        base_url = f"https://{self.domains[0]}"
        for anchor in soup.select("a[href]"):
            href = anchor.get("href", "").strip()
            if not ARTICLE_URL_PATTERN.search(href):
                continue

            absolute_url = urljoin(base_url, href)
            if absolute_url in seen_urls:
                continue

            title = anchor.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            seen_urls.add(absolute_url)
            previews.append(ArticlePreview(title=title, url=absolute_url))

        return previews

    def parse_article(self, html: str, url: str) -> ParsedArticle | None:
        soup = BeautifulSoup(html, "lxml")

        title = _extract_title(soup)
        if not title:
            logger.warning("No title found for %s", url)
            return None

        summary = _extract_summary(soup)
        author = _extract_author(soup)
        category = _extract_category(soup)
        image_url = _extract_featured_image(soup)
        published_at = _parse_published_datetime(soup)

        return ParsedArticle(
            title=title,
            url=url,
            body=summary,
            author=author,
            category=category,
            image_url=image_url,
            published_at=published_at,
        )

    def format_message(self, article: ParsedArticle) -> str:
        from django.utils import timezone

        now = timezone.localtime(timezone.now())
        timestamp = now.strftime("%H:%M %d-%m-%Y")

        return "\n".join(
            [
                f"🔴 *{article.title}*",
                "",
                "*दैनिक रत्नागिरी खबरदार*",
                "*ISO 9001:2015 CERTIFIED*",
                "*(RNI NO. MAHMAR/2013/57411)*",
                "*शासनमान्य रजिस्टर न्यूजपेपर*",
                timestamp,
                "",
                "📰➖♾️➖♾️➖♾️➖📰",
                "",
                "*संपूर्ण बातमी वाचण्यासाठी खालील लिंक क्लिक करा*",
                "",
                article.url,
                "",
                "📢▪️ *रत्नागिरी खबरदारच्या माध्यमातून जाहिरात करण्यासाठी आजच संपर्क साधा 9421187576 या क्रमांकावर*",
                "",
                "👉 *रत्नागिरी खबरदार न्यूज़ : अँड्रॉइड अँप*",
                "https://play.google.com/store/apps/details?id=com.appdroid.ratnagirikhabardar",
                "",
                "📰 *रत्नागिरी जिल्ह्यातील सर्व लेटेस्ट बातम्या आणि अपडेट्स एका क्लिक वर..*",
            ]
        )


def _extract_title(soup: BeautifulSoup) -> str:
    h1 = soup.select_one("h1.entry-title") or soup.select_one("h1")
    return h1.get_text(strip=True) if h1 else ""


def _extract_summary(soup: BeautifulSoup) -> str:
    """Use OG description for a clean, noise-free summary."""
    og_desc = soup.select_one("meta[property='og:description']")
    if og_desc and og_desc.get("content", "").strip():
        return og_desc["content"].strip()

    meta_desc = soup.select_one("meta[name='description']")
    if meta_desc and meta_desc.get("content", "").strip():
        return meta_desc["content"].strip()

    # Fallback: first paragraph from article body
    content = soup.select_one(".td-post-content") or soup.select_one(".entry-content")
    if content:
        first_p = content.select_one("p")
        if first_p:
            return _truncate(first_p.get_text(strip=True), max_chars=300)

    return ""


def _extract_author(soup: BeautifulSoup) -> str:
    author_el = soup.select_one(".td-post-author-name a") or soup.select_one(
        "a[href*='/author/']"
    )
    return author_el.get_text(strip=True) if author_el else ""


def _extract_category(soup: BeautifulSoup) -> str:
    cat_link = (
        soup.select_one(".td-post-category")
        or soup.select_one("a[rel='category tag']")
        or soup.select_one(".post-categories a")
    )
    return cat_link.get_text(strip=True) if cat_link else ""


def _extract_featured_image(soup: BeautifulSoup) -> str:
    og_image = soup.select_one("meta[property='og:image']")
    if og_image and og_image.get("content", "").strip():
        return og_image["content"].strip()

    td_img = soup.select_one(".td-post-featured-image img")
    if td_img:
        return td_img.get("src", "")

    return ""


def _parse_published_datetime(soup: BeautifulSoup) -> datetime | None:
    """Extract and parse the article's publish datetime.

    Prefers the machine-readable ISO meta tag over the human-readable
    visible element so timezone information is preserved.
    """
    meta_date = soup.select_one("meta[property='article:published_time']")
    if meta_date and meta_date.get("content", ""):
        try:
            dt = datetime.fromisoformat(meta_date["content"])
            # Ensure timezone-aware for consistent comparison
            if dt.tzinfo is None:
                dt = timezone.make_aware(dt)
            return dt
        except (ValueError, TypeError):
            pass

    time_el = soup.select_one("time.entry-date[datetime]")
    if time_el and time_el.get("datetime", ""):
        try:
            dt = datetime.fromisoformat(time_el["datetime"])
            if dt.tzinfo is None:
                dt = timezone.make_aware(dt)
            return dt
        except (ValueError, TypeError):
            pass

    return None


def _truncate(text: str, max_chars: int = 300) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "…"
