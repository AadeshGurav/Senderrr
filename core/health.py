"""Health check views for Docker HEALTHCHECK and monitoring."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db import connection
from django.http import JsonResponse

if TYPE_CHECKING:
    from django.http import HttpRequest

logger = logging.getLogger(__name__)


def healthz(request: HttpRequest) -> JsonResponse:
    """Lightweight health check for Docker and load balancers.

    Returns 200 if the app can reach the database,
    503 otherwise with details about the failure.
    """
    checks: dict[str, str] = {}

    # Database
    try:
        connection.ensure_connection()
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"fail: {exc}"

    # Redis
    try:
        import redis as redis_lib
        from django.conf import settings

        client = redis_lib.Redis.from_url(
            settings.CELERY_BROKER_URL, socket_timeout=3
        )
        client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"fail: {exc}"

    healthy = all(v == "ok" for v in checks.values())
    status_code = 200 if healthy else 503

    return JsonResponse(
        {"status": "healthy" if healthy else "unhealthy", "checks": checks},
        status=status_code,
    )
