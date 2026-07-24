/* eslint-disable */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger('RateLimiterService');
  private hourly = new Map<string, RateBucket>();
  private daily = new Map<string, RateBucket>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly hourlyLimit: number;
  private readonly dailyLimit: number;

  constructor(private readonly configService: ConfigService) {
    this.hourlyLimit = this.configService.get<number>('automation.hourlyLimit', 500);
    this.dailyLimit = this.configService.get<number>('automation.dailyLimit', 5000);
    // Cleanup stale entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /** Check if admin is within rate limits */
  check(adminId: number, warmUpMultiplier: number = 1.0): { allowed: boolean; reason?: string } {
    const adjustedHourlyLimit = Math.floor(this.hourlyLimit * warmUpMultiplier);
    const adjustedDailyLimit = Math.floor(this.dailyLimit * warmUpMultiplier);

    const hourly = this.getCount(this.hourly, `admin:${adminId}`, 3600_000);
    const daily = this.getCount(this.daily, `admin:${adminId}`, 86400_000);

    if (hourly >= adjustedHourlyLimit) {
      return { allowed: false, reason: `Hourly limit (${adjustedHourlyLimit}) exceeded` };
    }
    if (daily >= adjustedDailyLimit) {
      return { allowed: false, reason: `Daily limit (${adjustedDailyLimit}) exceeded` };
    }
    return { allowed: true };
  }

  /** Check if admin is within rate limits with custom limits */
  checkWithLimits(adminId: number, hourlyLimit: number, dailyLimit: number): { allowed: boolean; reason?: string } {
    const hourly = this.getCount(this.hourly, `admin:${adminId}`, 3600_000);
    const daily = this.getCount(this.daily, `admin:${adminId}`, 86400_000);

    if (hourly >= hourlyLimit) {
      return { allowed: false, reason: `Hourly limit (${hourlyLimit}) exceeded` };
    }
    if (daily >= dailyLimit) {
      return { allowed: false, reason: `Daily limit (${dailyLimit}) exceeded` };
    }
    return { allowed: true };
  }

  /** Increment send counters for an admin */
  increment(adminId: number): void {
    this.incrementBucket(this.hourly, `admin:${adminId}`, 3600_000);
    this.incrementBucket(this.daily, `admin:${adminId}`, 86400_000);
  }

  /** Current counts for display */
  getCounts(adminId: number): { hourly: number; daily: number; hourlyLimit: number; dailyLimit: number } {
    return {
      hourly: this.getCount(this.hourly, `admin:${adminId}`, 3600_000),
      daily: this.getCount(this.daily, `admin:${adminId}`, 86400_000),
      hourlyLimit: this.hourlyLimit,
      dailyLimit: this.dailyLimit,
    };
  }

  /** Calculate warm-up multiplier (Day 1: 50 → Day 7: 500) */
  getWarmUpMultiplier(warmUpStartedAt: Date | null, skipWarmup: boolean): number {
    if (skipWarmup || !warmUpStartedAt) return 1.0;
    const days = Math.floor((Date.now() - warmUpStartedAt.getTime()) / 86400_000) + 1;
    if (days >= 7) return 1.0;
    const limits = [50, 80, 120, 180, 260, 370, 500];
    const maxLimit = this.hourlyLimit;
    return Math.min(limits[Math.min(days - 1, 6)] / maxLimit, 1.0);
  }

  private getCount(map: Map<string, RateBucket>, key: string, ttlMs: number): number {
    const bucket = map.get(key);
    if (!bucket || Date.now() >= bucket.resetAt) return 0;
    return bucket.count;
  }

  private incrementBucket(map: Map<string, RateBucket>, key: string, ttlMs: number): void {
    const now = Date.now();
    const bucket = map.get(key);
    if (!bucket || now >= bucket.resetAt) {
      map.set(key, { count: 1, resetAt: now + ttlMs });
    } else {
      bucket.count++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.hourly) {
      if (now >= bucket.resetAt) this.hourly.delete(key);
    }
    for (const [key, bucket] of this.daily) {
      if (now >= bucket.resetAt) this.daily.delete(key);
    }
  }
}
