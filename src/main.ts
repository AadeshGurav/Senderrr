import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ShutdownService } from './common/services/shutdown.service';
import { BullBoardAuthMiddleware } from './common/security/bull-board-auth.middleware';
import { AuthService } from './modules/auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

const generatedEnvPath = path.resolve(process.cwd(), 'data', '.env.generated');
const userEnvPath = path.resolve(process.cwd(), '.env');

const dataDir = path.dirname(generatedEnvPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load env files in priority order (later sources do NOT override earlier ones)
// 1. Process env (highest — Docker, shell, systemd)
// 2. .env (project-level overrides)
// 3. data/.env.generated (Dashboard-saved config)
if (fs.existsSync(userEnvPath)) {
  dotenv.config({ path: userEnvPath, override: false });
}
if (fs.existsSync(generatedEnvPath)) {
  dotenv.config({ path: generatedEnvPath, override: false });
} else {
  const minimalConfig = [
    '# OpenWA Configuration',
    '# Generated automatically on first run',
    'DATABASE_TYPE=sqlite',
    'POSTGRES_BUILTIN=false',
    'REDIS_ENABLED=false',
    'REDIS_BUILTIN=false',
    'QUEUE_ENABLED=false',
    'STORAGE_TYPE=local',
    'MINIO_BUILTIN=false',
    'STORAGE_PATH=./data/media',
  ].join('\n');
  fs.writeFileSync(generatedEnvPath, minimalConfig);
  dotenv.config({ path: generatedEnvPath, override: false });
}

/**
 * Remove stale Chrome/Puppeteer lock files from session data directories.
 * On crash/kill, Chrome leaves SingletonLock/SingletonCookie/SingletonSocket
 * files that block the next launch with "lockfile" errors.
 */
function cleanChromeLocks(sessionDataPath: string): void {
  try {
    if (!fs.existsSync(sessionDataPath)) return;
    const entries = fs.readdirSync(sessionDataPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(sessionDataPath, entry.name);
      for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Singleton']) {
        const lockPath = path.join(dir, lock);
        try {
          if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
        } catch { /* race — ignore */ }
      }
    }
    // Kill orphaned Chrome processes from previous run
    try {
      require('child_process').execSync(
        'pkill -f "chrome.*--disable-setuid-sandbox" 2>/dev/null || true',
      );
    } catch { /* pkill not available — ignore */ }
  } catch { /* directory might not exist yet */ }
}

/**
 * HTTPS redirect middleware for Render's HTTPS-only platform.
 * Redirects HTTP requests to HTTPS when behind the Render proxy.
 * Only active when ENFORCE_HTTPS is not explicitly disabled.
 */
