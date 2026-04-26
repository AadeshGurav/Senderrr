#!/usr/bin/env bash
# ===================================================================
# WhatsApp Automation — First-Time Setup (Mac / Linux)
# ===================================================================
# This script:
#   1. Creates a Python virtual environment
#   2. Installs all dependencies
#   3. Installs the Playwright Chromium browser
#   4. Starts Redis via Docker Compose
#   5. Runs Django migrations
#   6. Copies .env.example to .env (if .env does not exist)
#
# Usage:
#   bash scripts/setup.sh
# ===================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Navigate to project root (parent of scripts/)
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"
info "Project directory: ${PROJECT_DIR}"

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

resolve_compose_cmd() {
    if docker compose version &>/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose &>/dev/null; then
        echo "docker-compose"
    else
        echo ""
    fi
}

ensure_pip_in_venv() {
    local pip_bin=".venv/bin/pip"
    if [ -x "$pip_bin" ]; then
        return 0
    fi

    warn "pip not found inside venv — bootstrapping with get-pip.py..."
    local get_pip="/tmp/get-pip.py"
    if command -v curl &>/dev/null; then
        curl -sS https://bootstrap.pypa.io/get-pip.py -o "$get_pip"
    elif command -v wget &>/dev/null; then
        wget -qO "$get_pip" https://bootstrap.pypa.io/get-pip.py
    else
        error "Neither curl nor wget found. Install one of them, then re-run."
    fi
    .venv/bin/python "$get_pip" --quiet
    rm -f "$get_pip"

    [ -x "$pip_bin" ] || error "Failed to bootstrap pip."
    info "pip bootstrapped successfully."
}

# ---------------------------------------------------------------
# 1. Python virtual environment
# ---------------------------------------------------------------
if [ ! -d ".venv" ]; then
    info "Creating Python virtual environment..."
    if ! python3 -m venv .venv 2>/dev/null; then
        # Debian/Ubuntu ships venv as a separate apt package
        if [ -f /etc/debian_version ]; then
            PY_MINOR="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
            warn "python3-venv not found. Installing python${PY_MINOR}-venv..."
            sudo apt-get update -qq && sudo apt-get install -y -qq "python${PY_MINOR}-venv"
            python3 -m venv .venv || error "Failed to create virtual environment even after installing python${PY_MINOR}-venv."
        else
            error "Failed to create virtual environment. Ensure python3-venv (or equivalent) is installed."
        fi
    fi
else
    info "Virtual environment already exists."
fi

source .venv/bin/activate
info "Activated venv: $(python --version)"

# Ensure pip is available (ensurepip may be missing on Debian/Ubuntu)
ensure_pip_in_venv

# ---------------------------------------------------------------
# 2. Install Python dependencies
# ---------------------------------------------------------------
info "Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
info "Dependencies installed."

# ---------------------------------------------------------------
# 3. Install Playwright Chromium
# ---------------------------------------------------------------
info "Installing Playwright Chromium browser (~250 MB download)..."
playwright install chromium
info "Playwright Chromium installed."

# ---------------------------------------------------------------
# 4. Start Redis
# ---------------------------------------------------------------
_redis_running() {
    # Returns 0 if Redis responds to PING on localhost:6379
    (echo PING | nc -w 1 localhost 6379 2>/dev/null | grep -q PONG) 2>/dev/null
}

REDIS_OK=false

if _redis_running; then
    info "Redis already running on localhost:6379."
    REDIS_OK=true
elif command -v docker &> /dev/null; then
    COMPOSE_CMD="$(resolve_compose_cmd)"
    if [ -n "$COMPOSE_CMD" ]; then
        info "Starting Redis via Docker Compose ($COMPOSE_CMD)..."
        $COMPOSE_CMD up -d redis
        REDIS_OK=true
        info "Redis is running."
    fi
fi

# Fallback: install Redis natively on Debian/Ubuntu
if [ "$REDIS_OK" = false ] && [ -f /etc/debian_version ]; then
    info "Installing Redis server natively (apt)..."
    sudo apt-get update -qq && sudo apt-get install -y -qq redis-server
    sudo systemctl enable redis-server --now 2>/dev/null || sudo service redis-server start 2>/dev/null || true
    sleep 1
    if _redis_running; then
        REDIS_OK=true
        info "Redis installed and running."
    else
        warn "Installed redis-server but it doesn't seem to be responding."
    fi
fi

# Fallback: install Redis via Homebrew on macOS
if [ "$REDIS_OK" = false ] && [ "$(uname)" = "Darwin" ]; then
    if command -v brew &> /dev/null; then
        info "Installing Redis via Homebrew..."
        brew install redis --quiet
        brew services start redis
        sleep 1
        if _redis_running; then
            REDIS_OK=true
            info "Redis installed and running."
        fi
    fi
fi

if [ "$REDIS_OK" = false ]; then
    warn "Could not start Redis automatically."
    warn "Install Redis manually, then run: honcho start"
    warn "  Mac:   brew install redis && brew services start redis"
    warn "  Linux: sudo apt install redis-server && sudo systemctl start redis"
fi

# ---------------------------------------------------------------
# 5. Environment file
# ---------------------------------------------------------------
if [ ! -f ".env" ]; then
    cp .env.example .env
    info "Created .env from .env.example."
    warn "IMPORTANT: Edit .env and set SCRAPER_TARGET_URLS to your website URL."
else
    info ".env already exists — skipping."
fi

# ---------------------------------------------------------------
# 6. Django migrations
# ---------------------------------------------------------------
info "Running Django migrations..."
python manage.py migrate --no-input
info "Database ready."

# ---------------------------------------------------------------
# Done
# ---------------------------------------------------------------
echo ""
info "=========================================="
info "  Setup complete!"
info "=========================================="
echo ""
info "Next steps:"
info "  1. Run:   make start"
info "     (First run will prompt for a dashboard password and QR scan)"
info "  2. Open:  http://localhost:8000"
info "     (Manage groups, settings, and broadcasts from the dashboard)"
echo ""
