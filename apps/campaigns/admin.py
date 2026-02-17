"""Campaigns admin — register models for Django Admin."""

from django.contrib import admin

from apps.campaigns.models import (
    BroadcastEvent,
    MessageAttempt,
    MessageTask,
    WhatsAppGroup,
)


@admin.register(WhatsAppGroup)
class WhatsAppGroupAdmin(admin.ModelAdmin):
    """Admin view for WhatsApp groups."""

    list_display = (
        "name",
        "group_jid",
        "is_active",
        "is_healthy",
        "total_sent",
        "total_failed",
        "consecutive_failures",
        "created_at",
    )
    list_filter = ("is_active", "is_healthy")
    search_fields = ("name", "group_jid")
    list_editable = ("is_active",)


class MessageAttemptInline(admin.TabularInline):
    """Inline view of attempts within a message task."""

    model = MessageAttempt
    extra = 0
    readonly_fields = (
        "attempt_number",
        "status",
        "error_category",
        "error_message",
        "screenshot_path",
        "started_at",
        "completed_at",
    )
    can_delete = False


class MessageTaskInline(admin.TabularInline):
    """Inline view of message tasks within a broadcast."""

    model = MessageTask
    extra = 0
    readonly_fields = (
        "group",
        "status",
        "error_message",
        "error_category",
        "attempt_count",
        "queued_at",
        "sent_at",
    )
    can_delete = False


@admin.register(BroadcastEvent)
class BroadcastEventAdmin(admin.ModelAdmin):
    """Admin view for broadcast events with inline message tasks."""

    list_display = (
        "pk",
        "article",
        "status",
        "total_groups",
        "sent_count",
        "failed_count",
        "created_at",
    )
    list_filter = ("status", "created_at")
    readonly_fields = ("created_at", "completed_at")
    inlines = [MessageTaskInline]


@admin.register(MessageTask)
class MessageTaskAdmin(admin.ModelAdmin):
    """Admin view for individual message tasks."""

    list_display = (
        "pk",
        "broadcast",
        "group",
        "status",
        "error_category",
        "attempt_count",
        "queued_at",
        "sent_at",
    )
    list_filter = ("status", "error_category")
    search_fields = ("group__name",)
    readonly_fields = ("queued_at", "sent_at")
    inlines = [MessageAttemptInline]
