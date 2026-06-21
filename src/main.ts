import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ShutdownService } from './common/services/shutdown.service';
import { BullBoardAuthMiddleware } from './common/security/bull-board-auth.middleware';
import { AuthService } from './modules/auth/auth.service';
import { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'node:child_process';
import { NestExpressApplication } from '@nestjs/platform-express';

// Configuration loading order (later sources do NOT override earlier ones):
//   1. Process env (Docker, shell, systemd) — highest priority
//   2. .env (project-level overrides committed/managed by the user)
//   3. data/.env.generated (Dashboard-managed config; created on first run)
const generatedEnvPath = path.resolve(process.cwd(), 'data', '.env.generated');
const userEnvPath = path.resolve(process.cwd(), '.env');

// Ensure data directory exists
const dataDir = path.dirname(generatedEnvPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 2. User-managed .env (does not override real process env)
if (fs.existsSync(userEnvPath)) {
  console.log('[Bootstrap] Loading .env from:', userEnvPath);
  dotenv.config({ path: userEnvPath, override: false });
}

// 3. Dashboard-saved config (does not override .env or process env)
if (fs.existsSync(generatedEnvPath)) {
  console.log('[Bootstrap] Loading saved configuration from:', generatedEnvPath);
  dotenv.config({ path: generatedEnvPath, override: false });
} else {
  console.log('[Bootstrap] First run detected, creating default configuration...');
  const minimalConfig = `# OpenWA Configuration
# Generated automatically on first run
DATABASE_TYPE=sqlite
POSTGRES_BUILTIN=false
REDIS_ENABLED=false
REDIS_BUILTIN=false
QUEUE_ENABLED=false
STORAGE_TYPE=local
MINIO_BUILTIN=false
STORAGE_PATH=./data/media
`;
  fs.writeFileSync(generatedEnvPath, minimalConfig);
  console.log('[Bootstrap] Created default configuration at:', generatedEnvPath);
  dotenv.config({ path: generatedEnvPath, override: false });
}

/**
 * Remove stale Chrome/Puppeteer lock files from session data directories.
 * On a crash/kill, Chrome leaves SingletonLock/SingletonCookie/SingletonSocket
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
          if (fs.existsSync(lockPath)) {
            fs.rmSync(lockPath, { force: true });
          }
        } catch {
          // Race condition — another process removed it, ignore
        }
      }
    }
    // Also kill any orphaned Chrome processes from a previous run
    try {
      try {
        require('child_process').execSync('pkill -f "chrome.*--disable-setuid-sandbox" 2>/dev/null || true');
      } catch {
        // pkill not available — ignore
      }
    } catch {
      // pkill not available on all systems, ignore
    }
  } catch {
    // Directory might not be accessible yet
  }
}

async function bootstrap() {
  // Clean up Chrome lock files from previous runs
  cleanChromeLocks(path.resolve(process.cwd(), process.env.SESSION_DATA_PATH || './data/sessions'));
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable shutdown hooks for graceful shutdown
  app.enableShutdownHooks();

  // Wire up graceful shutdown service
  const shutdownService = app.get(ShutdownService);
  shutdownService.setShutdownCallback(async () => {
    // Manually destroy TypeORM DataSources before NestJS shutdown hooks fire.
    // TypeOrmCoreModule.onApplicationShutdown uses moduleRef.get() which can
    // throw when the provider isn't reachable from the module context at teardown.
    // By destroying DataSources here (via app.get, which always resolves), the
    // shutdown hook sees isInitialized=false and skips destroy() gracefully.
    for (const token of ['mainDataSource', 'dataDataSource']) {
      try {
        const ds = app.get(token);
        if (ds?.isInitialized) await ds.destroy();
      } catch {
        // DataSource wasn't available — nothing to clean up.
      }
    }
    await app.close();
  });

  // Enhanced Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['*'];
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('OpenWA API')
    .setDescription('Open Source WhatsApp API Gateway - Free, Self-Hosted HTTP API')
    .setVersion('0.1.6')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'X-API-Key')
    .addTag('sessions', 'WhatsApp session management')
    .addTag('messages', 'Send and manage messages')
    .addTag('webhooks', 'Webhook configuration')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Protect Bull Board queue UI
  const bullBoardAuth = new BullBoardAuthMiddleware(app.get(AuthService));
  app.use('/api/admin/queues', (req: Request, res: Response, next: NextFunction) => {
    void bullBoardAuth.use(req, res, next);
  });

  // Serve the React dashboard — SPA catch-all for non-API routes
  const dashboardPath = path.resolve(process.cwd(), 'dashboard', 'dist');
  if (fs.existsSync(dashboardPath)) {
    // Static files
    app.useStaticAssets(dashboardPath, { index: false });
    // SPA catch-all — serve index.html for all non-API, non-Socket.IO routes
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
    console.log(`[Bootstrap] Serving React dashboard from: ${dashboardPath}`);
  } else {
    console.log('[Bootstrap] Dashboard not built — API-only mode. Run: cd dashboard && npm run build');
  }

  const port = process.env.PORT || 2785;

  // Kill any previous process on the port to avoid EADDRINUSE
  const { execSync } = require('child_process');
  try {
    const pid = execSync(`lsof -ti:${port}`, { encoding: 'utf8', timeout: 3000 }).trim();
    if (pid) {
      process.kill(parseInt(pid, 10), 'SIGKILL');
      console.log(`[Bootstrap] Killed previous process ${pid} on port ${port}`);
      // Give the OS a moment to release the port
      await new Promise(r => setTimeout(r, 500));
    }
  } catch { /* no process on port — good */ }

  await app.listen(port);

  console.log(`\n  🚀 OpenWA is running on: http://localhost:${port}`);
  console.log(`  📚 API docs: http://localhost:${port}/api/docs`);
  console.log(`  👤 WA Automation: http://localhost:${port}/wa/dashboard`);
  console.log(`  🔧 OpenWA Admin: http://localhost:${port}/_openwa\n`);
}

// Global error handlers to prevent Puppeteer/WhatsApp-web.js crashes from killing the process
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[UncaughtException]', error.message);
  // Don't exit — let the process continue running
});

void bootstrap();
