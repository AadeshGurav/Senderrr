"""
Django settings for the WhatsApp Automation project.

Includes Celery/Redis configuration and scraper-specific settings.
"""

import os
from pathlib import Path

from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-CHANGE-ME-IN-PRODUCTION",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")

ALLOWED_HOSTS: list[str] = os.environ.get("ALLOWED_HOSTS", "*").split(",")


# ---------------------------------------------------------------------------
# Application registry
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "django_celery_beat",
    # Project apps
    "apps.scraper",
    "apps.campaigns",
    "apps.automation",
    "apps.dashboard",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"


# ---------------------------------------------------------------------------
# Database — SQLite for dev, swap to Postgres in production
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# ---------------------------------------------------------------------------
# Auth password validators
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATICFILES_DIRS: list[str] = []
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/accounts/login/"


# ---------------------------------------------------------------------------
# Celery / Redis
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND", "redis://localhost:6379/1"
)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 600  # 10 min hard limit per task
CELERY_TASK_SOFT_TIME_LIMIT = 540  # 9 min soft limit
CELERY_WORKER_CONCURRENCY = 1  # Solo pool — browser singleton lives in main process

CELERY_BEAT_SCHEDULE = {
    "check-for-new-articles": {
        "task": "apps.scraper.tasks.check_for_new_articles",
        "schedule": crontab(minute="*/5"),
    },
}


# ---------------------------------------------------------------------------
# Scraper settings
# ---------------------------------------------------------------------------
SCRAPER_TARGET_URL = os.environ.get(
    "SCRAPER_TARGET_URL",
    "https://example.com/articles",
)
SCRAPER_REQUEST_TIMEOUT = int(os.environ.get("SCRAPER_REQUEST_TIMEOUT", "30"))
SCRAPER_MAX_RETRIES = int(os.environ.get("SCRAPER_MAX_RETRIES", "3"))


# ---------------------------------------------------------------------------
# Playwright / Automation settings
# ---------------------------------------------------------------------------
PLAYWRIGHT_USER_DATA_DIR = os.environ.get(
    "PLAYWRIGHT_USER_DATA_DIR",
    str(BASE_DIR / ".playwright_session"),
)
PLAYWRIGHT_HEADLESS = os.environ.get("PLAYWRIGHT_HEADLESS", "False").lower() in (
    "true",
    "1",
    "yes",
)

# Anti-ban jitter bounds (seconds)
AUTOMATION_JITTER_MIN = float(os.environ.get("AUTOMATION_JITTER_MIN", "30"))
AUTOMATION_JITTER_MAX = float(os.environ.get("AUTOMATION_JITTER_MAX", "120"))

# Human typing delay bounds (seconds per character)
AUTOMATION_TYPING_DELAY_MIN = float(
    os.environ.get("AUTOMATION_TYPING_DELAY_MIN", "0.03")
)
AUTOMATION_TYPING_DELAY_MAX = float(
    os.environ.get("AUTOMATION_TYPING_DELAY_MAX", "0.12")
)
