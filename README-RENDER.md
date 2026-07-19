# Deploying Senderrr on Render Free Tier

Senderrr (OpenWA) is a self-hosted WhatsApp API gateway. This guide covers deploying it on Render's free tier with zero monthly cost, persistent storage for WhatsApp sessions, and hardened security for public internet exposure.

---

## Prerequisites

- [Render account](https://dashboard.render.com/register) (free tier is sufficient)
- [GitHub](https://github.com/) repository with Senderrr code pushed
- A WhatsApp account to scan QR code (for session authentication)

---

## Architecture on Free Tier

```
┌─────────────────────────────────────────────────────────────┐
│                    Render Free Instance                      │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               NestJS Application                     │   │
│   │   • API server (port 10000)                         │   │
│   │   • Health checks (/api/health/live, /ready, /ping) │   │
│   │   • WebSocket (real-time events)                    │   │
│   │   • Scheduler (cron jobs, auto-retry)               │   │
│   │   • Keep-alive pinger (7 min interval)              │   │
│   └──────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│   ┌──────────────────▼──────────────────────────────────┐   │
│   │           Chromium + Puppeteer                       │   │
│   │   • WhatsApp-web.js browser automation              │   │
│   │   • QR code generation for session auth             │   │
│   └──────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│   ┌──────────────────▼──────────────────────────────────┐   │
│   │            Persistent Disk (1 GB)                    │   │
│   │   • WhatsApp session state (Chrome profiles)        │   │
│   │   • SQLite database (openwa.sqlite)                 │   │
│   │   • Media files (images, videos, documents)         │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Free Tier Constraints

| Constraint | Impact | Mitigation |
|---|---|---|
| Instance sleeps after 15 min inactivity | WhatsApp sessions disconnect | Keep-alive ping every 7 min |
| 750 instance hours/month | One service fits comfortably | Monitor on Billing page |
| No multi-instance scaling | Can't auto-scale horizontally | Single instance is sufficient |
| Zero-downtime deploys disabled | ~30s downtime on each deploy | Accept brief interruptions |
| No SSH access | Can't inspect container | Use `render logs` CLI command |
| No persistent disk on starter | N/A — free plan supports disks | 1 GB disk included |
| Outbound SMTP blocked | Can't send emails directly | Use external email service |

---

## Step-by-Step Deployment

### 1. Push to GitHub

```bash
git add .
git commit -m "feat: add Render free tier deployment support"
git push origin main
```

### 2. Connect to Render

1. Go to [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)
2. Click **New Blueprint → Connect a repository**
3. Select your GitHub repo and branch (`main`)
4. Render auto-detects `render.yaml` and shows the service preview

### 3. Configure Environment Variables

During Blueprint creation, Render prompts for **secret variables** (marked with `sync: false`):

| Variable | What to enter |
|---|---|
| `WA_JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomUUID())"` |
| `API_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGINS` | Your frontend domain(s), or leave empty for same-origin |

All other variables are pre-filled from `render.yaml` defaults.

### 4. Attach Persistent Disk

Render auto-creates the disk defined in `render.yaml`:

- **Name**: `senderrr-data`
- **Mount path**: `/var/data`
- **Size**: 1 GB

The disk stores:
- WhatsApp session profiles (survives restarts — no re-scan needed)
- SQLite database (all session/message/webhook data)
- Media files (sent/received attachments)

### 5. Deploy

Click **Create Blueprint**. Render:
1. Builds the Docker image (clones repo, runs `npm ci && npm run build`)
2. Provisions the persistent disk
3. Starts the service
4. Runs health checks

After deployment, access:
- **API**: `https://senderrr.onrender.com/api`
- **Swagger docs**: `https://senderrr.onrender.com/api/docs`
- **Dashboard**: `https://senderrr.onrender.com/wa/dashboard`

---

## GitHub Auto-Deploy Setup

The `render.yaml` has `autoDeploy: true` — Render auto-deploys on every push to `main` without any GitHub Actions setup. However, the included GitHub Actions workflow (`.github/workflows/deploy-render.yml`) provides additional control:

### What the workflow does

| Job | Trigger | What it does |
|---|---|---|
| **test** | Every push/PR | TypeScript check, lint, unit tests |
| **build** | Every push to `main` | Build Docker image, push to GHCR with cache |
| **deploy** | Every push to `main` (after build) | Trigger Render deploy + health check |
| **notify-failure** | Deploy failure | Log failure + optional Slack notification |

### Enable GitHub Actions auto-deploy

1. **Generate a Render API key**:
   - Go to [dashboard.render.com/u/settings?add-api-key](https://dashboard.render.com/u/settings?add-api-key)
   - Name it `github-actions-deploy`
   - Copy the key

2. **Add secrets to GitHub**:
   - Go to `Settings → Secrets and variables → Actions` on your repo
   - Add:
     - `RENDER_API_KEY` → your Render API key
     - `SLACK_WEBHOOK_URL` → (optional) Slack incoming webhook for failure alerts

3. **Add variables to GitHub**:
   - Go to `Settings → Secrets and variables → Actions → Variables`
   - Add:
     - `RENDER_SERVICE_ID` → your Render service ID (from the service URL: `dashboard.render.com/services/<SERVICE_ID>`)
     - `RENDER_SERVICE_URL` → your deployed service URL (e.g., `https://senderrr.onrender.com`)

4. **Push to `main`**:
   ```bash
   git add .github/workflows/deploy-render.yml
   git commit -m "feat: add GitHub Actions auto-deploy to Render"
   git push origin main
   ```

### Auto-deploy flow

```
git push main
       │
       ▼
  GitHub Actions
       │
   ┌───┴───┐
   │ test  │ ← TypeScript, lint, unit tests
   └───┬───┘
       │
   ┌───┴───┐
   │ build │ ← Docker build → GHCR (with cache)
   └───┬───┘
       │
   ┌───┴───┐
   │deploy │ ← Render CLI trigger + health check
   └───┬───┘
       │
       ▼
  Render builds Docker image from repo (or uses GHCR cache)
       │
       ▼
   Service deployed with zero-config
```

### PR Preview Deployments

The `.github/workflows/pr-preview.yml` workflow creates a preview environment for every PR. To enable:

1. In Render Dashboard → your service → Settings → **Preview Environments**
2. Enable Pull Request previews
3. Set `RENDER_PREVIEW_ENV_ID` in GitHub secrets

### Disable auto-deploy

To prevent Render from auto-deploying on git push (use GitHub Actions only):

```yaml
# In render.yaml
autoDeploy: false
```

Or disable via the Render Dashboard: Service → Settings → Auto-Deploy → Off

---

## First-Time Setup

### 1. Create Initial Admin User

After the service starts, use the API to create an admin user:

```bash
curl -X POST https://your-service.onrender.com/api/auth/register \
  -H "X-API-Key: YOUR_GENERATED_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "YOUR_STRONG_PASSWORD",
    "role": "admin"
  }'
```

### 2. Authenticate and Create a WhatsApp Session

```bash
# Get an auth token
curl -X POST https://your-service.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "YOUR_PASSWORD"}'

# Create a WhatsApp session (returns QR code URL)
curl -X POST https://your-service.onrender.com/api/sessions \
  -H "X-API-Key: YOUR_GENERATED_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-whatsapp", "config": {}}'

# Poll for QR code status until authenticated
curl https://your-service.onrender.com/api/sessions/my-whatsapp \
  -H "X-API-Key: YOUR_GENERATED_API_KEY"
```

Scan the QR code with WhatsApp on your phone. Once authenticated, the session persists on the disk across restarts.

---

## Security Hardening Checklist

Before exposing to the public internet:

- [ ] **Change `WA_JWT_SECRET`** — use a cryptographically random value
- [ ] **Change `API_KEY`** — use a 64-character hex string
- [ ] **Set `CORS_ORIGINS`** — restrict to your frontend domain(s)
- [ ] **Enable rate limiting** — already configured, verify limits are acceptable
- [ ] **Disable Swagger in production** — add `SWAGGER_ENABLED=false` if not needed
- [ ] **Monitor logs** — set up log streaming to Datadog/Better Stack
- [ ] **Use HTTPS** — enforced by default on Render
- [ ] **Rotate secrets periodically** — regenerate API keys every 90 days

---

## Persistent Disk Management

### Resize Disk

Dashboard → senderrr service → Disks tab → Resize

### Backup Session Data

```bash
# SSH into ephemeral instance
render ssh <service-id> --ephemeral

# Copy session data
tar -czf /tmp/sessions-backup.tar.gz -C /var/data sessions/
# Download via Render dashboard or S3
```

### Restore Session Data

```bash
# Upload backup to the service
tar -xzf sessions-backup.tar.gz -C /var/data
# Restart the service
```

---

## Upgrade Path: Moving to Paid Plan

When free tier limits are reached:

### 1. Upgrade Workspace

Dashboard → Settings → Plan → Pro ($25/month)

### 2. Add Redis for Async Webhooks

```bash
render kv create \
  --name senderrr-redis \
  --region oregon \
  --plan starter
```

Then set environment variables:
```
REDIS_ENABLED=true
REDIS_HOST=<from Render dashboard>
REDIS_PORT=6379
QUEUE_ENABLED=true
```

### 3. Enable Autoscaling

```yaml
# In render.yaml
scaling:
  minInstances: 1
  maxInstances: 3
  targetCPUPercent: 70
```

### 4. Add PostgreSQL for High Volume

```bash
render pg create \
  --name senderrr-db \
  --region oregon \
  --plan starter
```

Then update:
```
DATABASE_TYPE=postgres
DATABASE_HOST=<from Render dashboard>
DATABASE_PORT=5432
DATABASE_USERNAME=<user>
DATABASE_PASSWORD=<password>
DATABASE_SYNCHRONIZE=false
```

---

## Troubleshooting

### Service won't start — "lockfile" error

Chrome left lock files from a previous run. The `docker-entrypoint.sh` cleans these automatically. If the issue persists:

1. Go to Dashboard → senderrr → Shell
2. Run: `rm -f /var/data/sessions/*/Singleton*`
3. Restart the service

### QR code not scanning — "invalid session"

WhatsApp may have invalidated the session (device changes, app updates, country change).

1. Delete the session: `DELETE /api/sessions/{name}`
2. Create a new session and re-scan the QR code

### Service spun down and won't wake up

Free tier instance sleeps after 15 min idle. It takes ~60s to spin back up. If health checks fail during spin-up, Render automatically retries.

**Keep-alive solution**: External uptime monitor (Uptime Robot free: 50 monitors, 5-min interval):
```
URL: https://your-service.onrender.com/api/health/ping
```

### Build fails — out of memory

Starter build pipeline (2 CPU, 8 GB RAM) may not be enough for large Docker builds.

**Solution**: Upgrade to Performance pipeline (16 CPU, 64 GB RAM) — Pro workspace required.

### Webhook delivery fails — "connection refused"

On free tier, BullMQ is disabled and webhooks are delivered synchronously. If the webhook endpoint is slow or unreachable, the API request times out.

**Solution**: Add `webhook.maxRetries: 1` and set a short timeout to prevent API blocking.

### Disk full

1. Dashboard → Disks → Resize to larger capacity
2. Or migrate media to S3:
   ```
   STORAGE_TYPE=s3
   S3_BUCKET=your-bucket
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```

---

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `10000` | HTTP server port (Render sets this) |
| `HOST` | `0.0.0.0` | Bind address (required for Render) |
| `NODE_ENV` | `production` | Runtime mode |
| `RENDER_DISK_PATH` | `/var/data` | Persistent disk mount (auto-set by Render) |
| `DATABASE_TYPE` | `sqlite` | Database type (sqlite or postgres) |
| `DATABASE_NAME` | `/var/data/openwa.sqlite` | SQLite path on persistent disk |
| `SESSION_DATA_PATH` | `/var/data/sessions` | WhatsApp session profiles |
| `STORAGE_LOCAL_PATH` | `/var/data/media` | Media file storage |
| `REDIS_ENABLED` | `false` | Enable Redis connection |
| `QUEUE_ENABLED` | `false` | Enable BullMQ async webhook queue |
| `KEEP_ALIVE_ENABLED` | `true` | Prevent free tier spin-down |
| `KEEP_ALIVE_INTERVAL_MS` | `420000` | Keep-alive ping interval (7 min) |
| `ENFORCE_HTTPS` | `true` | Redirect HTTP → HTTPS |
| `WA_JWT_SECRET` | — | JWT signing secret (REQUIRED) |
| `API_KEY` | — | Admin API key (REQUIRED) |
| `CORS_ORIGINS` | — | Allowed CORS origins (comma-separated) |
| `TRUSTED_PROXIES` | `0.0.0.0/0` | Trusted proxy IPs for X-Forwarded-For |

---

## Files Modified for Render Integration

| File | Change |
|---|---|
| `src/config/configuration.ts` | Render disk path, auto-detect queue, keep-alive config |
| `src/main.ts` | 0.0.0.0 binding, HTTPS redirect, keep-alive pinger, request ID |
| `src/modules/health/health.controller.ts` | `/api/health/live`, `/api/health/ping`, `/api/health/ready` |
| `src/app.module.ts` | Auto-detect queue from REDIS_ENABLED env var |
| `src/modules/queue/queue.module.ts` | Lazy Redis connect, Bull Board only in dev |
| `Dockerfile` | Health check on `/api/health/live`, PORT-aware, multi-stage |
| `docker-entrypoint.sh` | Render disk path, Chrome lock cleanup, signal handling |
| `render.yaml` | Blueprint: free tier, persistent disk, auto-deploy |
| `.render/env.yaml` | Environment variable reference (secrets excluded) |
| `.env.render.example` | Full env var reference for manual configuration |