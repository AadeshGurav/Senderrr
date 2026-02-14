@echo off
REM ===================================================================
REM WhatsApp Automation — First-Time Setup (Windows)
REM ===================================================================
REM This script:
REM   1. Creates a Python virtual environment
REM   2. Installs all dependencies
REM   3. Installs the Playwright Chromium browser
REM   4. Starts Redis via Docker Compose
REM   5. Runs Django migrations
REM   6. Copies .env.example to .env (if .env does not exist)
REM
REM Usage:
REM   scripts\setup.bat
REM ===================================================================

REM Navigate to project root
cd /d "%~dp0\.."

echo [INFO]  Project directory: %CD%

REM ---------------------------------------------------------------
REM 1. Python virtual environment
REM ---------------------------------------------------------------
if not exist ".venv" (
    echo [INFO]  Creating Python virtual environment...
    python -m venv .venv
) else (
    echo [INFO]  Virtual environment already exists.
)

call .venv\Scripts\activate.bat
echo [INFO]  Activated virtual environment.

REM ---------------------------------------------------------------
REM 2. Install Python dependencies
REM ---------------------------------------------------------------
echo [INFO]  Installing Python dependencies...
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo [INFO]  Dependencies installed.

REM ---------------------------------------------------------------
REM 3. Install Playwright Chromium
REM ---------------------------------------------------------------
echo [INFO]  Installing Playwright Chromium browser (~250 MB)...
playwright install chromium
echo [INFO]  Playwright Chromium installed.

REM ---------------------------------------------------------------
REM 4. Start Redis via Docker Compose (v2 plugin or v1 standalone)
REM ---------------------------------------------------------------
where docker >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [INFO]  Starting Redis via Docker Compose...
    docker compose version >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        docker compose up -d redis
    ) else (
        where docker-compose >nul 2>nul
        if %ERRORLEVEL% equ 0 (
            docker-compose up -d redis
        ) else (
            echo [WARN]  Docker found but neither 'docker compose' (v2) nor 'docker-compose' (v1) available.
            goto skip_redis
        )
    )
    echo [INFO]  Redis is running.
) else (
    echo [WARN]  Docker not found. Install Docker Desktop for Redis:
    echo [WARN]  https://www.docker.com/products/docker-desktop
)
:skip_redis

REM ---------------------------------------------------------------
REM 5. Environment file
REM ---------------------------------------------------------------
if not exist ".env" (
    copy .env.example .env >nul
    echo [INFO]  Created .env from .env.example.
    echo [WARN]  IMPORTANT: Edit .env and set SCRAPER_TARGET_URL to your website.
) else (
    echo [INFO]  .env already exists — skipping.
)

REM ---------------------------------------------------------------
REM 6. Django migrations
REM ---------------------------------------------------------------
echo [INFO]  Running Django migrations...
python manage.py migrate --no-input
echo [INFO]  Database ready.

REM ---------------------------------------------------------------
REM Done
REM ---------------------------------------------------------------
echo.
echo [INFO]  ==========================================
echo [INFO]    Setup complete!
echo [INFO]  ==========================================
echo.
echo [INFO]  Next steps:
echo [INFO]    1. Edit .env and set SCRAPER_TARGET_URL
echo [INFO]    2. Start all services:  honcho start
echo [INFO]    3. Scan the WhatsApp QR code in the browser window
echo [INFO]    4. Add groups:  python manage.py add_group "Group Name"
echo [INFO]    5. Verify:  python manage.py health_check
echo.

pause
