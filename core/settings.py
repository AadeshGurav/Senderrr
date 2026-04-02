"""
Django settings for the WhatsApp Automation project.

Includes Celery/Redis configuration, scraper-specific settings,
and production Docker deployment config.
"""

from __future__ import annotations

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
# Database — SQLite for dev, PostgreSQL via DATABASE_URL in production
# ---------------------------------------------------------------------------
_database_url = os.environ.get("DATABASE_URL", "")

if _database_url.startswith("postgres"):
    # Parse DATABASE_URL: postgres://user:pass@host:port/dbname
    import re

    _m = re.match(
        r"postgres(?:ql)?://(?P<user>[^:]+):(?P<pass>[^@]+)@(?P<host>[^:]+):(?P<port>\d+)/(?P<name>.+)",
        _database_url,
    )
    if _m:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": _m.group("name"),
                "USER": _m.group("user"),
                "PASSWORD": _m.group("pass"),
                "HOST": _m.group("host"),
                "PORT": _m.group("port"),
                "CONN_MAX_AGE": 600,
                "OPTIONS": {
                    "connect_timeout": 10,
                },
            }
        }
    else:
        raise ValueError(f"Cannot parse DATABASE_URL: {_database_url}")
else:
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
STATIC_ROOT = os.environ.get("STATIC_ROOT", str(BASE_DIR / "staticfiles"))
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

# Quiet hours (UTC) — no sends during these hours
AUTOMATION_QUIET_HOUR_START = int(
    os.environ.get("AUTOMATION_QUIET_HOUR_START", "1")
)  # 1 AM UTC
AUTOMATION_QUIET_HOUR_END = int(
    os.environ.get("AUTOMATION_QUIET_HOUR_END", "7")
)  # 7 AM UTC


# ---------------------------------------------------------------------------
# Structured Logging — JSON in production, readable in dev
# ---------------------------------------------------------------------------
_LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
_LOG_FORMAT = "json" if not DEBUG else "verbose"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {message}",
            "style": "{",
        },
        "json": {
            "()": "core.logging_fmt.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": _LOG_FORMAT,
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(BASE_DIR / "logs" / "app.log"),
            "maxBytes": 10 * 1024 * 1024,  # 10 MB
            "backupCount": 5,
            "formatter": "json",
        },
    },
    "root": {
        "level": _LOG_LEVEL,
        "handlers": ["console", "file"],
    },
    "loggers": {
        "django": {"level": "WARNING", "propagate": True},
        "django.request": {"level": "ERROR", "propagate": True},
        "celery": {"level": _LOG_LEVEL, "propagate": True},
        "apps": {"level": _LOG_LEVEL, "propagate": True},
    },
}

# Ensure log directory exists
(BASE_DIR / "logs").mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Sentry (optional — set SENTRY_DSN to enable)
# ---------------------------------------------------------------------------
_SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if _SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
    )


# ---------------------------------------------------------------------------
# Security hardening (production only)
# ---------------------------------------------------------------------------
if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = os.environ.get("HTTPS_ENABLED", "").lower() in (
        "true",
        "1",
    )
    CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
    X_FRAME_OPTIONS = "DENY"
