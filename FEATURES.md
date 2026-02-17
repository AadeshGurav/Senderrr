# WhatsApp Automation — Features

> Zero-touch content distribution system that monitors websites, detects changes, and broadcasts updates to WhatsApp groups with human-like behaviour.

---

## Core Pipeline

### 1. Automated Content Monitoring
- Polls a configurable target URL every 5 minutes via Celery Beat
- Detects content changes using SHA-256 hash comparison against the last known state
- Stores every detected change as a `ScrapedArticle` snapshot with title, body, URL, and hash
- Supports site-specific parsers (ships with a Hacker News demo parser) with graceful fallback to generic title extraction

### 2. Broadcast Fan-Out
- On content change, automatically creates a `BroadcastEvent` and bulk-creates one `MessageTask` per active WhatsApp group
- Round-robin distribution of tasks across parallel workers with configurable stagger delays
- Batch-based scheduling: groups of 50 tasks with 15-minute cooldown between batches
- Atomic progress tracking: sent/failed counters updated via `F()` expressions, broadcast auto-completes when all tasks finish

### 3. WhatsApp Web Browser Automation
- Persistent Chromium sessions via Playwright — QR code scan only needed once per worker
- Human-like message delivery: slow character-by-character typing (0.03–0.12s per character), newlines via Shift+Enter
- Multi-strategy DOM interaction with 3–7 fallback selectors per UI element (search box, compose box, send button) for resilience against WhatsApp Web DOM changes
- Compose box detection: CSS selectors → role-based locator → contenteditable fallback
- Automatic session recovery: browser crash detection via JS evaluation, auto-relaunch on failure

---

## Anti-Ban Safety System (6 Layers)

### Layer 1 — Rate Limiting
- Configurable hourly limit (default: 30 msgs/hr) and daily limit (default: 150 msgs/day)
- Redis TTL-based counters that auto-expire — no cleanup needed
- Quiet hours enforcement in the project's local timezone (default: 1–7 AM)

### Layer 2 — Progressive Jitter
- Random delay between sends (default: 30–120 seconds)
- Jitter increases exponentially as more messages are sent: `base_jitter * (1.5 ^ batches_completed)`
- Makes high-volume sends appear natural over time

### Layer 3 — Human-Like Typing
- Per-character random delays when typing messages and search queries
- Newlines sent as Shift+Enter (not Enter, which would send prematurely)

### Layer 4 — Concurrent Send Semaphore
- Redis-based counting semaphore caps how many workers can be in the "type + click send" phase simultaneously
- Default: max 2 concurrent sends, even with 4 workers
- 5-minute TTL safety net prevents deadlocks if a worker crashes while holding a slot

### Layer 5 — Batch Cooldown
- Tasks grouped into batches of 50 with 15-minute pauses between batches
- Workers stagger their start times (default: 45 seconds apart)

### Layer 6 — Session Health Checks
- Pre-send verification detects QR codes (expired session), CAPTCHAs, temporary bans, and "unusual activity" warnings
- Diagnostic screenshots saved to `logs/screenshots/` on failure
- DOM structure dump for debugging when compose box can't be found

---

## Multi-Worker Parallel Sending

### Architecture
- 1–4 parallel Celery workers, each with its own Playwright browser and session directory
- Same WhatsApp phone number across all workers via WhatsApp's Linked Devices feature
- Worker 0 handles general tasks (scraper, fan-out) plus sends; workers 1–3 handle sends only
- Procfile auto-generated based on worker count setting

### Session Isolation
- Worker 0: `.playwright_session/`
- Worker N: `.playwright_session_worker_N/`
- Each worker process gets its own Singleton browser manager bound to its session via `WA_WORKER_ID` environment variable

### Task Distribution
- Interleaved round-robin: tasks distributed 0, 1, 2, 3, 0, 1, 2, ... across worker queues
- Each worker has a dedicated Celery queue (`wa-worker-0`, `wa-worker-1`, etc.)
- Per-worker stagger offset prevents burst starts

### Per-Worker Tracking
- Redis counters track messages/hour per worker for dashboard display
- `MessageTask.worker_id` field records which worker handled each send

---

## Web Dashboard

### Overview Page
- Stats grid: active/total groups, total broadcasts, per-worker connection status
- WhatsApp group management: add, activate/deactivate, delete — all inline via htmx
- Recent broadcasts table with status badges (colour-coded), progress bars (sent/total + failed), and age
- Auto-refreshing: worker status and broadcast list poll every 30 seconds via htmx

### Group Management
- Add groups with display name and JID (search identifier)
- Toggle active/inactive status (inactive groups excluded from future broadcasts)
- Delete groups with single click
- CLI alternative: `python manage.py add_group` with `--list`, `--activate`, `--deactivate` flags

### Settings Page (12 Editable Settings)

| Section | Settings |
|---------|----------|
| Scraper | Target URL, request timeout, max retries |
| Anti-Ban Delays | Jitter min/max |
| Rate Limits | Hourly limit, daily limit, quiet hours start/end |
| Parallel Workers | Worker count (1–4), worker stagger, max concurrent sends |

- Changes take effect immediately (no restart needed) for most settings via DB-first config lookup
- Worker count changes require a restart (noted in the UI)

