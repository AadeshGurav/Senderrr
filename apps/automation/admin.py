"""Automation admin — worker session monitoring."""

from django.contrib import admin

from apps.automation.models import WorkerSession, WorkerSessionLog


class WorkerSessionLogInline(admin.TabularInline):
    """Read-only inline of session event logs."""

    model = WorkerSessionLog
    extra = 0
    readonly_fields = ("event", "detail", "created_at")
    can_delete = False
    ordering = ("-created_at",)


@admin.register(WorkerSession)
class WorkerSessionAdmin(admin.ModelAdmin):
    """Admin view for worker sessions."""

    list_display = (
        "worker_id",
        "status",
        "browser_status",
        "last_heartbeat_at",
        "total_sent",
        "total_failed",
        "current_task_id",
        "updated_at",
    )
    list_filter = ("status", "browser_status")
    search_fields = ("worker_id",)
    readonly_fields = ("started_at", "updated_at")
    inlines = [WorkerSessionLogInline]
