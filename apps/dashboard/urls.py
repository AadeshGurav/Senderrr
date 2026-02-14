"""Dashboard URL configuration."""

from django.urls import path

from apps.dashboard.views import broadcasts, dashboard, groups, settings, status

app_name = "dashboard"

urlpatterns = [
    path("", dashboard.index, name="index"),
    # Groups
    path("groups/add/", groups.add_group, name="add_group"),
    path("groups/<int:pk>/toggle/", groups.toggle_group, name="toggle_group"),
    path("groups/<int:pk>/delete/", groups.delete_group, name="delete_group"),
    # Broadcasts
    path("broadcasts/", broadcasts.broadcast_list, name="broadcasts"),
    # Settings
    path("settings/", settings.settings_view, name="settings"),
    # Status
    path("status/whatsapp/", status.whatsapp_status, name="whatsapp_status"),
]
