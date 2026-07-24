/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from '../rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: any) => {
              const config: Record<string, any> = {
                'automation.hourlyLimit': 500,
                'automation.dailyLimit': 5000,
              };
              return config[key] ?? def;
            },
          },
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should allow sending when under limits', () => {
    const result = service.check(1);
    expect(result.allowed).toBe(true);
  });

  it('should reject after hourly limit is exceeded', () => {
    for (let i = 0; i < 500; i++) {
      service.increment(1);
    }
    const result = service.check(1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Hourly limit');
  });

  it('should apply warm-up multiplier', () => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 1 * 86400_000); // Day 1
    const multiplier = service.getWarmUpMultiplier(weekAgo, false);
    expect(multiplier).toBeLessThan(1.0);
    expect(multiplier).toBeGreaterThan(0);
  });

  it('should skip warm-up if skipWarmup is true', () => {
    const today = new Date();
    const multiplier = service.getWarmUpMultiplier(today, true);
    expect(multiplier).toBe(1.0);
  });

  it('should allow with custom limits via checkWithLimits', () => {
    service.increment(1);
    const result = service.checkWithLimits(1, 10, 100);
    expect(result.allowed).toBe(true);
  });

  it('should return accurate counts', () => {
    service.increment(1);
    service.increment(1);
    service.increment(1);
    const counts = service.getCounts(1);
    expect(counts.hourly).toBe(3);
    expect(counts.hourlyLimit).toBe(500);
    expect(counts.dailyLimit).toBe(5000);
  });
});
