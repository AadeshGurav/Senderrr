"""Dashboard admin — RuntimeSetting registration."""

from django.contrib import admin

from apps.dashboard.models import RuntimeSetting


@admin.register(RuntimeSetting)
class RuntimeSettingAdmin(admin.ModelAdmin):
    """Admin view for RuntimeSetting."""

    list_display = ("key", "value", "updated_at")
    search_fields = ("key",)
