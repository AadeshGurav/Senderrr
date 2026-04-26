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
    "whitenoise.middleware.WhiteNoiseMiddleware",
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
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS: list[str] = []

# ---------------------------------------------------------------------------
# Media files (user-uploaded advertisements, attachments)
# ---------------------------------------------------------------------------
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
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

# Modules with tasks not following the default tasks.py naming convention.
CELERY_IMPORTS = [
    "apps.campaigns.community_tasks",
    "apps.campaigns.maintenance_tasks",
    "apps.campaigns.advertisement_tasks",
]

CELERY_BEAT_SCHEDULE = {
    "check-for-new-articles": {
        "task": "apps.scraper.tasks.check_for_new_articles",
        "schedule": crontab(minute="*/5"),
    },
    "auto-recover-unhealthy-groups": {
        "task": "apps.campaigns.maintenance_tasks.auto_recover_unhealthy_groups",
        "schedule": crontab(minute=0),
    },
}

# dispatch_heartbeats reads the live worker map and fans out to each
# active worker queue.  No phantom workers regardless of admin count.
CELERY_BEAT_SCHEDULE["dispatch-heartbeats"] = {
    "task": "apps.automation.tasks.dispatch_heartbeats",
    "schedule": crontab(minute="*/2"),
}


# ---------------------------------------------------------------------------
# Scraper settings
# ---------------------------------------------------------------------------
SCRAPER_TARGET_URL = os.environ.get(
    "SCRAPER_TARGET_URL",
    "https://example.com/articles",
)
SCRAPER_TARGET_URLS = os.environ.get("SCRAPER_TARGET_URLS", "")
SCRAPER_REQUEST_TIMEOUT = int(os.environ.get("SCRAPER_REQUEST_TIMEOUT", "30"))
SCRAPER_MAX_RETRIES = int(os.environ.get("SCRAPER_MAX_RETRIES", "3"))
# Articles older than this (hours) when first detected are silently seeded
# without broadcasting — prevents re-sending news the owner manually sent
# while the system was offline. Increase before long weekends.
SCRAPER_MAX_ARTICLE_AGE_HOURS = int(
    os.environ.get("SCRAPER_MAX_ARTICLE_AGE_HOURS", "12")
)

# Scraper live-hours window — the scraper only runs inside this window.
# Outside it (nights, weekends, public holidays) the task returns early
# so the owner can post manually without the system duplicating messages.
# SCRAPER_ACTIVE_WEEKDAYS: comma-separated Python weekday numbers (0=Mon … 6=Sun).
# Defaults: always active (00:00–23:00 on all seven days).
SCRAPER_ACTIVE_HOUR_START = int(os.environ.get("SCRAPER_ACTIVE_HOUR_START", "0"))
SCRAPER_ACTIVE_HOUR_END = int(os.environ.get("SCRAPER_ACTIVE_HOUR_END", "23"))
SCRAPER_ACTIVE_WEEKDAYS = os.environ.get("SCRAPER_ACTIVE_WEEKDAYS", "0,1,2,3,4,5,6")


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

# Rate limits — prevents WhatsApp bans from high-volume sends
AUTOMATION_HOURLY_LIMIT = int(os.environ.get("AUTOMATION_HOURLY_LIMIT", "30"))
AUTOMATION_DAILY_LIMIT = int(os.environ.get("AUTOMATION_DAILY_LIMIT", "150"))

# Batch settings — pauses between groups to appear human
AUTOMATION_BATCH_SIZE = int(os.environ.get("AUTOMATION_BATCH_SIZE", "50"))
AUTOMATION_BATCH_COOLDOWN = int(
    os.environ.get("AUTOMATION_BATCH_COOLDOWN", "900")
)  # seconds between batches (15 min)

# Progressive jitter — sends get slower as batch progresses
AUTOMATION_JITTER_MULTIPLIER = float(
    os.environ.get("AUTOMATION_JITTER_MULTIPLIER", "1.5")
)  # jitter grows by this factor every BATCH_SIZE messages

# Quiet hours (local timezone from TIME_ZONE) — no sends during these hours
AUTOMATION_QUIET_HOUR_START = int(
    os.environ.get("AUTOMATION_QUIET_HOUR_START", "1")
)  # 1 AM local time
AUTOMATION_QUIET_HOUR_END = int(
    os.environ.get("AUTOMATION_QUIET_HOUR_END", "7")
)  # 7 AM local time

# Multi-window parallel sending
AUTOMATION_WORKER_COUNT = int(os.environ.get("AUTOMATION_WORKER_COUNT", "1"))
AUTOMATION_WORKER_STAGGER = int(os.environ.get("AUTOMATION_WORKER_STAGGER", "45"))
AUTOMATION_MAX_CONCURRENT_SENDS = int(
    os.environ.get("AUTOMATION_MAX_CONCURRENT_SENDS", "2")
)

# ---------------------------------------------------------------------------
# Group health
# ---------------------------------------------------------------------------
# How many consecutive failures before a group is flagged unhealthy.
GROUP_MAX_CONSECUTIVE_FAILURES = int(
    os.environ.get("GROUP_MAX_CONSECUTIVE_FAILURES", "10")
)
# If True, also deactivates the group (stops it from receiving any future
# broadcasts) in addition to marking it unhealthy. Keep False unless you
# explicitly want manual re-activation required after every failure streak.
GROUP_AUTO_DISABLE_ON_UNHEALTHY = os.environ.get(
    "GROUP_AUTO_DISABLE_ON_UNHEALTHY", "False"
).lower() in ("true", "1", "yes")
# Hours after last failure before an unhealthy group is automatically
# given another chance (consecutive_failures reset, is_healthy restored).
GROUP_UNHEALTHY_RECOVERY_HOURS = int(
    os.environ.get("GROUP_UNHEALTHY_RECOVERY_HOURS", "2")
)

# ---------------------------------------------------------------------------
# Retry settings
# ---------------------------------------------------------------------------
MESSAGE_MAX_RETRY_ATTEMPTS = int(os.environ.get("MESSAGE_MAX_RETRY_ATTEMPTS", "3"))
RATE_LIMIT_RETRY_DELAY = int(os.environ.get("RATE_LIMIT_RETRY_DELAY", "3600"))
