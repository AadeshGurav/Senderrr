# Archived Infrastructure Components

This directory contains disabled/archived infrastructure code that is no longer active but
is kept for reference and potential future reactivation.

---

## Contents

### `archived-docker-compose.yml`
The original `docker-compose.yml` that included:
- **ngrok tunnel** — used to expose the local dev server to the internet for webhook testing
- **PostgreSQL** — optional managed database (render.yaml uses SQLite on persistent disk instead)
- **Redis** — optional caching/queue (render.yaml disables on free tier to avoid extra cost)

**Why archived:** Render.com's free tier doesn't support Docker Compose. The app runs as a
single Docker container with a persistent disk. PostgreSQL/Redis add cost and complexity;
SQLite on the persistent disk handles everything for zero cost.

**To reactivate:** Copy sections back into `docker-compose.yml` and set required env vars.

---

### `archived-env-vars.md`
Lists all ngrok-related environment variables that were in use:
- `NGROK_AUTH_TOKEN` — ngrok authentication token
- `NGROK_URL` — static ngrok domain (e.g., `opossum-first-ghastly.ngrok-free.app`)

**Why archived:** Ngrok is for local development only. On Render, the platform provides
HTTPS endpoints automatically. Webhook destinations should point to Render's public URL
or an external service like ngrok deployed separately, not embedded in the app.

**To reactivate:** Add these env vars to your `.env` file for local webhook testing.

---

## Current Infrastructure (render.yaml)

The active deployment is defined in `../render.yaml` — a single Docker web service with:
- 1 GB persistent disk (sessions, SQLite, media)
- SQLite database (zero cost)
- No external services (Redis/PostgreSQL disabled on free tier)
- Auto-deploy on push to `main`

See `../README-RENDER.md` for the full deployment guide.

---

## General Rule

If a component is not referenced in `render.yaml` or actively used in the codebase,
it belongs here. When you need it again, copy from this directory and update paths.