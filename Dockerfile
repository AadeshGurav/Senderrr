# Senderrr - Pure Node.js (No Python, No Django)

# ===== Stage 1: Builder =====
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Build React dashboard
RUN cd dashboard-ui && npm ci && npm run build

# ===== Stage 2: Production =====
FROM node:22-slim

# Install chromium natively — works on both ARM64 (Oracle Cloud Ampere) and amd64
# chromium-sandbox is installed for environments where the sandbox flag is not used.
# PUPPETEER_ARGS uses --no-sandbox so the sandbox binary is not strictly required,
# but having it present avoids permission errors in restricted contexts.
RUN apt-get update && apt-get install -y chromium chromium-sandbox dumb-init && rm -rf /var/lib/apt/lists/*

# Point Puppeteer to system chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard-ui/dist ./dashboard-ui/dist

# Create data directories
RUN mkdir -p ./data/sessions ./data/media

EXPOSE 2785

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:2785/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Startup script cleans Chrome locks then starts app
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]