function httpsRedirectMiddleware(configService: ConfigService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const enforceHttps = configService.get<boolean>('security.enforceHttps', true);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (enforceHttps && !isHttps && process.env.NODE_ENV === 'production') {
      const url = `https://${req.hostname}${req.originalUrl}`;
      return res.redirect(301, url);
    }
    next();
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // ── Bootstrap phase ────────────────────────────────────────────
  const sessionDataPath = path.resolve(
    process.cwd(),
    configService.get<string>('engine.sessionDataPath') || './data/sessions',
  );
  cleanChromeLocks(sessionDataPath);

  // ── Graceful shutdown ──────────────────────────────────────────
  app.enableShutdownHooks();
  const shutdownService = app.get(ShutdownService);
  shutdownService.setShutdownCallback(async () => {
    for (const token of ['mainDataSource', 'dataDataSource']) {
      try {
        const ds = app.get(token);
        if (ds?.isInitialized) await ds.destroy();
      } catch { /* DataSource not available — skip */ }
    }
    await app.close();
  });

  // ── Security headers ───────────────────────────────────────────
  const isProduction = process.env.NODE_ENV === 'production';
  const cspReportOnly = configService.get<boolean>('security.cspReportOnly', false);

  app.use(
    helmet({
      contentSecurityPolicy: cspReportOnly
        ? undefined
        : {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: isProduction ? [] : null,
            },
          },
      crossOriginEmbedderPolicy: false,
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );

  // ── HTTPS redirect (Render proxy) ─────────────────────────────
  app.use(httpsRedirectMiddleware(configService));

  // ── Request ID for tracing ─────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) ||
      require('crypto').randomUUID();
    res.setHeader('X-Request-ID', requestId);
    (req as any).requestId = requestId;
    next();
  });

  // ── CORS ───────────────────────────────────────────────────────
  const corsOriginsStr = configService.get<string>('security.corsOrigins') || '';
  const allowedOrigins = corsOriginsStr
    ? corsOriginsStr.split(',').map(o => o.trim()).filter(Boolean)
    : [];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // '*' or matching origin
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS policy'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 'X-API-Key', 'Authorization', 'X-Request-ID',
      'X-Forwarded-For', 'X-Real-IP', 'User-Agent',
    ],
    exposedHeaders: [
      'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining',
      'X-RateLimit-Reset', 'X-RateLimit-Window',
    ],
    maxAge: 86400,
  });

  // ── Global prefix ──────────────────────────────────────────────
  app.setGlobalPrefix('api', {
    exclude: ['health/live'], // liveness must be at root for Render health checks
  });

  // ── Validation pipe ────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: isProduction,
    }),
  );

  // ── Swagger docs ───────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Senderrr API')
    .setDescription('Senderrr — WhatsApp Broadcasting System')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'X-API-Key')
    .addTag('sessions', 'WhatsApp session management')
    .addTag('messages', 'Send and manage messages')
    .addTag('webhooks', 'Webhook event delivery')
    .addTag('health', 'Health check and keep-alive endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // ── Bull Board protection ──────────────────────────────────────
  if (configService.get<boolean>('queue.enabled')) {
    const bullBoardAuth = new BullBoardAuthMiddleware(app.get(AuthService));
    app.use('/api/admin/queues', (req: Request, res: Response, next: NextFunction) => {
      void bullBoardAuth.use(req, res, next);
    });
  }

  // ── Serve React dashboard ──────────────────────────────────────
  const dashboardPath = path.resolve(process.cwd(), 'dashboard-ui', 'dist');
  if (fs.existsSync(dashboardPath)) {
    app.useStaticAssets(dashboardPath, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      const indexPath = path.join(dashboardPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
    console.log('[Bootstrap] Serving React dashboard from:', dashboardPath);
  } else {
    console.log('[Bootstrap] Dashboard not built — API-only mode. Run: cd dashboard-ui && npm run build');
  }

  // ── Keep-alive ping for free tier spin-down prevention ─────────
  const keepAliveEnabled = configService.get<boolean>('keepAlive.enabled', true);
  const keepAliveIntervalMs = configService.get<number>('keepAlive.intervalMs', 420000);
  if (keepAliveEnabled) {
    const host = configService.get<string>('host') || '0.0.0.0';
    const port = configService.get<number>('port') || 10000;
    const selfUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/health/ping`;

    setInterval(() => {
      const http = require('http');
      const req = http.get(selfUrl, (res: any) => {
        if (res.statusCode !== 200) {
          console.warn(`[KeepAlive] Ping returned status ${res.statusCode}`);
        }
      });
      req.on('error', (err: Error) => {
        console.warn(`[KeepAlive] Ping failed: ${err.message}`);
      });
      req.setTimeout(5000, () => {
        req.destroy();
        console.warn('[KeepAlive] Ping timed out after 5s');
      });
    }, keepAliveIntervalMs);

    console.log(`[KeepAlive] Spin-down prevention active (every ${keepAliveIntervalMs / 1000}s → ${selfUrl})`);
  }

  // ── Start server ───────────────────────────────────────────────
  const host = configService.get<string>('host') || '0.0.0.0';
  const port = configService.get<number>('port') || 10000;

  await app.listen(port, host);

  console.log(`\n  Senderrr running on http://${host === '0.0.0.0' ? '0.0.0.0' : host}:${port}`);
  console.log(`  API docs:  http://localhost:${port}/api/docs`);
  console.log(`  Dashboard: http://localhost:${port}/wa/dashboard\n`);
}

// Global error handlers — don't exit on Puppeteer/WhatsApp crashes
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[UnhandledRejection]', msg);
});
process.on('uncaughtException', (error) => {
  console.error('[UncaughtException]', error.message);
});

void bootstrap();