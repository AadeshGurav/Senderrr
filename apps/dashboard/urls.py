"""Dashboard URL configuration."""

from django.urls import path

from apps.dashboard.views import (
    admin_health,
    admins,
    broadcasts,
    communities,
    dashboard,
    groups,
    settings,
    status,
)

app_name = "dashboard"

urlpatterns = [
    path("", dashboard.index, name="index"),
    path("admins/", dashboard.admins_page, name="admins_page"),
    path("groups/", dashboard.groups_page, name="groups_page"),
    path("communities/", dashboard.communities_page, name="communities_page"),
    path("broadcasts/page/", dashboard.broadcasts_page, name="broadcasts_page"),
    # Admins
    path("admins/add/", admins.add_admin, name="add_admin"),
    path("admins/<int:pk>/toggle/", admins.toggle_admin, name="toggle_admin"),
    path("admins/<int:pk>/edit/", admins.edit_admin, name="edit_admin"),
    path("admins/<int:pk>/delete/", admins.delete_admin, name="delete_admin"),
    # Groups
    path("groups/add/", groups.add_group, name="add_group"),
    path("groups/<int:pk>/toggle/", groups.toggle_group, name="toggle_group"),
    path("groups/<int:pk>/delete/", groups.delete_group, name="delete_group"),
    path("groups/<int:pk>/mark-healthy/", groups.mark_healthy, name="mark_healthy"),
    path("groups/<int:pk>/link/", groups.link_subgroup, name="link_subgroup"),
    path("groups/<int:pk>/unlink/", groups.unlink_subgroup, name="unlink_subgroup"),
    # Communities
    path("communities/add/", communities.add_community, name="add_community"),
    path(
        "communities/<int:pk>/toggle/",
        communities.toggle_community,
        name="toggle_community",
    ),
    path(
        "communities/<int:pk>/delete/",
        communities.delete_community,
        name="delete_community",
    ),
    path(
        "communities/<int:pk>/subgroups/",
        communities.community_subgroups,
        name="community_subgroups",
    ),
    path(
        "communities/<int:pk>/broadcast/",
        communities.trigger_community_broadcast,
        name="community_broadcast",
    ),
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
    path("status/admin-health/", admin_health.admin_health, name="admin_health"),
]
