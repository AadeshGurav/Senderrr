"""Hacker News parser — extracts stories from news.ycombinator.com.

DEMO MODULE — can be deleted without affecting the rest of the codebase.
"""

from __future__ import annotations

import logging

from bs4 import BeautifulSoup, Tag

from apps.scraper.parsers.base import (
    ArticlePreview,
    BaseSiteParser,
    ParsedArticle,
)
from apps.scraper.parsers.registry import register

logger = logging.getLogger(__name__)

HN_BASE = "https://news.ycombinator.com"


@register
class HackerNewsParser(BaseSiteParser):
    """Structured extraction for Hacker News."""

    name = "Hacker News"
    domains = ["news.ycombinator.com"]

    def parse_listing(self, html: str) -> list[ArticlePreview]:
        soup = BeautifulSoup(html, "lxml")
        previews = []
        for row in soup.select("tr.athing"):
            anchor = row.select_one(".titleline > a")
            if not anchor:
                continue
            title = anchor.get_text(strip=True)
            url = anchor.get("href", "")
            if url.startswith("item?"):
                url = f"{HN_BASE}/{url}"
            previews.append(ArticlePreview(title=title, url=url))
        return previews

    def parse_article(self, html: str, url: str) -> ParsedArticle | None:
        soup = BeautifulSoup(html, "lxml")
        row = soup.select_one("tr.athing")
        if not row:
            return None

        anchor = row.select_one(".titleline > a")
        if not anchor:
            return None

        title = anchor.get_text(strip=True)
        story_url = anchor.get("href", "")
        if story_url.startswith("item?"):
            story_url = f"{HN_BASE}/{story_url}"

        story_id = row.get("id", "")
        hn_link = f"{HN_BASE}/item?id={story_id}"

        subtext = row.find_next_sibling("tr")
        meta = _extract_metadata(subtext) if subtext else {}

        body = self.format_message(
            ParsedArticle(
                title=title,
                url=story_url,
                body="",
                author=meta.get("author", ""),
            )
        )

        return ParsedArticle(
            title=title,
            url=story_url,
            body=body,
            author=meta.get("author", ""),
            tags=[hn_link],
        )

    def format_message(self, article: ParsedArticle) -> str:
        parts = [f"🔶 *{article.title}*", ""]

        meta = []
        if article.author:
            meta.append(f"👤 {article.author}")
        if meta:
            parts.append("  •  ".join(meta))
            parts.append("")

        parts.append(f"📎 {article.url}")

        if article.tags:
            hn_link = article.tags[0]
            if hn_link != article.url:
                parts.append(f"💬 {hn_link}")

        parts.extend(["", "— _via Hacker News_"])
        return "\n".join(parts)


def _extract_metadata(subtext: Tag) -> dict[str, str | int]:
    """Pull author, points, comments, and age from the subtext row."""
    result: dict[str, str | int] = {}

    user_link = subtext.select_one("a.hnuser")
    if user_link:
        result["author"] = user_link.get_text(strip=True)

    score_span = subtext.select_one(".score")
    if score_span:
        digits = "".join(c for c in score_span.get_text() if c.isdigit())
        result["points"] = int(digits or "0")

    for link in reversed(subtext.select("a")):
        text = link.get_text(strip=True).lower()
        if "comment" in text:
            digits = "".join(c for c in text if c.isdigit())
            result["comments"] = int(digits or "0")
            break
        if text == "discuss":
            result["comments"] = 0
            break

    age_span = subtext.select_one(".age")
    if age_span:
        result["time_ago"] = age_span.get_text(strip=True)

    return result
