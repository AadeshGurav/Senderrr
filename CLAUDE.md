# CLAUDE.md — WhatsApp Automation Project Guide

> This file instructs Claude (and any AI assistant) on how to work with this
> codebase. Follow every rule here — no exceptions.

---

## Project Overview

**WhatsApp Automation** is a zero-touch content distribution system that:

1. **Monitors** a target website for new articles (scraper).
2. **Detects** content changes via SHA-256 hash comparison.
3. **Broadcasts** new articles to WhatsApp groups using Playwright browser automation.
4. **Orchestrates** fan-out delivery through Celery task chains with anti-ban measures.

---

## Tech Stack

| Layer            | Technology                        |
|------------------|-----------------------------------|
| Framework        | Django 5.1                        |
| Task Queue       | Celery 5.4 + Redis                |
| Scheduling       | django-celery-beat                |
| Scraping         | requests + BeautifulSoup + lxml   |
| Browser          | Playwright (persistent Chromium)  |
| Database         | SQLite (dev) / PostgreSQL (prod)  |
| Formatting       | Black + Ruff                      |
| Python           | 3.10+                             |

---

## Project Structure

```
WhatsappAutomation/
├── core/                  # Django project config
│   ├── settings.py        # All settings incl. Celery, Playwright, Scraper
│   ├── celery.py          # Celery app factory
│   ├── urls.py
│   └── wsgi.py
├── apps/
│   ├── scraper/           # Content monitoring & change detection
│   │   ├── models.py      # ArticleHash, ScrapedArticle
│   │   ├── services.py    # fetch, hash, detect_and_store_change
│   │   └── tasks.py       # check_for_new_articles (periodic)
│   ├── campaigns/         # Broadcast orchestration
│   │   ├── models.py      # WhatsAppGroup, BroadcastEvent, MessageTask
│   │   ├── services.py    # create_broadcast_event (fan-out)
│   │   └── tasks.py       # fan_out_broadcast, dispatch_message
│   └── automation/        # WhatsApp Web browser automation
│       ├── browser_manager.py  # Singleton Playwright lifecycle
│       ├── services.py    # send_message_to_group + anti-ban logic
│       └── tasks.py       # send_whatsapp_message (standalone)
├── utils/
│   └── hashing.py         # sha256_digest utility
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

- **Tasks** are thin Celery wrappers — they call services and handle retries.
- **Services** contain all business logic — no Django ORM in tasks beyond lookup.
- **Models** are data definitions only — no business logic in model methods.

### App Boundaries

| App          | Owns                            | May Import From        |
|--------------|---------------------------------|------------------------|
| `scraper`    | Content fetching, hashing       | `utils`                |
| `campaigns`  | Broadcast orchestration         | `scraper.models`       |
| `automation` | Browser control, message send   | Nothing (leaf node)    |

- Import direction flows **downward**: `scraper.tasks` → `campaigns.tasks` (via delayed call).
- Cross-app task invocation uses `.delay()` — never direct function calls across app boundaries in tasks.

### Singleton Pattern

`PlaywrightBrowserManager` is a **thread-safe Singleton** with crash recovery.
Never instantiate a second browser. Always use:

```python
manager = PlaywrightBrowserManager()
page = manager.get_page()
```

---

## Coding Standards

### Python Style

- **Formatter**: Black (88-char line length)
- **Linter**: Ruff
- **Python version**: 3.10+ (use `X | Y` union syntax, not `Union[X, Y]`)
- **Quotes**: Double quotes everywhere
- **Indentation**: 4 spaces
- **Imports**: Sorted by Black/Ruff automatically

### Type Hints

- Every function signature must have type hints for arguments and return.
- Use `from __future__ import annotations` at the top of every module.
- Use `TYPE_CHECKING` blocks for imports only needed by type checkers:

```python
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page
```

### Docstrings

- Every module: one-line docstring describing its purpose.
- Every public function/class: Google-style docstring with description.
- Include `Args`, `Returns`, `Raises` sections when non-obvious.

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

| Element          | Convention            | Example                        |
|------------------|-----------------------|--------------------------------|
| Module           | `snake_case.py`       | `browser_manager.py`           |
| Class            | `PascalCase`          | `PlaywrightBrowserManager`     |
| Function         | `snake_case`          | `detect_and_store_change`      |
| Private function | `_leading_underscore` | `_extract_visible_text`        |
| Constant         | `UPPER_SNAKE_CASE`    | `WHATSAPP_WEB_URL`             |
| Task name        | Dotted module path    | `apps.scraper.tasks.check_...` |

Function names must use **verb-noun** patterns: `fetch_page_content`, `create_broadcast_event`, `send_message_to_group`.

### Comments

- **No parroting** — never restate what code already says.
- **Comment intent** — explain *why*, not *what*.
- Use inline `# noqa: XXXX` only when suppression is justified.

