"""Scraper app — models for content change detection."""

from django.db import models


class ArticleHash(models.Model):
    """Stores the latest content hash for a monitored URL.

    Used for fast change-detection: if the new hash differs from the
    stored one, a new article has been published.
    """

    url = models.URLField(unique=True, db_index=True)
    content_hash = models.CharField(max_length=64)
    checked_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Article Hash"
        verbose_name_plural = "Article Hashes"

    def __str__(self) -> str:
        return f"{self.url} — {self.content_hash[:12]}…"


class ScrapedArticle(models.Model):
    """A captured snapshot of new content detected by the observer."""

    url = models.URLField(db_index=True)
    title = models.CharField(max_length=500, blank=True, default="")
    body = models.TextField(help_text="Raw extracted text content.")
    content_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Scraped Article"
        verbose_name_plural = "Scraped Articles"

    def __str__(self) -> str:
        label = self.title or self.url
        return f"{label} ({self.created_at:%Y-%m-%d %H:%M})"
