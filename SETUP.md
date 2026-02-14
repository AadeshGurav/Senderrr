# Setup Guide — WhatsApp Automation

> Get from fresh clone to a running system in 5 minutes.

---

## Prerequisites

You need these installed on your computer before starting:

| What | Why | How to Install |
|---|---|---|
| **Python 3.10+** | Runs the application | [python.org/downloads](https://www.python.org/downloads/) |
| **Docker Desktop** | Runs the Redis message queue | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |

> **Check your Python version**: Open a terminal and run `python3 --version`
> (or `python --version` on Windows). You need 3.10 or higher.

---

## Quick Start

### Step 1 — Run the setup script

**Mac / Linux:**

```bash
bash scripts/setup.sh
```

**Windows:**

```
scripts\setup.bat
```

This script automatically:
- Creates a virtual environment
- Installs all Python packages
- Installs the Chromium browser for WhatsApp
- Starts Redis in Docker
- Prepares the database
- Creates your `.env` configuration file

### Step 2 — Configure your target URL

Open the `.env` file in any text editor and change this line:

```
SCRAPER_TARGET_URL=https://example.com/articles
```

Replace `https://example.com/articles` with the actual URL you want to
monitor for new content.

### Step 3 — Start the system

```bash
# Mac / Linux
source .venv/bin/activate
honcho start

# Windows
.venv\Scripts\activate
honcho start
```

You will see colored output from three services running together.

### Step 4 — Scan the WhatsApp QR code

A Chromium browser window will open showing WhatsApp Web.

1. Open WhatsApp on your phone.
2. Go to **Settings > Linked Devices > Link a Device**.
3. Scan the QR code shown in the browser.
4. Wait until the chat list loads.

> You only need to do this once. The login session is saved automatically.

### Step 5 — Add your WhatsApp groups

Open a **new terminal** (keep the first one running) and activate the
virtual environment:

```bash
# Mac / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

Then add each group you want to broadcast to:

```bash
python manage.py add_group "My Group Name"
python manage.py add_group "Another Group"
```

> The group name must match **exactly** how it appears in WhatsApp.

To see all configured groups:

```bash
python manage.py add_group --list
```

### Step 6 — Verify everything works

```bash
python manage.py health_check
```

All six checks should show **OK**. If any fail, the output tells you
exactly what to fix.

---

## Daily Usage

Once set up, you only need to:

1. Make sure Docker Desktop is running (for Redis).
2. Start the system:

```bash
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
honcho start
```

The system will automatically check for new articles every 5 minutes
and broadcast them to all your active groups.

---

## Common Tasks

| Task | Command |
|---|---|
| Start the system | `honcho start` |
| Stop the system | Press `Ctrl+C` in the terminal |
| Add a group | `python manage.py add_group "Name"` |
| List groups | `python manage.py add_group --list` |
| Deactivate a group | `python manage.py add_group --deactivate "Name"` |
| Re-activate a group | `python manage.py add_group --activate "Name"` |
| Health check | `python manage.py health_check` |
| Open admin panel | Visit http://localhost:8000/admin/ |
| Stop Redis | `docker compose down` |

---

## Troubleshooting

### "No Celery workers responded"

The worker has not started yet. Make sure `honcho start` is running in
another terminal.

### "Redis did not respond to PING"

Redis is not running. Start it with:

```bash
docker compose up -d
```

### "Playwright Chromium not ready"

Run the Playwright installer:

```bash
playwright install chromium
```

### "SCRAPER_TARGET_URL is still the default placeholder"

Edit your `.env` file and set `SCRAPER_TARGET_URL` to the actual URL
you want to monitor.

### WhatsApp QR code not appearing

Delete the saved session and restart:

```bash
rm -rf .playwright_session   # Mac/Linux
rmdir /s /q .playwright_session   # Windows
honcho start
```

---

## Environment Variables

All configuration is in the `.env` file. Only `SCRAPER_TARGET_URL` is
required — everything else has safe defaults.

See `.env.example` for the full list with descriptions.
