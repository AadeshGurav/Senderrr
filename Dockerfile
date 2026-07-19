# ─── Stage 1: Builder ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Build React dashboard (served as static files by NestJS)
RUN cd dashboard-ui && npm ci && npm run build

# ─── Stage 2: Production Runtime ─────────────────────────────────
FROM node:22-slim

# Install Chromium for Puppeteer/WhatsApp-web.js
# --no-install-recommends keeps the image lean
# arm64 arch covers Apple Silicon dev machines; amd64 covers Render's x86_64 servers
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Point Puppeteer to system Chromium (installed via apt, not bundled)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production-only dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard-ui/dist ./dashboard-ui/dist

# Create data directory structure (symlink to persistent disk path if set)
# RENDER_DISK_PATH is set by Render when a persistent disk is attached.
# Without it, data lives on the ephemeral container filesystem.
RUN mkdir -p ./data/sessions ./data/media

EXPOSE 10000

# Health check: Render uses PORT env var (default 10000 on Render)
# /api/health/live is the root-level liveness probe that bypasses the /api prefix
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT:-10000}/api/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]