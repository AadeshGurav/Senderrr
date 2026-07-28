/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScraperService } from '@scraper/scraper.service';
import { CampaignService } from '../campaign/campaign.service';
import { AutomationService } from '../automation/automation.service';
import { MaintenanceService } from '../campaign/maintenance.service';
import { RateLimiterService } from '../automation/rate-limiter.service';
import { WorkerTrackerService } from '../automation/worker-tracker.service';
import { GroupSyncService } from '../automation/group-sync.service';
import { SettingsService } from '../settings/settings.service';
import { BroadcastEvent, BroadcastStatus } from '@database/entities/wa-automation/broadcast-event.entity';
import { GenericParser } from '@scraper/parsers/built-in/generic.parser';
import { ConfigService } from '@nestjs/config';

import { AdminSessionService } from '../automation/admin-session.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('SchedulerService');
  private readonly DOWNTIME_THRESHOLD_MS = 3_600_000; // 1 hour

  constructor(
    private readonly scraperService: ScraperService,
    private readonly campaignService: CampaignService,
    private readonly automationService: AutomationService,
    private readonly maintenanceService: MaintenanceService,
    private readonly rateLimiter: RateLimiterService,
    private readonly workerTracker: WorkerTrackerService,
    private readonly groupSyncService: GroupSyncService,
    private readonly settingsService: SettingsService,
    private readonly adminSessionService: AdminSessionService,
    @InjectRepository(BroadcastEvent, 'data')
    private readonly broadcastRepo: Repository<BroadcastEvent>,
    private readonly configService: ConfigService,
  ) {}

  // ─── Scraper: every 5 minutes ───

  @Cron(CronExpression.EVERY_MINUTE)
  async checkForNewArticles(): Promise<void> {
    if (!(await this.isScraperActive())) return;

    const rawUrls = await this.settingsService.get(
      'SCRAPER_TARGET_URLS', 
      this.configService.get<string>('scraper.targetUrls', '')
    );
    const targetUrls = rawUrls.split(',').map(u => u.trim()).filter(Boolean);

    if (targetUrls.length === 0) {
      this.logger.log('Scraper cycle skipped: no target URLs configured');
      return;
    }

    this.logger.log('Running scraper cycle...');
    const parser = new GenericParser();
    const allNew: any[] = [];

    // Retry previously failed article URLs before checking listing pages
    try {
      const recovered = await this.scraperService.retryFailedArticleUrls(parser);
      allNew.push(...recovered);
      if (recovered.length > 0) {
        this.logger.log(`Retry cycle recovered ${recovered.length} previously failed article(s)`);
      }
    } catch (err) {
      this.logger.warn(`Retry cycle error: ${(err as Error).message}`);
    }

    for (const url of targetUrls) {
      try {
        const articles = await this.scraperService.detectFromListing(url, parser);
        allNew.push(...articles);
      } catch (err) {
        this.logger.warn(`Scraper error for ${url}: ${(err as Error).message}`);
      }
    }

    if (allNew.length === 0) {
      this.logger.log('Scraper cycle complete: no new articles');
      return;
    }

    // Resume guard: if system was offline >1 hour, only send the latest article
    const isRecovering = await this.isSystemResuming();
    const toBroadcast = isRecovering ? [allNew[allNew.length - 1]] : allNew;

    if (isRecovering) {
      this.logger.log(
        `Resume guard active: ${allNew.length} articles detected, broadcasting only the latest, skipping ${allNew.length - 1} stale`,
      );
    }

    for (const article of toBroadcast) {
      try {
        const broadcast = await this.campaignService.fanOutFromArticleData({
          id: article.id,
          title: article.title,
          description: article.description,
          url: article.url,
          imageUrl: article.imageUrl,
          sourceName: article.sourceName,
          publishedAt: article.publishedAt,
          bulletPoints: (article as any).bulletPoints,
        });
        this.logger.log(`Broadcast ${broadcast.id} created for article ${article.id}`);
      } catch (err) {
        this.logger.error(`Broadcast failed for article ${article.id}: ${(err as Error).message}`);
      }
    }
  }

  // ─── Auto-Reconnect: every 2 minutes ───

  @Cron('0 */2 * * * *')
  async autoReconnectSessions(): Promise<void> {
    try {
      const { reconnected, failed } = await this.adminSessionService.autoReconnectSessions();
      if (reconnected.length > 0 || failed.length > 0) {
        this.logger.log(`Auto-reconnect cycle: ${reconnected.length} reconnected, ${failed.length} pending/failed`);
      }
    } catch (err) {
      this.logger.warn(`Auto-reconnect cycle failed: ${(err as Error).message}`);
    }
  }

  // ─── Failed retry: every 5 minutes ───

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedMessages(): Promise<void> {
    const count = await this.campaignService.retryFailedTasks();
    if (count > 0) this.logger.log(`Retry cycle: ${count} failed tasks reset to pending`);

    // Re-dispatch stalled broadcasts that have pending tasks waiting
    const redispatched = await this.campaignService.reDispatchStalledBroadcasts();
    if (redispatched > 0) {
      this.logger.log(`Re-dispatched ${redispatched} stalled broadcast(s) with pending tasks`);
    }
  }

  // ─── Heartbeat: every 5 minutes ───

  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchHeartbeats(): Promise<void> {
    const staleCount = await this.workerTracker.markStaleSessionsOffline(5);
    if (staleCount > 0) this.logger.log(`Marked ${staleCount} stale worker sessions offline`);

    for (const session of await this.workerTracker.getAllSessions()) {
      try {
        await this.workerTracker.recordHeartbeat(session.workerId, {
          browserStatus: session.browserStatus,
          openwaSessionStatus: session.openwaSessionStatus,
        });
      } catch (err) {
        this.logger.warn(`Heartbeat failed for ${session.workerId}: ${(err as Error).message}`);
      }
    }
  }

  // ─── Group sync: every 30 minutes ───

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncGroupsFromEngine(): Promise<void> {
    this.logger.log('Starting group sync from engine...');
    try {
      const sessions = await this.workerTracker.getAllSessions();
      let totalGroups = 0;
      for (const session of sessions) {
        if (!session.openwaSessionId) continue;
        const result = await this.groupSyncService.syncSessionGroups(session.openwaSessionId);
        totalGroups += result.groups.length;
      }
      this.logger.log(`Group sync complete: ${totalGroups} groups from ${sessions.length} sessions`);
    } catch (err) {
      this.logger.error(`Group sync failed: ${(err as Error).message}`);
    }
  }

  // ─── Recovery: hourly ───

  @Cron(CronExpression.EVERY_HOUR)
  async recoverUnhealthyGroups(): Promise<void> {
    const count = await this.maintenanceService.autoRecoverUnhealthyGroups();
    if (count > 0) this.logger.log(`Recovery cycle: ${count} groups restored to healthy`);
  }

  // ─── Stale broadcast cleanup: hourly ───

  @Cron(CronExpression.EVERY_HOUR)
  async resolveStaleBroadcasts(): Promise<void> {
    const count = await this.campaignService.reDispatchStalledBroadcasts();
    if (count > 0) this.logger.log(`Resolved ${count} stale broadcasts stuck IN_PROGRESS`);
  }

  // ─── Private ──────────────────────────────────────────────────

  /**
   * Detect if the system is recovering from extended downtime (>1 hour
   * since last completed broadcast). Prevents sending accumulated stale articles.
   */
  private async isSystemResuming(): Promise<boolean> {
    const cutoff = new Date(Date.now() - this.DOWNTIME_THRESHOLD_MS);

    const recent = await this.broadcastRepo.findOne({
      where: {
        status: BroadcastStatus.COMPLETED,
        completedAt: MoreThanOrEqual(cutoff),
      },
      order: { completedAt: 'DESC' },
    });

    // If no completed broadcast in the last hour → system was likely offline
    if (!recent) {
      // Double-check: any broadcast completed or in-progress recently?
      const anyActivity = await this.broadcastRepo.findOne({
        where: { startedAt: MoreThanOrEqual(cutoff) },
        order: { startedAt: 'DESC' },
      });
      return !anyActivity;
    }

    return false;
  }

  private async isScraperActive(): Promise<boolean> {
    const tz = await this.settingsService.get('TIMEZONE', 'UTC');
    
    const activeHourStart = await this.settingsService.getInt('SCRAPER_ACTIVE_HOUR_START', this.configService.get<number>('scraper.activeHourStart', 0));
    const activeHourEnd = await this.settingsService.getInt('SCRAPER_ACTIVE_HOUR_END', this.configService.get<number>('scraper.activeHourEnd', 23));
    
    const rawDays = await this.settingsService.get('SCRAPER_ACTIVE_WEEKDAYS', this.configService.get<string>('scraper.activeWeekdays', '0,1,2,3,4,5,6'));
    const activeWeekdays = rawDays.split(',').map(Number);
    
    const now = new Date();
    const hour = this.getHourInTimezone(now, tz);
    const day = now.getDay();
    if (!activeWeekdays.includes(day)) return false;
    if (activeHourStart <= activeHourEnd) {
      return hour >= activeHourStart && hour < activeHourEnd;
    }
    return hour >= activeHourStart || hour < activeHourEnd;
  }

  private getHourInTimezone(date: Date, timezone: string): number {
    try {
      return parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date),
        10,
      );
    } catch {
      return date.getHours();
    }
  }
}
