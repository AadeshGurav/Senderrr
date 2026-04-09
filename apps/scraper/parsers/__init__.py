"""Scraper parsers — plugin registry for site-specific extraction.

Import this module to trigger auto-registration of all parsers.
"""

from apps.scraper.parsers.base import (  # noqa: F401
    ArticlePreview,
    BaseSiteParser,
    ParsedArticle,
)
from apps.scraper.parsers.registry import (  # noqa: F401
    get_parser_for_url,
    list_registered_parsers,
)

# Import parser modules to trigger @register decorators
import apps.scraper.parsers.ratnagiri_khabardar  # noqa: F401