---

## File Limits

- **Hard limit: 300 lines per file.**
- If approaching this limit, split into focused submodules.
- Each file must own **one area of concern**.

---

## Celery Task Conventions

All tasks must:

1. Use `@shared_task(bind=True, ...)` with explicit `name`, `max_retries`, `acks_late=True`.
2. Accept only **serialisable** arguments (integers, strings) — never ORM objects.
3. Return a human-readable status string.
4. Handle exceptions with `self.retry(exc=exc)`.
5. Use **lazy imports** for cross-app dependencies to avoid circular imports:

```python
def _trigger_broadcast(article_pk: int) -> None:
    from apps.campaigns.tasks import fan_out_broadcast
    fan_out_broadcast.delay(article_pk)
```

---

## Django Model Conventions

- Every model must define `class Meta` with `verbose_name`, `verbose_name_plural`, and `ordering`.
- Every model must have a `__str__` method returning a meaningful label.
- Use `db_index=True` on fields used in lookups.
- Use `TextChoices` for status fields.
- Prefer `auto_now_add` / `auto_now` for timestamps.

---

## Anti-Ban & Safety

This system automates a real messaging platform. Respect these constraints:

- **Single-worker concurrency** (`CELERY_WORKER_CONCURRENCY = 1`): browser is not thread-safe.
- **Randomised jitter** between sends (30–120s default).
- **Human-like typing** with per-character random delays.
- **Persistent browser session** to avoid repeated QR scans.
- **Worker recycling** (`MAX_TASKS_PER_CHILD = 50`) to prevent memory leaks.

Never bypass or reduce these safety measures without explicit approval.

---

## Configuration

All runtime configuration lives in `core/settings.py` and is overridable via environment variables:

| Variable                      | Purpose                          |
|-------------------------------|----------------------------------|
| `DJANGO_SECRET_KEY`           | Django secret key                |
| `CELERY_BROKER_URL`           | Redis broker address             |
| `SCRAPER_TARGET_URL`          | URL to monitor for changes       |
| `SCRAPER_REQUEST_TIMEOUT`     | HTTP timeout (seconds)           |
| `PLAYWRIGHT_USER_DATA_DIR`    | Browser session persistence path |
| `PLAYWRIGHT_HEADLESS`         | Run browser headless (bool)      |
| `AUTOMATION_JITTER_MIN/MAX`   | Anti-ban delay bounds            |

Never hardcode values that belong in settings.

---

## Common Commands

```bash
# Development server
python manage.py runserver

# Celery worker (single concurrency, as designed)
celery -A core worker -l info --concurrency=1

# Celery beat scheduler
celery -A core beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler

# Migrations
python manage.py makemigrations
python manage.py migrate

# Format & lint
black .
ruff check . --fix
```

---

## What NOT To Do

- ❌ Put business logic in Celery tasks — tasks are thin wrappers.
- ❌ Pass ORM objects to `.delay()` — pass primary keys.
- ❌ Import across app boundaries at module level in tasks — use lazy imports.
- ❌ Create multiple Playwright browser instances.
- ❌ Reduce anti-ban delays or remove jitter.
- ❌ Write files over 300 lines.
- ❌ Skip type hints or docstrings on public APIs.
- ❌ Use `Union[X, Y]` — use `X | Y` syntax.
- ❌ Add useless comments that restate the code.
