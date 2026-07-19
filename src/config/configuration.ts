/**
 * Render.com platform detection.
 * When RENDER_DISK_PATH is set, all persistent data paths are redirected to the
 * mounted persistent disk. This is required because free/pro instances have
 * ephemeral filesystems and data is lost on restart unless persisted to disk.
 */
const RENDER_DISK_PATH = process.env.RENDER_DISK_PATH || '';
const isRenderEnvironment = Boolean(RENDER_DISK_PATH);

/**
 * Auto-detect queue availability:
 * - QUEUE_ENABLED=true  → force enable (requires Redis)
 * - QUEUE_ENABLED=false → force disable (webhooks fall back to synchronous)
 * - unset               → auto-detect from REDIS_ENABLED
 */
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';
const hasExplicitQueueSetting = process.env.QUEUE_ENABLED !== undefined;
const isQueueEnabled = hasExplicitQueueSetting
  ? process.env.QUEUE_ENABLED === 'true'
  : REDIS_ENABLED;

/**
 * Auto-detect if running behind Render's HTTPS proxy to enable secure defaults.
 */
const isBehindProxy =
  process.env.RENDER === 'true' ||
  process.env.RAILS_ENV === 'production' ||
  Boolean(process.env.TRUSTED_PROXIES);

/** Construct a persistent-safe path, preferring Render disk mount. */
function persistPath(relativePath: string): string {
  return RENDER_DISK_PATH ? `${RENDER_DISK_PATH}/${relativePath}` : relativePath;
}

