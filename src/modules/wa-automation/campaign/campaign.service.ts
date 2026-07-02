import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { BroadcastEvent, BroadcastStatus } from './entities/broadcast-event.entity';
import { MessageTask, MessageTaskStatus } from './entities/message-task.entity';
import { WhatsAppGroup } from './entities/whatsapp-group.entity';
import { WhatsAppCommunity } from './entities/whatsapp-community.entity';
import { AdminAccount } from './entities/admin-account.entity';
import { AdminAssignerService } from './admin-assigner.service';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { TemplateRendererService, NewsPlaceholders } from '../template/template-renderer.service';
import { TemplateService } from '../template/template.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger('CampaignService');

  constructor(
    @InjectRepository(BroadcastEvent, 'data')
    private readonly broadcastRepo: Repository<BroadcastEvent>,
    @InjectRepository(MessageTask, 'data')
    private readonly taskRepo: Repository<MessageTask>,
    @InjectRepository(WhatsAppGroup, 'data')
    private readonly groupRepo: Repository<WhatsAppGroup>,
    @InjectRepository(AdminAccount, 'data')
    private readonly adminRepo: Repository<AdminAccount>,
    private readonly adminAssigner: AdminAssignerService,
    private readonly dispatcher: BroadcastDispatcherService,
    private readonly templateService: TemplateService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly settingsService: SettingsService,
  ) {}

  async getEligibleGroups(): Promise<WhatsAppGroup[]> {
    return this.groupRepo.find({
      where: { isActive: true, isHealthy: true, isTargeted: true },
    });
  }

  async getAllBroadcasts(page = 1, limit = 25, status?: BroadcastStatus): Promise<{ data: BroadcastEvent[]; total: number; page: number; limit: number }> {
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await this.broadcastRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['article'],
    });
    return { data, total, page, limit };
  }

  async getBroadcast(id: number): Promise<BroadcastEvent | null> {
    return this.broadcastRepo.findOne({ where: { id }, relations: ['article'] });
  }

  async getTasksForBroadcast(broadcastId: number): Promise<MessageTask[]> {
    return this.taskRepo.find({
      where: { broadcast: { id: broadcastId } },
      relations: ['group', 'admin'],
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Community Broadcast ──────────────────────────────────────

  async createCommunityBroadcast(
    community: WhatsAppCommunity,
    groups: WhatsAppGroup[],
  ): Promise<{ broadcastId: number; tasksCreated: number }> {
    const template = await this.templateService.getActive();
    const messageText = template.templateText;

    const broadcast = this.broadcastRepo.create({
      status: BroadcastStatus.PENDING,
      totalMessages: groups.length,
    });
    const saved = await this.broadcastRepo.save(broadcast);

    let tasksCreated = 0;
    for (const group of groups) {
      const admin = await this.adminAssigner.selectAdminForGroup(group.id);
      if (!admin) {
        this.logger.warn(`No admin available for group #${group.id}, skipping`);
        continue;
      }
      const task = this.taskRepo.create({
        broadcast: { id: saved.id },
        group: { id: group.id },
        admin: { id: admin.id },
        workerId: `admin-${admin.id}-sess-0`,
        status: MessageTaskStatus.PENDING,
      });
      await this.taskRepo.save(task);
      tasksCreated++;
    }

    this.dispatcher.dispatchBroadcast(saved.id, messageText).catch(err => {
      this.logger.error(`Community broadcast #${saved.id} dispatch crashed: ${err.message}`, err.stack);
      // Mark broadcast as failed so it doesn't stay PENDING forever
      this.broadcastRepo.update(saved.id, {
        status: BroadcastStatus.FAILED,
        completedAt: new Date(),
      }).catch(e => this.logger.error(`Failed to mark community broadcast #${saved.id} as failed: ${e.message}`));
    });

    this.logger.log(`Created community broadcast #${saved.id} with ${tasksCreated} tasks`);
    return { broadcastId: saved.id, tasksCreated };
  }

  // ─── Article Broadcast ────────────────────────────────────────

  async fanOutFromArticleData(article: {
    id: number;
    title: string | null;
    description: string | null;
    url: string;
    imageUrl: string | null;
    sourceName: string | null;
    publishedAt: Date | null;
  }): Promise<BroadcastEvent> {
    const groups = await this.getEligibleGroups();
    if (groups.length === 0) {
      this.logger.warn('No eligible groups for broadcast');
      const broadcast = this.broadcastRepo.create({
        article: { id: article.id } as any,
        status: BroadcastStatus.FAILED,
        totalMessages: 0,
      });
      return this.broadcastRepo.save(broadcast);
    }

    // Compose message content
    const tz = await this.settingsService.get('TIMEZONE', 'Asia/Kolkata');
    const template = await this.templateService.getActive();
    const placeholders: NewsPlaceholders = {
      title: article.title || '',
      description: article.description || '',
      url: article.url,
      imageUrl: article.imageUrl || '',
      source: article.sourceName || '',
      publishedAt: article.publishedAt?.toISOString() || '',
      time: article.publishedAt
        ? article.publishedAt.toLocaleString('en-IN', { timeZone: tz })
        : '',
    };
    const messageText = this.templateRenderer.render(template.templateText, placeholders);

    // Create broadcast event
    const broadcast = this.broadcastRepo.create({
      article: { id: article.id } as any,
      status: BroadcastStatus.PENDING,
      totalMessages: groups.length,
    });
    const saved = await this.broadcastRepo.save(broadcast);

    // Create tasks with best admin assignment
    for (const group of groups) {
      const admin = await this.adminAssigner.selectAdminForGroup(group.id);
      if (!admin) continue;

      const task = this.taskRepo.create({
        broadcast: { id: saved.id },
        group: { id: group.id },
        admin: { id: admin.id },
        status: MessageTaskStatus.PENDING,
        workerId: `admin-${admin.id}-sess-0`,
      });
      await this.taskRepo.save(task);
    }

    // Fire-and-forget dispatch (non-blocking)
    this.dispatcher.dispatchBroadcast(saved.id, messageText, article.imageUrl || undefined).catch(err => {
      this.logger.error(`Broadcast #${saved.id} dispatch crashed: ${err.message}`, err.stack);
      this.broadcastRepo.update(saved.id, {
        status: BroadcastStatus.FAILED,
        completedAt: new Date(),
      }).catch(e => this.logger.error(`Failed to mark broadcast #${saved.id} as failed: ${e.message}`));
    });

    return saved;
  }

  // ─── Retry ────────────────────────────────────────────────────

  async retryBroadcastTasks(broadcastId: number): Promise<number> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId },
      relations: ['article'],
    });
    if (!broadcast) return 0;

    const tasks = await this.taskRepo.find({
      where: { broadcast: { id: broadcastId } },
      relations: ['group', 'admin'],
    });

    const retryableTasks = tasks.filter(t =>
      t.status !== MessageTaskStatus.SENT && t.status !== MessageTaskStatus.CANCELLED,
    );

    if (retryableTasks.length === 0 && broadcast.status === BroadcastStatus.FAILED && broadcast.article) {
      return this.retryFromArticle(broadcast);
    }

    if (retryableTasks.length === 0 || !broadcast.article) return 0;

    const messageText = await this.composeArticleText(broadcast.article);
    if (!messageText) return 0;

    let retried = 0;
    for (const task of retryableTasks) {
      task.status = MessageTaskStatus.PENDING;
      task.errorMessage = null;
      task.errorCategory = null;
      task.attemptCount = 0;
      await this.taskRepo.save(task);
      retried++;
    }

    this.dispatcher.dispatchBroadcast(broadcastId, messageText, broadcast.article.imageUrl || undefined)
      .catch(err => {
        this.logger.error(`Retry broadcast #${broadcastId} crashed: ${err.message}`, err.stack);
        this.broadcastRepo.update(broadcastId, {
          status: BroadcastStatus.FAILED,
          completedAt: new Date(),
        }).catch(e => this.logger.error(`Failed to mark retry broadcast #${broadcastId} as failed: ${e.message}`));
      });

    return retried;
  }

  async retryFailedTasks(): Promise<number> {
    // Pick up both FAILED tasks (with remaining attempts) and PENDING tasks due for retry
    const failed = await this.taskRepo.find({
      where: [
        { status: MessageTaskStatus.FAILED, attemptCount: In([1, 2]) },
        { status: MessageTaskStatus.PENDING, nextRetryAt: LessThan(new Date()) },
      ],
      relations: ['broadcast', 'group', 'admin'],
    });

    let retried = 0;
    for (const task of failed) {
      // If task has a future retry time, don't touch it yet
      if (task.nextRetryAt && task.nextRetryAt > new Date()) continue;
      if (task.status === MessageTaskStatus.FAILED && task.attemptCount >= task.maxAttempts) continue;
      task.status = MessageTaskStatus.PENDING;
      task.errorMessage = null;
      task.errorCategory = null;
      task.nextRetryAt = null as any;
      await this.taskRepo.save(task);
      retried++;
    }
    return retried;
  }

  /**
   * Find broadcasts with PENDING tasks that need re-dispatching.
   * This handles the case where the dispatcher finished but left some tasks PENDING
   * (e.g. due to session/rate-limit issues), and the retry cron reset them.
   */
  async reDispatchStalledBroadcasts(): Promise<number> {
    // Find broadcasts that are IN_PROGRESS or PENDING and have PENDING tasks
    const stalled = await this.broadcastRepo.find({
      where: {
        status: In([BroadcastStatus.IN_PROGRESS, BroadcastStatus.PENDING]),
      },
    });

    let redispatched = 0;
    for (const broadcast of stalled) {
      const pendingCount = await this.taskRepo.count({
        where: { broadcast: { id: broadcast.id }, status: MessageTaskStatus.PENDING },
      });
      if (pendingCount === 0) continue;

      // Check if there are actually tasks due NOW (not waiting on a future backoff)
      const dueNow = await this.taskRepo.count({
        where: {
          broadcast: { id: broadcast.id },
          status: MessageTaskStatus.PENDING,
          nextRetryAt: LessThan(new Date()),
        },
      });
      // Also count tasks with no retry time set (never tried)
      const noRetryTime = await this.taskRepo.count({
        where: {
          broadcast: { id: broadcast.id },
          status: MessageTaskStatus.PENDING,
          nextRetryAt: null as any,
        },
      });
      if (dueNow + noRetryTime === 0) {
        this.logger.log(`Broadcast #${broadcast.id}: ${pendingCount} pending, but all waiting on retry backoff — skipping`);
        continue;
      }

      // Re-dispatch this broadcast
      const tasks = await this.taskRepo.find({
        where: { broadcast: { id: broadcast.id }, status: MessageTaskStatus.PENDING },
        relations: ['group', 'admin'],
        take: 1,
      });
      if (tasks.length === 0) continue;

      // Get the article for message composition
      const broadcastWithArticle = await this.broadcastRepo.findOne({
        where: { id: broadcast.id },
        relations: ['article'],
      });
      if (!broadcastWithArticle) continue;

      let messageText: string | null = null;
      let imageUrl: string | undefined;

      if (broadcastWithArticle.article) {
        messageText = await this.composeArticleText(broadcastWithArticle.article);
        imageUrl = (broadcastWithArticle.article as any).imageUrl || undefined;
      } else if (broadcastWithArticle.messageText) {
        // Advertisement or community broadcast with stored message text
        messageText = broadcastWithArticle.messageText;
      } else {
        // Fallback to active template
        messageText = await this.composeBroadcastText();
      }

      if (!messageText) continue;

      this.logger.log(`Re-dispatching broadcast #${broadcast.id} — ${pendingCount} pending tasks`);
      this.dispatcher.dispatchBroadcast(
        broadcast.id,
        messageText,
        imageUrl,
      ).catch(err => {
        this.logger.error(`Re-dispatch broadcast #${broadcast.id} crashed: ${err.message}`);
      });
      redispatched++;
    }

    return redispatched;
  }

  async getFailedTasksForRetry(): Promise<MessageTask[]> {
    return this.taskRepo.find({
      where: {
        status: MessageTaskStatus.PENDING,
        nextRetryAt: LessThan(new Date()),
        attemptCount: In([1, 2]),
      },
      relations: ['broadcast', 'group', 'admin'],
    });
  }

  async retryAllFailed(): Promise<{ retried: number; broadcasts: number }> {
    const failed = await this.broadcastRepo.find({
      where: {
        status: In([BroadcastStatus.FAILED, BroadcastStatus.PARTIAL]),
      },
      relations: ['article'],
      take: 50,
    });

    let totalTasks = 0;
    let totalBroadcasts = 0;

    // Stagger retries with 30s gaps so the rate limiter can regulate across broadcasts
    for (let i = 0; i < failed.length; i++) {
      if (i > 0) await this.sleep(30_000);
      const count = await this.retryBroadcastTasks(failed[i].id);
      if (count > 0) {
        totalTasks += count;
        totalBroadcasts++;
      }
    }

    return { retried: totalTasks, broadcasts: totalBroadcasts };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Private ──────────────────────────────────────────────────

  private async retryFromArticle(broadcast: BroadcastEvent): Promise<number> {
    const article = broadcast.article as any;
    if (!article) return 0;

    const groups = await this.getEligibleGroups();
    if (groups.length === 0) return 0;

    broadcast.status = BroadcastStatus.IN_PROGRESS;
    broadcast.totalMessages = groups.length;
    broadcast.startedAt = new Date();
    await this.broadcastRepo.save(broadcast);

    const messageText = await this.composeArticleText(article);
    if (!messageText) return 0;

    let created = 0;
    for (const group of groups) {
      const admin = await this.adminAssigner.selectAdminForGroup(group.id);
      if (!admin) continue;
      const task = this.taskRepo.create({
        broadcast: { id: broadcast.id },
        group: { id: group.id },
        admin: { id: admin.id },
        status: MessageTaskStatus.PENDING,
        workerId: `admin-${admin.id}-sess-0`,
      });
      await this.taskRepo.save(task);
      created++;
    }

    this.dispatcher.dispatchBroadcast(broadcast.id, messageText, article.imageUrl || undefined)
      .catch(err => {
        this.logger.error(`Retry broadcast #${broadcast.id} (from article) crashed: ${err.message}`, err.stack);
        this.broadcastRepo.update(broadcast.id, {
          status: BroadcastStatus.FAILED,
          completedAt: new Date(),
        }).catch(e => this.logger.error(`Failed to mark retry broadcast #${broadcast.id} as failed: ${e.message}`));
      });

    return created;
  }

  private async composeArticleText(article: any): Promise<string | null> {
    const tz = await this.settingsService.get('TIMEZONE', 'Asia/Kolkata');
    const template = await this.templateService.getActive();
    if (!template) return null;
    const placeholders: NewsPlaceholders = {
      title: article.title || '',
      description: article.description || '',
      url: article.url,
      imageUrl: article.imageUrl || '',
      source: article.sourceName || '',
      publishedAt: article.publishedAt?.toISOString() || '',
      time: article.publishedAt
        ? article.publishedAt.toLocaleString('en-IN', { timeZone: tz })
        : '',
    };
    return this.templateRenderer.render(template.templateText, placeholders);
  }

  /** Compose broadcast message text using the active template (for community broadcasts, fallback). */
  private async composeBroadcastText(): Promise<string | null> {
    const template = await this.templateService.getActive();
    if (!template) return null;
    const placeholders: NewsPlaceholders = {
      title: '',
      description: '',
      url: '',
      imageUrl: '',
      source: '',
      publishedAt: '',
      time: '',
    };
    return this.templateRenderer.render(template.templateText, placeholders);
  }
}
