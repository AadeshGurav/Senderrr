"""Management command to unseed silently-bootstrapped articles.

On the first scraper run against an empty DB, all current article URLs
are stored as ``content_hash="seeded"`` without triggering broadcasts.
This command removes those seeded entries (keeping one sentinel) so the
next scraper run treats them as new and sends broadcasts.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandParser

from apps.scraper.models import ArticleHash


class Command(BaseCommand):
    """Unseed silently-bootstrapped articles so the scraper re-broadcasts them."""

    help = (
        "Remove seeded ArticleHash entries so the next scraper run "
        "treats them as new articles and triggers broadcasts."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help=(
                "Unseed at most N entries (0 = all). "
                "Listing order is newest-first, so this targets the "
                "most recently published articles."
            ),
        )

    def handle(self, *args: object, **options: object) -> str:
        seeded = ArticleHash.objects.filter(content_hash="seeded").order_by("pk")
        total_seeded = seeded.count()

        if total_seeded == 0:
            self.stdout.write("No seeded entries found — nothing to do.")
            return "Nothing to do."

        # Always keep one entry as sentinel so the next run does not
        # re-trigger first-run seeding instead of detecting new articles.
        sentinel = seeded.last()  # keep the oldest (lowest pk)
        candidates = seeded.exclude(pk=sentinel.pk)

        limit = options["limit"]
        if limit > 0:
            # Newest-first: the highest PKs are the most recently seeded
            # (listing order preserved from parse_listing output).
            to_delete_pks = list(
                candidates.order_by("-pk").values_list("pk", flat=True)[:limit]
            )
            deleted_count, _ = ArticleHash.objects.filter(
                pk__in=to_delete_pks
            ).delete()
        else:
            deleted_count, _ = candidates.delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Unseeded {deleted_count} of {total_seeded} entries "
                f"(1 sentinel kept at pk={sentinel.pk})."
            )
        )
        self.stdout.write(
            "Trigger the scraper to broadcast them:\n"
            "  celery -A core call apps.scraper.tasks.check_for_new_articles"
        )
        return f"Unseeded {deleted_count} entries."
