# Deployment Guide — WhatsApp Automation

## Prerequisites

- **Docker Engine 20.10+** with Docker Compose v2
- **4 GB RAM** minimum (2 GB for Chromium, 2 GB for other services)
- **Ports 8000 and 6080** available (configurable)
- Works on: Linux, macOS, Windows (Docker Desktop)

## Quick Start

```bash
# 1. Clone or extract the project
cd whatsapp-automation

# 2. Run the installer
bash deploy/install.sh

# 3. Edit .env and set your target URL
nano .env  # set SCRAPER_TARGET_URL

# 4. Open the QR scanner and link your WhatsApp
#    → http://localhost:6080/vnc.html

# 5. Open the dashboard
#    → http://localhost:8000
#    Login: admin / changeme123
```

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────┐
│  Dashboard   │────→│ PostgreSQL│     │  Redis   │
│  (Gunicorn)  │     │          │     │          │
│  :8000       │     └──────────┘     └──────────┘
└──────┬──────┘           ↑                ↑
       │            ┌─────┴────────────────┤
       │            │                      │
┌──────┴──────┐  ┌──┴───────┐   ┌─────────┴─┐
│  noVNC/QR   │  │  Celery   │   │  Celery   │
│  :6080      │  │  Worker   │   │  Beat     │
└─────────────┘  │(Chromium) │   │(Scheduler)│
                 └───────────┘   └───────────┘
```

## Configuration (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `SCRAPER_TARGET_URL` | Yes | URL to monitor for new articles |
| `DJANGO_SECRET_KEY` | Auto | Generated on first install |
| `DJANGO_SUPERUSER_PASSWORD` | Yes | Dashboard login password |
| `POSTGRES_PASSWORD` | Auto | Generated on first install |
| `WEB_PORT` | No | Dashboard port (default: 8000) |
| `NOVNC_PORT` | No | QR scanner port (default: 6080) |
| `SENTRY_DSN` | No | Sentry error tracking URL |

## Common Operations

```bash
# View live logs
docker compose logs -f

# View only worker logs
docker compose logs -f worker

# Restart after config change
docker compose restart

# Stop everything
docker compose down

# Start everything
docker compose up -d

# Run health check
docker compose exec web python manage.py health_check

# Add a WhatsApp group
docker compose exec web python manage.py add_group "Group Name"

# Re-scan QR code (if session expires)
docker compose restart worker
# Then open http://localhost:6080/vnc.html
```

## Troubleshooting

### "WhatsApp session expired"
1. Open http://localhost:6080/vnc.html
2. Scan the QR code with your phone
3. Restart the worker: `docker compose restart worker`

### "Database connection refused"
```bash
docker compose ps         # check if postgres is running
docker compose logs postgres  # check postgres logs
docker compose restart postgres
```

### "Redis connection refused"
```bash
docker compose restart redis
docker compose logs redis
```

### "Worker keeps restarting"
```bash
docker compose logs --tail=50 worker
# Check for Playwright/Chromium errors
```

### View error screenshots
```bash
docker compose exec web ls -la /app/logs/screenshots/
# Copy a screenshot out
docker compose cp web:/app/logs/screenshots/ ./screenshots/
```

## Updating

```bash
# Pull the latest image and restart
docker compose pull
docker compose up -d
```

## Uninstalling

```bash
bash deploy/uninstall.sh
```
