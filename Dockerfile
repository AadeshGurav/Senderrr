# ============================================================
# WhatsApp Automation — Production Docker Image
# ============================================================
# Multi-stage build:
#   1. builder  — installs deps, compiles .py → .pyc
#   2. runtime  — ships only bytecode, no source (IP protection)
#
# Playwright + Chromium run inside the container with Xvfb
# for headless operation. noVNC is available on port 6080
# for the one-time QR code scan.
# ============================================================

# ------ Stage 1: Builder ------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1

WORKDIR /build

COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

# Copy source code
COPY . /build/src

# Compile all .py → .pyc (placed next to source via -b flag)
# then strip .py source for IP protection.
# Keep manage.py — it's the Django CLI entry point.
RUN python -m compileall -b -q /build/src \
    && find /build/src -name "*.py" ! -name "manage.py" -delete \
    && find /build/src -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# ------ Stage 2: Runtime ------
FROM python:3.12-slim AS runtime

LABEL maintainer="WhatsApp Automation" \
      description="Zero-touch WhatsApp broadcast system" \
      version="1.0.0"

# System deps for Playwright Chromium + Xvfb + noVNC
RUN apt-get update && apt-get install -y --no-install-recommends \
        # Playwright Chromium deps
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
        libgbm1 libpango-1.0-0 libcairo2 libasound2 \
        libatspi2.0-0 libwayland-client0 \
        # Virtual display for headless browser
        xvfb \
        # noVNC for remote QR code scanning
        novnc websockify x11vnc \
        # Fonts for proper rendering
        fonts-liberation fonts-noto-color-emoji \
        # Utilities
        curl procps tini dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Unprivileged user
RUN groupadd -r wabot && useradd -r -g wabot -m -s /bin/bash wabot

# Copy installed Python packages
COPY --from=builder /install /usr/local

# Copy compiled bytecode (no .py source!)
COPY --from=builder /build/src /app

WORKDIR /app

# Install Playwright browsers (as root, then fix permissions)
RUN playwright install chromium \
    && playwright install-deps chromium 2>/dev/null || true

# Create required directories
RUN mkdir -p /app/logs/screenshots /app/staticfiles /data/playwright_session /data/db \
    && chown -R wabot:wabot /app /data

# Copy entrypoint last (changes frequently)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=core.settings \
    DJANGO_DEBUG=False \
    DJANGO_SECRET_KEY=change-me-in-production \
    DATABASE_URL=postgres://wabot:wabot@postgres:5432/wabot \
    CELERY_BROKER_URL=redis://redis:6379/0 \
    CELERY_RESULT_BACKEND=redis://redis:6379/1 \
    PLAYWRIGHT_USER_DATA_DIR=/data/playwright_session \
    PLAYWRIGHT_HEADLESS=True \
    DISPLAY=:99 \
    NOVNC_PORT=6080

EXPOSE 8000 6080

USER wabot

ENTRYPOINT ["tini", "--"]
CMD ["docker-entrypoint.sh", "web"]
