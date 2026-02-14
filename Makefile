# WhatsApp Automation — Convenience Commands
# Usage: make <target>

.DEFAULT_GOAL := help
SHELL := /bin/bash
PYTHON := .venv/bin/python
CELERY := .venv/bin/celery
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: help setup doctor start stop health groups migrate shell clean

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup:  ## First-time setup (installs everything)
	bash scripts/setup.sh

doctor:  ## Diagnose and auto-repair environment
	$(PYTHON) scripts/doctor.py

start:  ## Start all services (Django + Celery + Beat)
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

clean:  ## Remove caches and compiled files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	rm -rf .ruff_cache
