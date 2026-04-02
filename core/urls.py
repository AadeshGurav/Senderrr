"""Root URL configuration."""

from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

from core.health import healthz

urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("", include("apps.dashboard.urls")),
    path(
        "accounts/login/",
        auth_views.LoginView.as_view(template_name="dashboard/login.html"),
        name="login",
    ),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("admin/", admin.site.urls),
]
