import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScraperService } from '../scraper/scraper.service';
import { CampaignService } from '../campaign/campaign.service';
import { AutomationService } from '../automation/automation.service';
import { MaintenanceService } from '../campaign/maintenance.service';
import { RateLimiterService } from '../automation/rate-limiter.service';
import { WorkerTrackerService } from '../automation/worker-tracker.service';
import { GroupSyncService } from '../automation/group-sync.service';
import { GenericParser } from '../scraper/parsers/built-in/generic.parser';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('SchedulerService');
  private readonly targetUrls: string[];
  private readonly activeHourStart: number;
  private readonly activeHourEnd: number;
  private readonly activeWeekdays: number[];

  constructor(
    private readonly scraperService: ScraperService,
    private readonly campaignService: CampaignService,
    private readonly automationService: AutomationService,
    private readonly maintenanceService: MaintenanceService,
    private readonly rateLimiter: RateLimiterService,
    private readonly workerTracker: WorkerTrackerService,
    private readonly groupSyncService: GroupSyncService,
    configService: ConfigService,
  ) {
    this.targetUrls = configService.get<string>('scraper.targetUrls', '')
      .split(',').map(u => u.trim()).filter(Boolean);
    this.activeHourStart = configService.get<number>('scraper.activeHourStart', 0);
    this.activeHourEnd = configService.get<number>('scraper.activeHourEnd', 23);
    const days = configService.get<string>('scraper.activeWeekdays', '0,1,2,3,4,5,6');
    this.activeWeekdays = days.split(',').map(Number);

    this.logger.log(
      `Scheduler initialized: ${this.targetUrls.length} URLs, ` +
      `active ${this.activeHourStart}:00-${this.activeHourEnd}:00, ` +
      `days [${this.activeWeekdays.join(',')}]`
    );
  }

  // ─── Scraper: every 5 minutes ───

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkForNewArticles(): Promise<void> {
    if (!this.isScraperActive()) return;

    this.logger.log('Running scraper cycle...');
    let totalNew = 0;
    const parser = new GenericParser();

    for (const url of this.targetUrls) {
      try {
        const articles = await this.scraperService.detectFromListing(url, parser);
        for (const article of articles) {
          this.logger.log(`New article detected: ${article.title}`);
          totalNew++;

          try {
            const broadcast = await this.campaignService.fanOutFromArticleData({
              id: article.id,
              title: article.title,
              description: article.description,
              url: article.url,
              imageUrl: article.imageUrl,
              sourceName: article.sourceName,
              publishedAt: article.publishedAt,
            });
            this.logger.log(`Broadcast ${broadcast.id} created for article ${article.id}`);
          } catch (broadcastErr) {
            this.logger.error(`Broadcast fan-out failed for article ${article.id}: ${(broadcastErr as Error).message}`);
          }
        }
      } catch (err) {
        this.logger.warn(`Scraper error for ${url}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Scraper cycle complete: ${totalNew} new articles`);
  }

  // ─── Failed message retry: every 5 minutes ───

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedMessages(): Promise<void> {
    const count = await this.campaignService.retryFailedTasks();
    if (count > 0) {
      this.logger.log(`Retry cycle: ${count} failed tasks reset to pending`);
    }
  }

  // ─── Heartbeat: every 2 minutes ───

  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchHeartbeats(): Promise<void> {
    const staleCount = await this.workerTracker.markStaleSessionsOffline(5);
    if (staleCount > 0) {
      this.logger.log(`Marked ${staleCount} stale worker sessions offline`);
    }

    // Record heartbeat for active sessions
    const sessions = await this.workerTracker.getAllSessions();
    for (const session of sessions) {
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
      // Sync groups from all worker sessions
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
    if (count > 0) {
      this.logger.log(`Recovery cycle: ${count} groups restored to healthy`);
    }
  }

  private isScraperActive(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Check weekday
    if (!this.activeWeekdays.includes(day)) {
      return false;
    }

    // Check active hours (supports wrap-around)
    if (this.activeHourStart <= this.activeHourEnd) {
      return hour >= this.activeHourStart && hour < this.activeHourEnd;
    }
    return hour >= this.activeHourStart || hour < this.activeHourEnd;
  }
}
