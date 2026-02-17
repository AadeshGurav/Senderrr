"""Base parser contract — every site-specific parser implements this."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ArticlePreview:
    """Lightweight reference to an article found on a listing page."""

    title: str
    url: str


@dataclass(frozen=True)
class ParsedArticle:
    """Fully extracted article content from a detail page."""

    title: str
    url: str
    body: str
    author: str = ""
    category: str = ""
    image_url: str = ""
    published_at: str = ""
    tags: list[str] = field(default_factory=list)


class BaseSiteParser(ABC):
    """Contract that all site-specific parsers must satisfy.

    Subclasses declare which domains they handle, then implement
    three methods: listing extraction, article parsing, and
    WhatsApp message formatting.
    """

    name: str
    domains: list[str]

    @abstractmethod
    def parse_listing(self, html: str) -> list[ArticlePreview]:
        """Extract article previews from a listing/homepage."""

    @abstractmethod
    def parse_article(self, html: str, url: str) -> ParsedArticle | None:
        """Extract structured content from a single article page."""

    @abstractmethod
    def format_message(self, article: ParsedArticle) -> str:
        """Format the article as a WhatsApp-ready message string."""
