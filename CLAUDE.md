# CLAUDE.md — WhatsApp Automation Project Guide

> This file instructs Claude (and any AI assistant) on how to work with this
> codebase. Follow every rule here — no exceptions.

---

## Project Overview

**WhatsApp Automation** is a zero-touch content distribution system that:

1.  **Monitors** a target website for new articles (scraper).
2.  **Detects** content changes via SHA-256 hash comparison.
3.  **Broadcasts** new articles to WhatsApp groups using Playwright browser automation.
4.  **Orchestrates** fan-out delivery across **multiple parallel workers** with anti-ban measures.
5.  **Visualizes** system status and manages WhatsApp groups via a Django **Dashboard**.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Framework | Django 5.1 |
| Task Queue | Celery 5.4 + Redis |
| Scheduling | django-celery-beat |
| Scraping | requests + BeautifulSoup + lxml |
| Browser | Playwright (persistent Chromium) |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Dashboard | Django Templates + Admin |
| Formatting | Black + Ruff |
| Python | 3.10+ |

---

## Project Structure

```
WhatsappAutomation/
├── core/                  # Django project config
│   ├── settings.py        # All settings incl. Celery, Playwright, Scraper
│   ├── celery.py          # Celery app factory
│   └── urls.py
├── apps/
│   ├── scraper/           # Content monitoring & change detection
│   │   ├── models.py      # ArticleHash, ScrapedArticle
│   │   ├── services.py    # fetch, hash, detect_and_store_change
│   │   └── tasks.py       # check_for_new_articles (periodic)
│   ├── campaigns/         # Broadcast orchestration
│   │   ├── models.py      # WhatsAppGroup, BroadcastEvent, MessageTask
│   │   ├── services.py    # create_broadcast_event (fan-out)
│   │   └── tasks.py       # fan_out_broadcast, dispatch_message
│   ├── automation/        # WhatsApp Web browser automation
│   │   ├── browser_manager.py  # Singleton Playwright lifecycle
│   │   ├── services.py    # send_message_to_group + anti-ban logic
│   │   └── tasks.py       # send_whatsapp_message (standalone)
│   └── dashboard/         # System status & management UI
│       ├── views/         # Dashboard views
│       ├── templates/     # UI templates
│       └── forms.py       # Management forms
├── utils/
│   └── hashing.py         # sha256_digest utility
├── scripts/               # Utility scripts (setup, doctor)
│   ├── doctor.py
│   └── setup.sh
├── Makefile               # Convenience commands
├── manage.py
└── requirements.txt
```

---

## Architecture Rules

### Layered Responsibility

```
Tasks  →  Services  →  Models / External I/O
 (thin)    (logic)      (persistence)
```

-   **Tasks** are thin Celery wrappers — they call services and handle retries.
-   **Services** contain all business logic — no Django ORM in tasks beyond lookup.
-   **Models** are data definitions only — no business logic in model methods.

### App Boundaries

| App | Owns | May Import From |
| :--- | :--- | :--- |
| `scraper` | Content fetching, hashing | `utils` |
| `campaigns` | Broadcast orchestration | `scraper.models` |
| `automation` | Browser control, message send | Nothing (leaf node) |
| `dashboard` | UI, Visualization, Stats | All items |

-   Import direction flows **downward**: `scraper` → `campaigns` → `automation`.
-   `dashboard` is a consumer of all other apps for visualization.
-   Cross-app task invocation uses `.delay()` — never direct function calls across app boundaries in tasks.

### Singleton Pattern

`PlaywrightBrowserManager` is a **thread-safe Singleton** *per process*, with crash recovery.
Never instantiate a second browser. Always use:

```python
manager = PlaywrightBrowserManager()
page = manager.get_page()
```

---

## Coding Standards

### Python Style

-   **Formatter**: Black (88-char line length)
-   **Linter**: Ruff
-   **Python version**: 3.10+ (use `X | Y` union syntax, not `Union[X, Y]`)
-   **Quotes**: Double quotes everywhere
-   **Indentation**: 4 spaces
-   **Imports**: Sorted by Black/Ruff automatically

### Type Hints

-   Every function signature must have type hints for arguments and return.
-   Use `from __future__ import annotations` at the top of every module.
-   Use `TYPE_CHECKING` blocks for imports only needed by type checkers:

```python
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page
```

### Docstrings

-   Every module: one-line docstring describing its purpose.
-   Every public function/class: Google-style docstring with description.
-   Include `Args`, `Returns`, `Raises` sections when non-obvious.

```python
"""Scraper services — fetch, hash, and detect content changes."""

def fetch_page_content(url: str) -> str:
    """Fetch a URL and return its visible text content.

    Retries up to ``SCRAPER_MAX_RETRIES`` on transient failures.

    Raises:
        requests.RequestException: After all retries are exhausted.
    """
```

### Naming Conventions

| Element | Convention | Example |
| :--- | :--- | :--- |
| Module | `snake_case.py` | `browser_manager.py` |
| Class | `PascalCase` | `PlaywrightBrowserManager` |
| Function | `snake_case` | `detect_and_store_change` |
| Private function | `_leading_underscore` | `_extract_visible_text` |
| Constant | `UPPER_SNAKE_CASE` | `WHATSAPP_WEB_URL` |
| Task name | Dotted module path | `apps.scraper.tasks.check_...` |

