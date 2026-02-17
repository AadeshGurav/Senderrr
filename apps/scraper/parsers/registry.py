"""Parser registry — maps domains to parser instances."""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from apps.scraper.parsers.base import BaseSiteParser

logger = logging.getLogger(__name__)

_registry: dict[str, BaseSiteParser] = {}


def register(parser_class: type[BaseSiteParser]) -> type[BaseSiteParser]:
    """Class decorator that registers a parser for its declared domains.

    Usage::

        @register
        class MyParser(BaseSiteParser):
            name = "My Site"
            domains = ["mysite.com"]
            ...
    """
    instance = parser_class()
    for domain in instance.domains:
        normalized = domain.lower().strip()
        if normalized in _registry:
            logger.warning(
                "Domain %r already registered by %s — overwriting with %s.",
                normalized,
                _registry[normalized].name,
                instance.name,
            )
        _registry[normalized] = instance
        logger.debug("Registered parser %r for domain %r.", instance.name, normalized)
    return parser_class


def get_parser_for_url(url: str) -> BaseSiteParser | None:
    """Return the registered parser whose domain matches the URL."""
    hostname = urlparse(url).hostname or ""
    hostname = hostname.lower()

    # Try exact match first, then strip leading 'www.'
    if hostname in _registry:
        return _registry[hostname]

    bare = hostname.removeprefix("www.")
    return _registry.get(bare)


def list_registered_parsers() -> dict[str, BaseSiteParser]:
    """Return a copy of the domain → parser mapping."""
    return dict(_registry)
