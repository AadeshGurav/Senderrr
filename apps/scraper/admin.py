"""Scraper admin — register models for Django Admin."""

from django.contrib import admin

from apps.scraper.models import ArticleHash, ScrapedArticle


@admin.register(ArticleHash)
class ArticleHashAdmin(admin.ModelAdmin):
    """Admin view for content-change hashes."""

    list_display = ("url", "content_hash", "checked_at")
    search_fields = ("url",)
    readonly_fields = ("checked_at",)


@admin.register(ScrapedArticle)
class ScrapedArticleAdmin(admin.ModelAdmin):
    """Admin view for scraped article snapshots."""

    list_display = ("title", "url", "content_hash", "created_at")
    list_filter = ("created_at",)
    search_fields = ("title", "url")
    readonly_fields = ("content_hash", "created_at")
