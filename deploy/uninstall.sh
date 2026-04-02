#!/usr/bin/env bash
# ============================================================
# WhatsApp Automation — Uninstaller
# ============================================================
# Stops containers, removes images and volumes.
# Usage: bash uninstall.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${RED}============================================================${NC}"
echo -e "${RED} WhatsApp Automation — Uninstaller${NC}"
echo -e "${RED}============================================================${NC}"
echo ""

read -rp "This will stop all services and delete all data. Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo -e "${YELLOW}Stopping services...${NC}"
docker compose down --remove-orphans 2>/dev/null || true

read -rp "Delete all data volumes (database, sessions, logs)? [y/N] " del_volumes
if [[ "$del_volumes" =~ ^[yY]$ ]]; then
    docker compose down -v 2>/dev/null || true
    echo -e "${GREEN}Volumes removed.${NC}"
fi

read -rp "Remove Docker images? [y/N] " del_images
if [[ "$del_images" =~ ^[yY]$ ]]; then
    docker compose down --rmi all 2>/dev/null || true
    echo -e "${GREEN}Images removed.${NC}"
fi

echo ""
echo -e "${GREEN}Uninstallation complete.${NC}"
echo ""
