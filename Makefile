# OpenWA - Pure Node.js Stack (No Python, No Django)
# Usage: make setup    install everything & start
#        make start    start the container
#        make stop     shut down
#        make restart  rebuild & restart
#        make logs     follow logs
#        make doctor   diagnose & auto-repair
#        make build    rebuild Docker image

SHELL := /bin/bash
.DEFAULT_GOAL := setup

# Activate ngrok profile if NGROK_AUTH_TOKEN is set in .env
_ngrok = $(shell grep -q '^NGROK_AUTH_TOKEN=' .env 2>/dev/null && \
  [ -n "$$(grep '^NGROK_AUTH_TOKEN=' .env | cut -d '=' -f2)" ] && \
  echo "--profile ngrok")

.PHONY: help setup start stop restart logs doctor build

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: _check-deps build _start  ## Full setup - build & start everything
	@echo ""
	@echo "  ================================================="
	@echo "   All set! Everything is running."
	@echo "  ================================================="
	@echo ""
	@echo "   OpenWA Server:  http://localhost:2785"
	@echo "   Dashboard:      http://localhost:2785/ (or /wa/dashboard)"
	@echo "   API Docs:       http://localhost:2785/api/docs"
	@echo "   Queue UI:       http://localhost:2785/api/admin/queues"
	$(if $(_ngrok), @echo "   Ngrok Tunnel:  http://localhost:4040 (dashboard)",)
	@echo ""
	$(if $(_ngrok), @echo "   🌐  Ngrok tunnel active — webhooks reachable via ngrok URL",)
	$(if $(_ngrok), @echo "",)
	@echo "   Login: admin / admin"
	@echo ""
	@echo "   To stop:  make stop"
	@echo "   To check: make doctor"

start: _check-deps _start  ## Start all services

stop:  ## Stop everything
	@docker compose $(_ngrok) down --remove-orphans

restart: stop start  ## Rebuild & restart

build: _check-deps  ## Build Docker image
	@echo "  Building OpenWA single-container image..."
	@docker compose $(_ngrok) build

logs:  ## Follow logs
	@docker compose $(_ngrok) logs -f

# ─── Doctor (diagnose & auto-repair) ──────────────────────────────

doctor:  ## Diagnose & auto-repair
	@echo ""; echo "  [1/3] Docker daemon ..."
	@docker info >/dev/null 2>&1 && echo "  OK  Docker running" || { echo "  FAIL  Docker not running."; exit 1; }
	@echo "  [2/3] Container status ..."
	@running=$$(docker compose ps --status running --services 2>/dev/null | grep -c "." 2>/dev/null || echo 0); \
	if [ "$$running" -eq 0 ]; then \
		echo "  FIX  Container not running — starting ..."; \
		make _start; \
	else \
		echo "  OK  Container running"; \
	fi
	@echo "  [3/3] OpenWA health ..."
	@if curl -sf http://localhost:2785/api/health >/dev/null 2>&1; then \
		echo "  OK  OpenWA healthy"; \
	else \
		echo "  FIX  OpenWA not responding — restarting ..."; \
		docker compose $(_ngrok) restart; \
		for i in $$(seq 1 30); do \
			if curl -sf http://localhost:2785/api/health >/dev/null 2>&1; then \
				echo "  OK  OpenWA recovered"; break; \
			fi; sleep 2; \
		done; \
	fi
	@echo ""; echo "  OpenWA Server:  http://localhost:2785"
	@echo "   Dashboard:      http://localhost:2785/"
	@echo "   Login: admin / admin"

# ─── Internal helpers ──────────────────────────────────────────────

_check-deps:
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required."; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Docker daemon not running."; exit 1; }

_start:
	@echo "  Starting container ..."
	@if command -v caffeinate >/dev/null 2>&1; then \
		caffeinate -dimsu docker compose $(_ngrok) up -d; \
	else \
		docker compose $(_ngrok) up -d; \
	fi
	@echo "  Waiting for OpenWA ..."
	@for i in $$(seq 1 60); do \
		if curl -sf http://localhost:2785/api/health >/dev/null 2>&1; then \
			echo "  OK  OpenWA ready"; \
			break; \
		fi; \
		sleep 2; \
		if [ $$i -eq 60 ]; then echo "FAIL  OpenWA did not start."; exit 1; fi; \
	done