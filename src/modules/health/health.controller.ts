import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface HealthStatus {
  status: 'ok' | 'error' | 'degraded';
  timestamp: string;
  version?: string;
  uptime?: number;
  services?: Record<string, { status: string; latencyMs?: number; error?: string }>;
}

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    @InjectDataSource('main') private readonly mainDataSource: DataSource,
    @InjectDataSource('data') private readonly dataDataSource: DataSource,
  ) {}

  /**
   * Basic liveness probe — used by Render's health check.
   * Returns 200 as fast as possible, no dependency checks.
   * Must be at /api/health/live (or override prefix for Render root-level).
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — Render health check target' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  liveness(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Keep-alive ping — used by the internal keep-alive self-pinger
   * and can also be called by external uptime monitors.
   * Returns quickly without hitting the database.
   */
  @Get('ping')
  @ApiOperation({ summary: 'Keep-alive ping endpoint for spin-down prevention' })
  @ApiResponse({ status: 200, description: 'Keep-alive acknowledged' })
  ping(): { status: 'ok'; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Full readiness probe — verifies all critical dependencies.
   * Called by Render's deployment health check before routing traffic.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — verifies database connectivity' })
  @ApiResponse({ status: 200, description: 'Application is ready to accept traffic' })
  @ApiResponse({ status: 503, description: 'Application not ready — dependencies unhealthy' })
  async readiness(): Promise<HealthStatus> {
    const services: HealthStatus['services'] = {};
    let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';

    // Check main database (auth/audit)
    try {
      const t0 = Date.now();
      await this.mainDataSource.query('SELECT 1');
      services['mainDb'] = {
        status: 'up',
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      services['mainDb'] = {
        status: 'down',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      overallStatus = 'error';
    }

    // Check data database (sessions, messages, webhooks)
    try {
      const t0 = Date.now();
      await this.dataDataSource.query('SELECT 1');
      services['dataDb'] = {
        status: 'up',
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      services['dataDb'] = {
        status: 'down',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      overallStatus = 'error';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      services,
    };
  }

  /**
   * Full health check — comprehensive status including all services.
   */
  @Get()
  @ApiOperation({ summary: 'Full health check with all service statuses' })
  @ApiResponse({ status: 200, description: 'Application health summary' })
  async check(): Promise<HealthStatus> {
    return this.readiness();
  }
}