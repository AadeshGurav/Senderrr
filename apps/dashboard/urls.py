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
    path("groups/<int:pk>/mark-healthy/", groups.mark_healthy, name="mark_healthy"),
    # Broadcasts
    path("broadcasts/", broadcasts.broadcast_list, name="broadcasts"),
    path(
        "broadcasts/<int:pk>/messages/",
        broadcasts.broadcast_messages,
        name="broadcast_messages",
    ),
    path(
        "broadcasts/<int:pk>/retry/",
        broadcasts.retry_broadcast,
        name="retry_broadcast",
    ),
    path(
        "broadcasts/<int:pk>/resend/",
        broadcasts.resend_broadcast,
        name="resend_broadcast",
    ),
    path("broadcasts/retry-all/", broadcasts.retry_all_failed, name="retry_all"),
    path("messages/<int:pk>/retry/", broadcasts.retry_message, name="retry_message"),
    # Settings
    path("settings/", settings.settings_view, name="settings"),
    # Status
    path("status/whatsapp/", status.whatsapp_status, name="whatsapp_status"),
    path("status/workers/", status.worker_statuses, name="worker_statuses"),
]