Function names must use **verb-noun** patterns: `fetch_page_content`, `create_broadcast_event`, `send_message_to_group`.

### Comments

-   **No parroting** — never restate what code already says.
-   **Comment intent** — explain *why*, not *what*.
-   Use inline `# noqa: XXXX` only when suppression is justified.

---

## File Limits

-   **Hard limit: 300 lines per file.**
-   If approaching this limit, split into focused submodules.
-   Each file must own **one area of concern**.

---

## Celery Task Conventions

All tasks must:

1.  Use `@shared_task(bind=True, ...)` with explicit `name`, `max_retries`, `acks_late=True`.
2.  Accept only **serialisable** arguments (integers, strings) — never ORM objects.
3.  Return a human-readable status string.
4.  Handle exceptions with `self.retry(exc=exc)` (implementing exponential backoff where appropriate).
5.  Use **lazy imports** for cross-app dependencies to avoid circular imports.

---

## Django Model Conventions

-   Every model must define `class Meta` with `verbose_name`, `verbose_name_plural`, and `ordering`.
-   Every model must have a `__str__` method returning a meaningful label.
-   Use `db_index=True` on fields used in lookups.
-   Use `TextChoices` for status fields.
-   Prefer `auto_now_add` / `auto_now` for timestamps.

---

## Anti-Ban & Safety

This system automates a real messaging platform. Respect these constraints:

-   **Parallel Workers**: Scale via **multiple worker processes** (`AUTOMATION_WORKER_COUNT`), not threads.
-   **Single-Threaded Browser**: `CELERY_WORKER_CONCURRENCY = 1` per worker process.
-   **Randomised Jitter**: Variable delays between sends (30–120s default).
-   **Human-like Typing**: Per-character random delays.
-   **Persistent Sessions**: Avoid repeated QR scans by persisting `user_data_dir`.
-   **Worker Recycling**: `MAX_TASKS_PER_CHILD = 50` to prevent memory leaks.
-   **Hourly/Daily Limits**: Strictly enforced via `AUTOMATION_HOURLY/DAILY_LIMIT`.

Never bypass or reduce these safety measures without explicit approval.

---

## Configuration

All runtime configuration lives in `core/settings.py`, overridable via env vars.

| Variable | Purpose |
| :--- | :--- |
| `DJANGO_SECRET_KEY` | Django secret key |
| `CELERY_BROKER_URL` | Redis broker address |
| `SCRAPER_TARGET_URL` | URL to monitor for changes |
| `SCRAPER_REQUEST_TIMEOUT` | HTTP timeout (seconds) |
| `PLAYWRIGHT_USER_DATA_DIR` | Browser session persistence path |
| `PLAYWRIGHT_HEADLESS` | Run browser headless (bool) |
| `AUTOMATION_JITTER_MIN/MAX` | Anti-ban delay bounds |
| `AUTOMATION_WORKER_COUNT` | **Parallel sending windows** |
| `AUTOMATION_HOURLY_LIMIT` | Anti-ban rate limit |

---

## Common Commands

The project uses `make` for common operations:

```bash
# Setup & Maintenance
make setup      # First-time setup
make doctor     # Diagnose/auto-repair environment
make clean      # Clean cache files

# Runtime
make start      # Start services (Django + Celery + Beat)
make stop       # Stop containers
make health     # Run health checks

# Development
make migrate    # Run migrations
make shell      # Open Django shell
make groups     # List/Manage WhatsApp groups
```

For manual execution:

```bash
# Format & lint
black .
ruff check . --fix
```

---

## Debugging

VS Code `launch.json` is configured to mimic `make start` with full debugger attachment.

### Configurations
-   **Django Web Server**: Runs `manage.py runserver` (auto-reload enabled).
-   **Celery Worker 0**: Runs a single worker process (solo pool) handling `wa-worker-0` and `celery` queues.
-   **Celery Beat**: Runs the periodic task scheduler.
-   **Full Stack (Django + Celery)**: Launches all three simultaneously.

### How to Debug
1.  Go to **Run and Debug** sidebar.
2.  Select **Full Stack (Django + Celery)**.
3.  Press `F5` or click Play.
4.  Set breakpoints in Django views, Celery tasks, or Services.

> **Note**: Worker 0 is configured with `pool=solo` to ensure breakpoints work reliably.

---

## What NOT To Do

-   ❌ Put business logic in Celery tasks — tasks are thin wrappers.
-   ❌ Pass ORM objects to `.delay()` — pass primary keys.
-   ❌ Import across app boundaries at module level in tasks — use lazy imports.
-   ❌ Create multiple Playwright browser instances *within a single worker*.
-   ❌ Reduce anti-ban delays or remove jitter.
-   ❌ Write files over 300 lines.
-   ❌ Skip type hints or docstrings on public APIs.
-   ❌ Use `Union[X, Y]` — use `X | Y` syntax.
-   ❌ Add useless comments that restate the code.
