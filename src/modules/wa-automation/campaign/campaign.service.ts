import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { BroadcastEvent, BroadcastStatus } from './entities/broadcast-event.entity';
import { MessageTask, MessageTaskStatus } from './entities/message-task.entity';
import { WhatsAppGroup } from './entities/whatsapp-group.entity';
import { WhatsAppCommunity } from './entities/whatsapp-community.entity';
import { AdminAccount } from './entities/admin-account.entity';
import { AdminAssignerService } from './admin-assigner.service';
import { AttemptTrackerService } from './attempt-tracker.service';
import { MaintenanceService } from './maintenance.service';
import { AutomationService, ErrorCategory, DeliveryResult } from '../automation/automation.service';
import { JitterService } from '../automation/anti-ban/jitter.service';
import { RateLimiterService } from '../automation/rate-limiter.service';
import { TemplateService } from '../template/template.service';
import { TemplateRendererService, NewsPlaceholders } from '../template/template-renderer.service';
import { AdminSessionService } from '../automation/admin-session.service';

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
    private readonly attemptTracker: AttemptTrackerService,
    private readonly rateLimiter: RateLimiterService,
    private readonly maintenanceService: MaintenanceService,
    private readonly automationService: AutomationService,
    private readonly jitterService: JitterService,
    private readonly templateService: TemplateService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly adminSessionService: AdminSessionService,
  ) {}

  async getEligibleGroups(): Promise<WhatsAppGroup[]> {
    return this.groupRepo.find({
      where: { isActive: true, isHealthy: true, isTargeted: true },
    });
  }

  async getAllBroadcasts(): Promise<BroadcastEvent[]> {
    return this.broadcastRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
      relations: ['article'],
    });
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

  /**
   * Create a broadcast for a community and dispatch tasks to all its groups.
   */
  async createCommunityBroadcast(
    community: WhatsAppCommunity,
    groups: WhatsAppGroup[],
  ): Promise<{ broadcastId: number; tasksCreated: number }> {
    const activeTemplate = await this.templateService.getActive();
    const fullText = activeTemplate.templateText;

    // Create a single broadcast event for the community
    const broadcast = this.broadcastRepo.create({
      status: BroadcastStatus.PENDING,
      totalMessages: groups.length,
    });
    const saved = await this.broadcastRepo.save(broadcast);

    // Create tasks for each group
    let tasksCreated = 0;
    for (const group of groups) {
      const admin = await this.adminAssigner.selectAdminForGroup(group.id);
      if (!admin) {
        this.logger.warn(`No admin available for group #${group.id}, skipping`);
        continue;
      }

      const task = this.taskRepo.create({
        broadcast: saved,
        group,
        admin,
        workerId: `admin-${admin.id}-sess-0`,
        status: MessageTaskStatus.PENDING,
      });
      await this.taskRepo.save(task);
      tasksCreated++;
    }

    // Update broadcast status to IN_PROGRESS
    saved.status = BroadcastStatus.IN_PROGRESS;
    saved.startedAt = new Date();
    await this.broadcastRepo.save(saved);

    // Tasks will be picked up and dispatched by the scheduler service
    this.logger.log(`Created community broadcast #${saved.id} with ${tasksCreated} tasks`);

    return { broadcastId: saved.id, tasksCreated };
  }

  /**
   * Fan out a broadcast from a scraped article to all eligible groups.
   */
  async fanOutFromArticleData(article: { id: number; title: string | null; description: string | null; url: string; imageUrl: string | null; sourceName: string | null; publishedAt: Date | null }): Promise<BroadcastEvent> {

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

    // Create broadcast event
    const broadcast = this.broadcastRepo.create({
      article: { id: article.id } as any,
      status: BroadcastStatus.PENDING,
      totalMessages: groups.length,
    });
    await this.broadcastRepo.save(broadcast);

    // Compose message content using active template
    const template = await this.templateService.getActive();
    const placeholders: NewsPlaceholders = {
      title: article.title || '',
      description: article.description || '',
      url: article.url,
      imageUrl: article.imageUrl || '',
      source: article.sourceName || '',
      publishedAt: article.publishedAt?.toISOString() || '',
      time: article.publishedAt
        ? article.publishedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '',
    };
    const messageText = this.templateRenderer.render(template.templateText, placeholders);

    // Create message tasks and dispatch
    broadcast.status = BroadcastStatus.IN_PROGRESS;
    broadcast.startedAt = new Date();
    await this.broadcastRepo.save(broadcast);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const admin = await this.adminAssigner.selectAdminForGroup(group.id);
      if (!admin) continue;

      const task = this.taskRepo.create({
        broadcast: { id: broadcast.id } as any,
        group: { id: group.id } as any,
        admin: { id: admin.id } as any,
        status: MessageTaskStatus.PENDING,
        workerId: `admin-${admin.id}-sess-0`,
      });
      const savedTask = await this.taskRepo.save(task);

      // Schedule with jitter
      this.dispatchWithJitter(savedTask.id, messageText, admin.id, i, groups.length, article.imageUrl || undefined);
    }

    return broadcast;
  }

  /**
   * Retry all failed tasks for a specific broadcast immediately.
   * If broadcast has no tasks but is failed (e.g. no eligible groups at creation time),
   * it re-creates tasks from current eligible groups and dispatches them.
   */
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

    // Retry failed tasks AND stale pending tasks (those with error messages from old dispatches)
    const retryableTasks = tasks.filter(t =>
      t.status === MessageTaskStatus.FAILED ||
      (t.status === MessageTaskStatus.PENDING && t.errorMessage)
    );

    // If no retryable tasks but broadcast is failed, re-trigger from article
    if (retryableTasks.length === 0 && broadcast.status === BroadcastStatus.FAILED && broadcast.article) {
      const article = broadcast.article;
      const groups = await this.getEligibleGroups();
      if (groups.length === 0) {
        this.logger.warn(`Retry broadcast #${broadcastId}: still no eligible groups`);
        return 0;
      }

      broadcast.status = BroadcastStatus.IN_PROGRESS;
      broadcast.totalMessages = groups.length;
      broadcast.startedAt = new Date();
      await this.broadcastRepo.save(broadcast);

      // Compose message
      const template = await this.templateService.getActive();
      const placeholders: NewsPlaceholders = {
        title: article.title || '',
        description: article.description || '',
        url: article.url,
        imageUrl: article.imageUrl || '',
        source: article.sourceName || '',
        publishedAt: article.publishedAt?.toISOString() || '',
        time: article.publishedAt
          ? article.publishedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : '',
      };
      const messageText = this.templateRenderer.render(template.templateText, placeholders);
      const imageUrl = article.imageUrl || undefined;

      let created = 0;
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const admin = await this.adminAssigner.selectAdminForGroup(group.id);
        if (!admin) continue;

        const task = this.taskRepo.create({
          broadcast: { id: broadcast.id } as any,
          group: { id: group.id } as any,
          admin: { id: admin.id } as any,
          status: MessageTaskStatus.PENDING,
          workerId: `admin-${admin.id}-sess-0`,
        });
        const savedTask = await this.taskRepo.save(task);
        this.dispatchWithJitter(savedTask.id, messageText, admin.id, i, groups.length, imageUrl);
        created++;
      }

      return created;
    }

    // Normal retry: reset and re-dispatch retryable tasks
    if (retryableTasks.length === 0 || !broadcast.article) return 0;

    const template = await this.templateService.getActive();
    const placeholders: NewsPlaceholders = {
      title: broadcast.article.title || '',
      description: broadcast.article.description || '',
      url: broadcast.article.url,
      imageUrl: broadcast.article.imageUrl || '',
      source: broadcast.article.sourceName || '',
      publishedAt: broadcast.article.publishedAt?.toISOString() || '',
      time: broadcast.article.publishedAt
        ? broadcast.article.publishedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '',
    };
    const messageText = this.templateRenderer.render(template.templateText, placeholders);
    const imageUrl = broadcast.article.imageUrl || undefined;

    if (!messageText) return 0;

    let retried = 0;
    for (let i = 0; i < retryableTasks.length; i++) {
      const task = retryableTasks[i];
      const adminId = task.admin?.id;
      if (!adminId) continue;

      task.status = MessageTaskStatus.PENDING;
      task.errorMessage = null;
      task.errorCategory = null;
      task.attemptCount = 0;
      await this.taskRepo.save(task);

      this.dispatchWithJitter(task.id, messageText, adminId, i, retryableTasks.length, imageUrl);
      retried++;
    }

    return retried;
  }

  private async dispatchWithJitter(
    taskId: number,
    text: string,
    adminId: number,
    batchIndex: number,
    totalTasks: number,
    imageUrl?: string,
  ): Promise<void> {
    const delay = this.jitterService.calculateDelay(batchIndex, Math.max(10, Math.floor(totalTasks / 5)));

    setTimeout(async () => {
      try {
        await this.dispatchSingleTask(taskId, text, adminId, imageUrl);
      } catch (err) {
        this.logger.error(`Dispatch error for task ${taskId}: ${(err as Error).message}`);
      }
    }, delay);
  }

  private async dispatchSingleTask(
    taskId: number,
    text: string,
    adminId: number,
    imageUrl?: string,
  ): Promise<void> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['group', 'admin'],
    });
    if (!task || !task.group) return;

    const attempt = await this.attemptTracker.recordStart(taskId);

    // Resolve the actual OpenWA session ID from the admin's linked session
    // Look up the admin's current session — the task's cached reference
    // may be stale if the session was recreated (e.g. after a failure).
    let sessionId: string | null = null;
    try {
      const sessions = await this.adminSessionService.getAdminSessions(adminId);
      const ready = sessions.find(s => s.openwaSessionStatus === 'ready');
      const first = ready || sessions[0];
      sessionId = first?.openwaSessionId || null;
    } catch {
      sessionId = null;
    }
    if (!sessionId) {
      this.logger.warn(`No active session found for admin #${adminId}, skipping task ${taskId}`);
      return;
    }

    // Check rate limits before delivering
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      this.logger.warn(`Admin account #${adminId} not found, skipping task ${taskId}`);
      return;
    }

    const warmUpMultiplier = this.rateLimiter.getWarmUpMultiplier(
      admin.warmUpStartedAt,
      admin.skipWarmup
    );

    const rateCheck = this.rateLimiter.check(adminId, warmUpMultiplier);
    if (!rateCheck.allowed) {
      this.logger.warn(`Rate limit check failed for admin #${adminId}: ${rateCheck.reason}, skipping task ${taskId}`);
      return;
    }

    const result: DeliveryResult = await this.automationService.deliverMessage(
      sessionId,
      task.group.groupJid,
      text,
      adminId,
      task.workerId || `admin-${adminId}-sess-0`,
      imageUrl,
    );

    if (result.success) {
      await this.attemptTracker.recordSuccess(attempt.id, result.messageId, result.responseTime);
      await this.maintenanceService.markGroupSuccess(task.group.id);
    } else {
      const shouldRetry = task.attemptCount < task.maxAttempts;
      await this.attemptTracker.recordFailure(
        attempt.id,
        result.errorCategory || ErrorCategory.UNKNOWN,
        result.errorMessage || 'Unknown error',
        taskId,
        shouldRetry,
        result.responseTime,
      );
      await this.maintenanceService.markGroupFailed(task.group.id);
    }

    // Update broadcast counters
    await this.updateBroadcastCounters(task.broadcast?.id);
  }

  async retryFailedTasks(): Promise<number> {
    const failed = await this.taskRepo.find({
      where: {
        status: MessageTaskStatus.FAILED,
        attemptCount: In([1, 2]), // Only retry if under max
      },
      relations: ['broadcast', 'group', 'admin'],
    });

    let retried = 0;
    for (const task of failed) {
      if (task.attemptCount >= task.maxAttempts) continue;

      task.status = MessageTaskStatus.PENDING;
      task.errorMessage = null;
      task.errorCategory = null;
      await this.taskRepo.save(task);
      retried++;
    }

    return retried;
  }

  private async updateBroadcastCounters(broadcastId?: number): Promise<void> {
    if (!broadcastId) return;

    const [sent, failed] = await Promise.all([
      this.taskRepo.count({ where: { broadcast: { id: broadcastId }, status: MessageTaskStatus.SENT } }),
      this.taskRepo.count({ where: { broadcast: { id: broadcastId }, status: MessageTaskStatus.FAILED } }),
    ]);

    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (broadcast) {
      broadcast.sentCount = sent;
      broadcast.failedCount = failed;

      const total = broadcast.totalMessages;
      if (sent + failed >= total) {
        broadcast.status = failed > 0 ? BroadcastStatus.PARTIAL : BroadcastStatus.COMPLETED;
        broadcast.completedAt = new Date();
      }

      await this.broadcastRepo.save(broadcast);
    }
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
}