### Worker Status Panel
- Per-worker connection badge: Connected / Disconnected / Unknown
- Per-worker messages/hour counter from Redis
- Stale data detection: status marked "Unknown" if last check was >10 minutes ago

### Authentication
- Django auth with login/logout
- Superuser auto-creation on first `make start` if none exists
- Password validation: minimum 8 characters with confirmation

---

## Runtime Configuration System

- **DB-first lookup**: `utils.config.get_config(key, cast)` checks `RuntimeSetting` table first, falls back to `django.conf.settings`
- **No restart needed**: dashboard saves to DB, services read from DB on every call
- **Type casting**: supports `int`, `float`, `str` conversions from stored string values
- **Environment variable override**: all settings readable from env vars (highest precedence at startup)

---

## Management Commands

| Command | Purpose |
|---------|---------|
| `python manage.py start` | Unified entry point: superuser check → WhatsApp session check (all workers) → Procfile generation → launch all services |
| `python manage.py login` | QR code login for all workers, or `--worker-id N` for a specific worker |
| `python manage.py generate_procfile` | Regenerate Procfile based on current worker count |
| `python manage.py health_check` | System health check: database, Redis, Celery worker, Playwright, target URL, groups |
| `python manage.py add_group "Name"` | Add/list/activate/deactivate WhatsApp groups from CLI |

---

## DevOps & Tooling

### One-Command Setup
- `make setup` runs `scripts/setup.sh`: creates venv, installs dependencies, installs Playwright Chromium, starts Redis (Docker → apt → Homebrew fallback), copies `.env`, runs migrations

### Doctor Script
- `make doctor` runs 8 diagnostic checks with auto-repair:
  - Python version, venv, pip packages, Playwright browser, Docker, Redis, env file, migrations
- `--check` flag for dry-run mode
- Colour output with Windows Terminal detection

### Process Management
- Honcho Procfile runner manages all processes (Django, workers, beat)
- `make start` kills stale processes from previous runs before launching
- Worker recycling: `--max-tasks-per-child=50` prevents memory leaks in long-running browser processes

### Makefile Targets
| Target | Action |
|--------|--------|
| `make setup` | First-time setup |
| `make doctor` | Diagnose and repair environment |
| `make start` | Pre-flight checks + launch everything |
| `make stop` | Stop Docker services |
| `make health` | Run health checks |
| `make groups` | List WhatsApp groups |
| `make migrate` | Run Django migrations |
| `make shell` | Django interactive shell |
| `make clean` | Remove `__pycache__` and `.pyc` files |

---

## Infrastructure

| Component | Technology | Role |
|-----------|-----------|------|
| Web Framework | Django 5.1 | HTTP server, ORM, admin, auth |
| Task Queue | Celery 5.4 | Async task execution, retries |
| Message Broker | Redis 7 | Celery broker, rate limit counters, semaphore |
| Scheduler | django-celery-beat | Periodic task scheduling from DB |
| Scraping | requests + BeautifulSoup + lxml | HTML fetching and text extraction |
| Browser | Playwright (Chromium) | WhatsApp Web automation |
| Database | SQLite (dev) / PostgreSQL (prod) | Persistent storage |
| Frontend | Pico CSS + htmx | Dashboard UI without a build step |
| Process Manager | Honcho | Multi-process Procfile runner |
| Containerisation | Docker Compose | Redis only (browser needs host display) |

---

## Data Flow

```
Celery Beat (every 5 min)
       │
       ▼
check_for_new_articles
       │
       ▼
detect_and_store_change ── fetch HTML ── extract text ── SHA-256 hash
       │                                                      │
       │                                         compare with ArticleHash
       │                                                      │
       ▼  (if changed)                                        ▼
fan_out_broadcast                                  update ArticleHash
       │
       ▼
create_broadcast_event ── BroadcastEvent + N MessageTasks
       │
       ▼
dispatch_message × N (round-robin across workers)
       │
       ▼
send_message_to_group
   ├── check_rate_limit (hourly, daily, quiet hours)
   ├── apply_anti_ban_jitter (progressive)
   ├── get browser page (singleton, crash recovery)
   ├── ensure WhatsApp Web loaded
   ├── check session health (QR, CAPTCHA, bans)
   ├── search and open group chat
   ├── acquire send semaphore slot
   ├── type message (human-like)
   ├── click send
   ├── release semaphore
   └── increment rate counters (global + per-worker)
```

---

## Security & Reliability

- **Persistent sessions**: QR code scan stored in `user_data_dir`, survives restarts
- **Crash recovery**: browser manager detects dead contexts via JS evaluation and auto-relaunches
- **Graceful retries**: Celery tasks retry with configurable delays (60–180s) and max retry limits
- **Atomic counters**: Redis INCR + pipeline for race-free rate limiting
- **Stale process cleanup**: `start` command kills orphaned Django/Celery/Chrome processes before launching
- **Lock file removal**: removes Chrome's `SingletonLock`/`SingletonSocket`/`SingletonCookie` files to prevent "profile in use" errors
- **Anti-detection**: `--disable-blink-features=AutomationControlled` flag hides Playwright from bot detection
- **Worker recycling**: `--max-tasks-per-child=50` restarts workers periodically to prevent memory leaks
