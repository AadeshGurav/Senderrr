#!/bin/sh
# Render.com deployment entrypoint
# Cleans Chrome lock files and starts the application with proper signal handling.
#
# Key behaviors:
# - RENDER_DISK_PATH: set by Render when a persistent disk is attached.
#   When set, data is stored on the persistent disk (survives restarts).
#   When unset, data is on the ephemeral filesystem (lost on restart).
# - PORT: set by Render (default 10000). Used by the app.
# - On every start, Chrome lock files are cleaned to prevent "lockfile" errors
#   from stale Puppeteer sessions. This is critical when WhatsApp sessions are
#   persisted on the disk across restarts.

set -e

# ── Determine data path ───────────────────────────────────────────
# RENDER_DISK_PATH is injected by Render when a persistent disk is mounted.
# Falls back to /app/data for local Docker deployments.
DATA_DIR="${RENDER_DISK_PATH:-/app}/data"
SESSION_DIR="${DATA_DIR}/sessions"

# ── Chrome lock file cleanup ──────────────────────────────────────
# WhatsApp sessions stored in Chrome profiles. On crash/kill, Chrome leaves
# SingletonLock/SingletonCookie/SingletonSocket files that block the next launch.
# We clean these on every start to ensure Puppeteer can resume sessions.
echo "[Entrypoint] Cleaning Chrome lock files from ${SESSION_DIR}..."
for dir in "${SESSION_DIR}"/*/; do
    [ -d "$dir" ] || continue
    rm -f "$dir/SingletonLock" "$dir/SingletonCookie" "$dir/SingletonSocket" "$dir/Singleton" 2>/dev/null || true
done
# Clean Chromium profile locks in session root
rm -f "${SESSION_DIR}/.com.google.Chrome."* 2>/dev/null || true

# ── Orphaned Chrome process cleanup ───────────────────────────────
# Kill any Chrome processes from a previous (crashed) container run.
# This prevents port conflicts and zombie processes.
echo "[Entrypoint] Killing orphaned Chrome processes..."
pkill -f "chrome.*--disable-setuid-sandbox" 2>/dev/null || true

# ── Log environment info ─────────────────────────────────────────
if [ -n "$RENDER_DISK_PATH" ]; then
    echo "[Entrypoint] Render persistent disk detected: ${RENDER_DISK_PATH}"
    echo "[Entrypoint] Session data: ${SESSION_DIR}"
else
    echo "[Entrypoint] No persistent disk — data will be lost on restart"
    echo "[Entrypoint] For persistent WhatsApp sessions, attach a persistent disk in Render dashboard"
fi

echo "[Entrypoint] PORT=${PORT:-10000}, NODE_ENV=${NODE_ENV:-development}"

# ── Start application ─────────────────────────────────────────────
# dumb-init ensures proper signal forwarding (SIGTERM → Node.js process).
# This enables graceful shutdown on Render deploys.
echo "[Entrypoint] Starting Senderrr..."
exec dumb-init -- node /app/dist/main