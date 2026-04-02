#!/usr/bin/env bash
# ============================================================
# WhatsApp Automation — Docker Entrypoint
# ============================================================
# Handles: Xvfb, noVNC, migrations, superuser, and process launch.
# Usage:  docker-entrypoint.sh <web|worker|beat|qrscan>
# ============================================================

set -euo pipefail

# ── Logging helpers ──────────────────────────────────────────
log()  { echo "[entrypoint] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
die()  { log "FATAL: $*"; exit 1; }

# ── Start Xvfb (virtual display) ────────────────────────────
start_xvfb() {
    if ! pgrep -x Xvfb > /dev/null 2>&1; then
        log "Starting Xvfb on ${DISPLAY:-:99}..."
        Xvfb "${DISPLAY:-:99}" -screen 0 1280x900x24 -nolisten tcp &
        sleep 1
        log "Xvfb running."
    fi
}

# ── Start noVNC (for QR code scanning) ──────────────────────
start_novnc() {
    local port="${NOVNC_PORT:-6080}"
    log "Starting x11vnc + noVNC on port ${port}..."

    # Start VNC server (no password — internal network only)
    x11vnc -display "${DISPLAY:-:99}" -nopw -forever -shared -rfbport 5900 \
        -bg -o /tmp/x11vnc.log 2>/dev/null || true

    # Start noVNC websocket proxy
    websockify --web /usr/share/novnc/ "${port}" localhost:5900 &
    log "noVNC available at http://localhost:${port}/vnc.html"
}

# ── Wait for PostgreSQL ─────────────────────────────────────
wait_for_postgres() {
    log "Waiting for PostgreSQL..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.db import connection
connection.ensure_connection()
print('ok')
" 2>/dev/null | grep -q "ok"; then
            log "PostgreSQL is ready."
            return 0
        fi
        retries=$((retries - 1))
        log "PostgreSQL not ready, retrying in 2s... (${retries} left)"
        sleep 2
    done
    die "PostgreSQL did not become ready in time."
}

# ── Wait for Redis ───────────────────────────────────────────
wait_for_redis() {
    log "Waiting for Redis..."
    local retries=15
    while [ $retries -gt 0 ]; do
        if python -c "
import redis, os
r = redis.from_url(os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0'))
r.ping()
print('ok')
" 2>/dev/null | grep -q "ok"; then
            log "Redis is ready."
            return 0
        fi
        retries=$((retries - 1))
        log "Redis not ready, retrying in 2s... (${retries} left)"
        sleep 2
    done
    die "Redis did not become ready in time."
}

# ── Run Django migrations ────────────────────────────────────
run_migrations() {
    log "Running database migrations..."
    python manage.py migrate --no-input 2>&1 | while read -r line; do
        log "migrate: $line"
    done
    log "Migrations complete."
}

# ── Create superuser if none exists ──────────────────────────
ensure_superuser() {
    python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(is_superuser=True).exists():
    username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
    password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'changeme123')
    User.objects.create_superuser(username=username, password=password)
    print(f'Superuser \"{username}\" created.')
else:
    print('Superuser already exists.')
"
}

# ── Collect static files ─────────────────────────────────────
collect_static() {
    log "Collecting static files..."
    python manage.py collectstatic --no-input --clear 2>/dev/null || true
    log "Static files collected."
}

# ── MAIN ─────────────────────────────────────────────────────
ROLE="${1:-web}"
log "Starting role: ${ROLE}"

case "$ROLE" in
    web)
        start_xvfb
        wait_for_postgres
        wait_for_redis
        run_migrations
        ensure_superuser
        collect_static
        start_novnc

        log "Starting Gunicorn on 0.0.0.0:8000..."
        exec gunicorn core.wsgi:application \
            --bind 0.0.0.0:8000 \
            --workers "${GUNICORN_WORKERS:-2}" \
            --threads "${GUNICORN_THREADS:-4}" \
            --timeout 120 \
            --access-logfile - \
            --error-logfile - \
            --log-level info \
            --capture-output
        ;;

    worker)
        start_xvfb
        wait_for_postgres
        wait_for_redis

        log "Starting Celery worker..."
        exec celery -A core worker \
            --loglevel=info \
            --pool=solo \
            --concurrency=1 \
            --max-tasks-per-child=50 \
            --without-heartbeat \
            -Q celery
        ;;

    beat)
        wait_for_postgres
        wait_for_redis

        log "Starting Celery beat..."
        exec celery -A core beat \
            --loglevel=info \
            --scheduler django_celery_beat.schedulers:DatabaseScheduler \
            --pidfile /tmp/celerybeat.pid
        ;;

    qrscan)
        start_xvfb
        start_novnc
        wait_for_postgres

        log "==================================================="
        log " QR SCAN MODE"
        log " Open http://localhost:${NOVNC_PORT:-6080}/vnc.html"
        log " Scan the QR code, then restart with 'web' role."
        log "==================================================="

        python manage.py login
        ;;

    health)
        # Used by Docker HEALTHCHECK
        exec curl -sf http://localhost:8000/healthz/ || exit 1
        ;;

    *)
        # Pass through any other command
        exec "$@"
        ;;
esac
