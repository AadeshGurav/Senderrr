"""Management command to flush all ArticleHash records and reset the scraper."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.scraper.models import ArticleHash


class Command(BaseCommand):
    """Delete all ArticleHash records so the scraper re-seeds on next run."""

    help = (
        "Delete all ArticleHash records. "
        "The next scraper run will re-seed from the current listing."
    )

    def handle(self, *args: object, **options: object) -> str:
        """Delete all hashes and report the count."""
        count, _ = ArticleHash.objects.all().delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {count} ArticleHash record(s). "
                "Next scraper run will re-seed all current URLs as known."
            )
        )
        return f"Deleted {count} records."
