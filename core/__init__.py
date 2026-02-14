"""Core Django project package — ensures Celery app loads on startup."""

from core.celery import app as celery_app

__all__ = ["celery_app"]
