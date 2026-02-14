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
# 1. Python virtual environment
# ---------------------------------------------------------------
if [ ! -d ".venv" ]; then
    info "Creating Python virtual environment..."
    python3 -m venv .venv
else
    info "Virtual environment already exists."
fi

source .venv/bin/activate
info "Activated venv: $(python --version)"

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
# 4. Start Redis via Docker Compose
# ---------------------------------------------------------------
if command -v docker &> /dev/null; then
    info "Starting Redis via Docker Compose..."
    docker compose up -d redis
    info "Redis is running."
else
    warn "Docker not found. Please install Redis manually:"
    warn "  Mac:   brew install redis && brew services start redis"
    warn "  Linux: sudo apt install redis-server && sudo systemctl start redis"
fi

# ---------------------------------------------------------------
# 5. Environment file
# ---------------------------------------------------------------
if [ ! -f ".env" ]; then
    cp .env.example .env
    info "Created .env from .env.example."
    warn "IMPORTANT: Edit .env and set SCRAPER_TARGET_URL to your website."
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
info "  1. Edit .env and set SCRAPER_TARGET_URL"
info "  2. Start all services:  honcho start"
info "  3. Scan the WhatsApp QR code in the browser window"
info '  4. Add groups:  python manage.py add_group "Group Name"'
info "  5. Verify:  python manage.py health_check"
echo ""
