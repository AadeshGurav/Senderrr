"""Hacker News parser — structured extraction of the #1 story.

DEMO MODULE — can be deleted without affecting the rest of the codebase.
When deleted, the system falls back to the generic scraper behaviour
(plain text hashing with no structured extraction).

Usage:
    from apps.scraper.parsers.hackernews import parse_top_story

    story = parse_top_story(html_string)
    message = format_hn_message(story)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class HNStory:
    """Structured data for a single Hacker News story."""

    title: str
    url: str
    author: str
    points: int
    comment_count: int
    time_ago: str
    hn_link: str  # Discussion link on HN itself


HN_BASE = "https://news.ycombinator.com"


def parse_top_story(html: str) -> HNStory | None:
    """Extract the #1 story from a Hacker News HTML page.

    Returns ``None`` if parsing fails (DOM changed, empty page, etc.).
    """
    soup = BeautifulSoup(html, "lxml")
    rows = soup.select("tr.athing")

    if not rows:
        logger.warning("No story rows found — HN DOM may have changed.")
        return None

    first_row = rows[0]
    return _parse_story_row(first_row)


def parse_all_stories(html: str) -> list[HNStory]:
    """Extract all stories from a Hacker News HTML page."""
    soup = BeautifulSoup(html, "lxml")
    rows = soup.select("tr.athing")
    stories = []
    for row in rows:
        story = _parse_story_row(row)
        if story:
            stories.append(story)
    return stories


def _parse_story_row(row: Tag) -> HNStory | None:
    """Parse a single story from its <tr> row and sibling subtext row."""
    try:
        story_id = row.get("id", "")

        # Title and link from the titleline
        title_anchor = row.select_one(".titleline > a")
        if not title_anchor:
            return None

        title = title_anchor.get_text(strip=True)
        url = title_anchor.get("href", "")

        # HN internal links (e.g. "item?id=123") need the base URL
        if url.startswith("item?"):
            url = f"{HN_BASE}/{url}"

        hn_link = f"{HN_BASE}/item?id={story_id}"

        # Metadata lives in the next sibling <tr>'s .subtext
        subtext = row.find_next_sibling("tr")
        if not subtext:
            return HNStory(
                title=title, url=url, author="", points=0,
                comment_count=0, time_ago="", hn_link=hn_link,
            )

        author = _extract_author(subtext)
        points = _extract_points(subtext)
        comment_count = _extract_comments(subtext)
        time_ago = _extract_time(subtext)

        return HNStory(
            title=title,
            url=url,
            author=author,
            points=points,
            comment_count=comment_count,
            time_ago=time_ago,
            hn_link=hn_link,
        )
    except Exception as exc:
        logger.warning("Failed to parse story row: %s", exc)
        return None


def _extract_author(subtext: Tag) -> str:
    user_link = subtext.select_one("a.hnuser")
    return user_link.get_text(strip=True) if user_link else ""


def _extract_points(subtext: Tag) -> int:
    score_span = subtext.select_one(".score")
    if not score_span:
        return 0
    text = score_span.get_text(strip=True)
    return int("".join(c for c in text if c.isdigit()) or "0")


def _extract_comments(subtext: Tag) -> int:
    links = subtext.select("a")
    for link in reversed(links):
        text = link.get_text(strip=True).lower()
        if "comment" in text:
            return int("".join(c for c in text if c.isdigit()) or "0")
        if text == "discuss":
            return 0
    return 0


def _extract_time(subtext: Tag) -> str:
    age_span = subtext.select_one(".age")
    return age_span.get_text(strip=True) if age_span else ""


def format_hn_message(story: HNStory) -> str:
    """Format a rich WhatsApp message from an HN story.

    Uses WhatsApp formatting:
        *bold*  _italic_  ~strikethrough~  ```monospace```
    """
    parts = [
        f"🔶 *{story.title}*",
        "",
    ]

    meta_parts = []
    if story.author:
        meta_parts.append(f"👤 {story.author}")
    if story.points:
        meta_parts.append(f"⬆️ {story.points} points")
    if story.comment_count:
        meta_parts.append(f"💬 {story.comment_count} comments")
    if story.time_ago:
        meta_parts.append(f"🕐 {story.time_ago}")

    if meta_parts:
        parts.append("  •  ".join(meta_parts))
        parts.append("")

    parts.append(f"📎 {story.url}")

    if story.hn_link != story.url:
        parts.append(f"💬 {story.hn_link}")

    parts.extend(["", "— _via Hacker News_"])

    return "\n".join(parts)
