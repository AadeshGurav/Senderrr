#!/usr/bin/env bash
# ============================================================
# WhatsApp Automation — Client Deployment Script
# ============================================================
# One-command deployment on any machine with Docker installed.
#
# Usage:
#   curl -sSL <url>/install.sh | bash
#   — or —
#   bash install.sh
#
# Requirements:
#   - Docker Engine 20.10+ with Docker Compose v2
#   - At least 4 GB RAM recommended
#   - Ports 8000 (dashboard) and 6080 (QR scan) available
# ============================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[installer]${NC} $*"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}!${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────
check_docker() {
    if ! command -v docker &>/dev/null; then
        fail "Docker not found. Install it from https://docs.docker.com/get-docker/"
    fi
    ok "Docker found: $(docker --version | head -1)"

    if ! docker compose version &>/dev/null; then
        fail "Docker Compose v2 not found. Update Docker or install the compose plugin."
    fi
    ok "Docker Compose found: $(docker compose version --short)"

    if ! docker info &>/dev/null; then
        fail "Docker daemon not running. Start it and try again."
    fi
    ok "Docker daemon is running."
}

check_ports() {
    local web_port="${WEB_PORT:-8000}"
    local vnc_port="${NOVNC_PORT:-6080}"

    for port in "$web_port" "$vnc_port"; do
        if command -v ss &>/dev/null; then
            if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
                warn "Port ${port} is in use. Set WEB_PORT or NOVNC_PORT in .env to change."
            fi
        fi
    done
}

# ── Generate .env if missing ────────────────────────────────
setup_env() {
    if [ -f .env ]; then
        ok ".env file exists."
        return
    fi

    log "Creating .env configuration file..."

    # Generate a random secret key
    local secret_key
    secret_key=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))" 2>/dev/null \
        || openssl rand -base64 48 2>/dev/null \
        || head -c 48 /dev/urandom | base64)

    # Generate a random Postgres password
    local pg_password
    pg_password=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))" 2>/dev/null \
        || openssl rand -base64 18 2>/dev/null \
        || head -c 18 /dev/urandom | base64)

    cat > .env <<ENVEOF
# ============================================================
# WhatsApp Automation — Configuration
# Generated on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ============================================================

# REQUIRED — URL to monitor for new articles
SCRAPER_TARGET_URL=https://example.com/articles

# Django
DJANGO_SECRET_KEY=${secret_key}
DJANGO_DEBUG=False
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_PASSWORD=changeme123

# PostgreSQL
POSTGRES_PASSWORD=${pg_password}

# Ports
WEB_PORT=8000
NOVNC_PORT=6080

# Anti-ban delays (seconds) — DO NOT reduce these
# AUTOMATION_JITTER_MIN=30
# AUTOMATION_JITTER_MAX=120

# Optional: Sentry DSN for error tracking
# SENTRY_DSN=https://xxx@sentry.io/123
ENVEOF

    ok ".env file created."
    warn "IMPORTANT: Edit .env and set SCRAPER_TARGET_URL before starting!"
}

# ── Build and start ──────────────────────────────────────────
build_and_start() {
    log "Building Docker images (this may take 5-10 minutes the first time)..."
    docker compose build --progress=plain 2>&1 | tail -5

    log "Starting services..."
    docker compose up -d

    ok "All services started."
}

# ── Wait for health ─────────────────────────────────────────
wait_for_health() {
    local web_port="${WEB_PORT:-8000}"
    local retries=30

    log "Waiting for the application to become healthy..."
    while [ $retries -gt 0 ]; do
        if curl -sf "http://localhost:${web_port}/healthz/" > /dev/null 2>&1; then
            ok "Application is healthy!"
            return 0
        fi
        retries=$((retries - 1))
        sleep 3
    done

    warn "Application did not become healthy in time."
    warn "Check logs with: docker compose logs -f web"
    return 1
}

# ── Print summary ────────────────────────────────────────────
print_summary() {
    local web_port="${WEB_PORT:-8000}"
    local vnc_port="${NOVNC_PORT:-6080}"

    echo ""
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${GREEN} WhatsApp Automation — Deployed Successfully${NC}"
    echo -e "${GREEN}============================================================${NC}"
    echo ""
    echo -e "  Dashboard:   ${CYAN}http://localhost:${web_port}${NC}"
    echo -e "  QR Scanner:  ${CYAN}http://localhost:${vnc_port}/vnc.html${NC}"
    echo -e "  Admin:       ${CYAN}http://localhost:${web_port}/admin/${NC}"
    echo ""
    echo -e "  Default login: admin / changeme123"
    echo -e "  ${YELLOW}Change the password immediately!${NC}"
    echo ""
    echo -e "  ${CYAN}Next steps:${NC}"
    echo "  1. Edit .env and set SCRAPER_TARGET_URL"
    echo "  2. Open the QR Scanner URL above and scan with WhatsApp"
    echo "  3. Add WhatsApp groups via the dashboard"
    echo "  4. The system will auto-detect articles and broadcast"
    echo ""
    echo -e "  ${CYAN}Useful commands:${NC}"
    echo "  docker compose logs -f          # live logs"
    echo "  docker compose logs -f worker   # worker logs only"
    echo "  docker compose restart worker   # restart worker"
    echo "  docker compose down             # stop everything"
    echo "  docker compose up -d            # start everything"
    echo "  docker compose exec web python manage.py health_check"
    echo ""
}

# ── MAIN ─────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN} WhatsApp Automation — Installer${NC}"
    echo -e "${CYAN}============================================================${NC}"
    echo ""

    check_docker
    check_ports
    setup_env
    build_and_start

    # Source .env for port variables
    set -a
    # shellcheck source=/dev/null
    [ -f .env ] && source .env
    set +a

    wait_for_health || true
    print_summary
}

main "$@"
