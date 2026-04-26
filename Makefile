# WhatsApp Automation — Convenience Commands
# Usage: make <target>

.DEFAULT_GOAL := help
SHELL := /bin/bash
PYTHON := .venv/bin/python
CELERY := .venv/bin/celery
HONCHO := .venv/bin/honcho
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: help setup doctor start stop health groups migrate shell clean flush-scraper check-scraper preflight

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup:  ## First-time setup (installs everything)
	bash scripts/setup.sh

doctor:  ## Diagnose and auto-repair environment
	$(PYTHON) scripts/doctor.py

# ── Helpers ──────────────────────────────────────────────────────────────────

_orbstack-start:
	@if [ "$$(uname)" = "Darwin" ]; then \
		if ! pgrep -x "OrbStack" > /dev/null 2>&1; then \
			echo "  ▶  Starting OrbStack …"; \
			open -a OrbStack; \
			echo "  ⏳ Waiting for OrbStack to be ready …"; \
			for i in $$(seq 1 15); do \
				sleep 2; \
				if docker info > /dev/null 2>&1; then \
					echo "  ✓  OrbStack ready."; \
					break; \
				fi; \
				echo "     … still waiting ($$i/15)"; \
			done; \
		else \
			echo "  ✓  OrbStack already running."; \
		fi; \
	fi

_redis-start:
	@echo "  ▶  Starting Redis …"
	@$(COMPOSE) up -d redis
	@for i in $$(seq 1 10); do \
		sleep 1; \
		if $(PYTHON) -c "import redis; redis.Redis().ping()" > /dev/null 2>&1; then \
			echo "  ✓  Redis is up."; \
			break; \
		fi; \
		if [ "$$i" -eq 10 ]; then \
			echo "  ✗  Redis did not respond after 10s — check Docker / OrbStack."; \
			exit 1; \
		fi; \
		echo "     … waiting for Redis ($$i/10)"; \
	done

preflight:  ## Warn about common misconfigurations before starting
	@echo ""
	@echo "  ── Pre-flight checks ──────────────────────────────────"
	@if [ ! -f ".env" ]; then \
		echo "  ✗  .env file missing — run: cp .env.example .env"; \
	elif grep -qE "example\.com/articles|yoursite\.com/news" .env; then \
		echo "  ⚠  SCRAPER_TARGET_URLS still has the placeholder in .env — scraper will do nothing."; \
	else \
		echo "  ✓  .env looks configured."; \
	fi
	@if [ ! -d ".playwright_session/admin_1/session_0" ]; then \
		echo "  ⚠  No WhatsApp session found (.playwright_session/admin_1/session_0 missing) — scan QR on first run."; \
	else \
		echo "  ✓  WhatsApp session directory exists."; \
	fi
	@$(PYTHON) -c "\
import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','core.settings'); \
django.setup(); \
from apps.campaigns.models import WhatsAppGroup; \
n = WhatsAppGroup.objects.filter(is_active=True).count(); \
print(f'  ✓  {n} active WhatsApp group(s).' if n else '  ⚠  No active WhatsApp groups — add groups via the dashboard before broadcasting.')" 2>/dev/null || true
	@echo "  ──────────────────────────────────────────────────────"
	@echo ""

# ── Main targets ─────────────────────────────────────────────────────────────

start: _orbstack-start _redis-start  ## Start all services (OrbStack → Redis → session checks → Django + Celery + Beat)
	$(PYTHON) manage.py start

stop:  ## Stop Redis container
	$(COMPOSE) down

health:  ## Run system health check
	$(PYTHON) manage.py health_check

groups:  ## List all WhatsApp groups
	$(PYTHON) manage.py add_group --list

migrate:  ## Run Django migrations
	$(PYTHON) manage.py migrate

shell:  ## Open Django shell
	$(PYTHON) manage.py shell

flush-scraper:  ## Reset scraper — delete all ArticleHash records so next run re-seeds fresh
	$(PYTHON) manage.py flush_scraper

check-scraper:  ## Immediately trigger the scraper task and print result (bypasses Celery)
	$(PYTHON) manage.py shell -c "from apps.scraper.tasks import check_for_new_articles; print(check_for_new_articles())"

clean:  ## Remove caches and compiled files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	rm -rf .ruff_cache