export default () => ({
  port: parseInt(process.env.PORT || '10000', 10),

  /** Bind address. Use 0.0.0.0 for all interfaces (required for Render). */
  host: process.env.HOST || '0.0.0.0',

  // ── Render platform ────────────────────────────────────────────
  render: {
    diskPath: RENDER_DISK_PATH,
    isEnvironment: isRenderEnvironment,
  },

  // ── Redis configuration ────────────────────────────────────────
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  // ── Queue configuration ────────────────────────────────────────
  queue: {
    /** When disabled, webhooks are delivered synchronously. */
    enabled: isQueueEnabled,
  },

  // ── Cache configuration ────────────────────────────────────────
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true' || REDIS_ENABLED,
  },

  // ── Main Database (always SQLite for boot config) ──────────────
  database: {
    type: 'sqlite' as const,
    database: persistPath('./data/main.sqlite'),
    synchronize: true,
    logging: process.env.DATABASE_LOGGING === 'true',
  },

  // ── Data Storage Database (SQLite or PostgreSQL) ───────────────
  dataDatabase: {
    type: process.env.DATABASE_TYPE || 'sqlite',
    database: persistPath(process.env.DATABASE_NAME || './data/openwa.sqlite'),
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    logging: process.env.DATABASE_LOGGING === 'true',
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    ssl: process.env.DATABASE_SSL === 'true',
    sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  },

  // ── WhatsApp engine configuration ──────────────────────────────
  engine: {
    type: process.env.ENGINE_TYPE || 'whatsapp-web.js',
    puppeteer: {
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: (
        process.env.PUPPETEER_ARGS ||
        '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu'
      ).split(','),
    },
    /**
     * Session data (Chrome profiles, auth tokens) MUST be on persistent disk.
     * WhatsApp session state is tied to browser fingerprint — losing it means
     * re-scan QR code every restart. This is the most critical path to persist.
     */
    sessionDataPath: persistPath(process.env.SESSION_DATA_PATH || './data/sessions'),
  },

  // ── Webhook configuration ──────────────────────────────────────
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '5000', 10),
    /** When queue is disabled, webhooks are delivered inline instead of queued. */
    synchronousFallback: !isQueueEnabled,
  },

  // ── API configuration ──────────────────────────────────────────
  api: {
    rateLimit: {
      shortTtl: parseInt(process.env.RATE_LIMIT_SHORT_TTL || '1000', 10),
      shortLimit: parseInt(process.env.RATE_LIMIT_SHORT_LIMIT || '10', 10),
      mediumTtl: parseInt(process.env.RATE_LIMIT_MEDIUM_TTL || '60000', 10),
      mediumLimit: parseInt(process.env.RATE_LIMIT_MEDIUM_LIMIT || '100', 10),
      longTtl: parseInt(process.env.RATE_LIMIT_LONG_TTL || '3600000', 10),
      longLimit: parseInt(process.env.RATE_LIMIT_LONG_LIMIT || '1000', 10),
    },
  },

  // ── Security configuration ─────────────────────────────────────
  security: {
    /**
     * Comma-separated IPs/CIDRs of reverse proxies whose X-Forwarded-For header
     * may be trusted. On Render, the platform proxy always provides valid
     * X-Forwarded-For so we trust the proxy by default.
     * Empty array on local development prevents IP spoofing attacks.
     */
    trustedProxies: isBehindProxy
      ? (process.env.TRUSTED_PROXIES || '0.0.0.0/0')
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
      : [],
    /** Enforce HTTPS redirect when behind Render's HTTPS proxy. */
    enforceHttps: process.env.ENFORCE_HTTPS !== 'false',
    /** Comma-separated list of allowed CORS origins. Empty = same-origin only. */
    corsOrigins: process.env.CORS_ORIGINS || '',
    /** Use CSP report-only mode (violations logged, not blocked). */
    cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',
  },

  // ── WA Auth configuration ──────────────────────────────────────
  waAuth: {
    jwtSecret: process.env.WA_JWT_SECRET || 'wa-automation-jwt-secret-change-me',
  },

  // ── Scraper configuration ──────────────────────────────────────
  scraper: {
    timeout: parseInt(process.env.SCRAPER_REQUEST_TIMEOUT || '30', 10),
    maxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    activeHourStart: parseInt(process.env.SCRAPER_ACTIVE_HOUR_START || '0', 10),
    activeHourEnd: parseInt(process.env.SCRAPER_ACTIVE_HOUR_END || '23', 10),
    activeWeekdays: process.env.SCRAPER_ACTIVE_WEEKDAYS || '0,1,2,3,4,5,6',
    targetUrls: process.env.SCRAPER_TARGET_URLS || '',
  },

  // ── Automation configuration ───────────────────────────────────
  automation: {
    hourlyLimit: parseInt(process.env.AUTOMATION_HOURLY_LIMIT || '500', 10),
    dailyLimit: parseInt(process.env.AUTOMATION_DAILY_LIMIT || '5000', 10),
    batchSize: parseInt(process.env.AUTOMATION_BATCH_SIZE || '50', 10),
    batchCooldown: parseInt(process.env.AUTOMATION_BATCH_COOLDOWN || '900', 10),
    jitterMin: parseFloat(process.env.AUTOMATION_JITTER_MIN || '30'),
    jitterMax: parseFloat(process.env.AUTOMATION_JITTER_MAX || '120'),
    jitterMultiplier: parseFloat(process.env.AUTOMATION_JITTER_MULTIPLIER || '1.5'),
    quietHourStart: parseInt(process.env.AUTOMATION_QUIET_HOUR_START || '1', 10),
    quietHourEnd: parseInt(process.env.AUTOMATION_QUIET_HOUR_END || '7', 10),
    maxRetryAttempts: parseInt(process.env.MESSAGE_MAX_RETRY_ATTEMPTS || '3', 10),
    rateLimitRetryDelay: parseInt(process.env.RATE_LIMIT_RETRY_DELAY || '3600', 10),
    groupMaxConsecutiveFailures: parseInt(process.env.GROUP_MAX_CONSECUTIVE_FAILURES || '10', 10),
    groupUnhealthyRecoveryHours: parseInt(process.env.GROUP_UNHEALTHY_RECOVERY_HOURS || '2', 10),
  },

  // ── Storage configuration ──────────────────────────────────────
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    localPath: persistPath(process.env.STORAGE_LOCAL_PATH || './data/media'),
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  },

  // ── Keep-alive ping (free tier spin-down prevention) ────────────
  keepAlive: {
    /** Enable periodic self-ping to prevent Render free tier from spinning down. */
    enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
    /**
     * Interval in milliseconds. Must be < 15 min (Render's free spin-down threshold).
     * Default 7 min gives a safety margin. Increase to reduce API costs.
     */
    intervalMs: parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '420000', 10),
  },
});