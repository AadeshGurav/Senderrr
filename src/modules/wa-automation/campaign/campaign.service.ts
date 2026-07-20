import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { BroadcastEvent, BroadcastStatus } from '@database/entities/wa-automation/broadcast-event.entity';
import { MessageTask, MessageTaskStatus } from '@database/entities/wa-automation/message-task.entity';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { WhatsAppCommunity } from '@database/entities/wa-automation/whatsapp-community.entity';
import { AdminAccount } from '@database/entities/wa-automation/admin-account.entity';
import { AdminAssignerService } from './admin-assigner.service';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { TemplateRendererService, NewsPlaceholders } from '../template/template-renderer.service';
import { TemplateService } from '../template/template.service';
import { SettingsService } from '../settings/settings.service';
import { AdminSessionService } from '../automation/admin-session.service';
import { AutomationService } from '../automation/automation.service';

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
    private readonly adminSessionService: AdminSessionService,
    private readonly automationService: AutomationService,
  ) {}

  async getEligibleGroups(): Promise<WhatsAppGroup[]> {
    return this.groupRepo.find({
      where: { isActive: true, isHealthy: true, isTargeted: true },
    });
  }

  async getAllBroadcasts(
    page = 1,
    limit = 25,
    status?: BroadcastStatus,
  ): Promise<{ data: BroadcastEvent[]; total: number; page: number; limit: number }> {
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
    const messageText = await this.templateRenderer.render(template.templateText, {
      title: '',
      description: '',
      bullets: '',
      url: '',
      imageUrl: '',
      source: '',
      publishedAt: '',
      time: '',
    });

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
      this.broadcastRepo
        .update(saved.id, {
          status: BroadcastStatus.FAILED,
          completedAt: new Date(),
        })
        .catch(e => this.logger.error(`Failed to mark community broadcast #${saved.id} as failed: ${e.message}`));
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
        article: { id: article.id },
        status: BroadcastStatus.FAILED,
        totalMessages: 0,
      });
      return this.broadcastRepo.save(broadcast);
    }

    // Compose message content
    const tz = await this.settingsService.get('TIMEZONE', 'Asia/Kolkata');
    const template = await this.templateService.getActive();
    const bulletsText = (article as any).bulletPoints?.length
      ? (article as any).bulletPoints.map((bp: string) => `• ${bp}`).join('\n')
      : article.description || '';
    const placeholders: NewsPlaceholders = {
      title: article.title || '',
      description: article.description || '',
      bullets: bulletsText,
      url: article.url,
      imageUrl: article.imageUrl || '',
      source: article.sourceName || '',
      publishedAt: article.publishedAt?.toISOString() || '',
      time: article.publishedAt
        ? article.publishedAt.toLocaleTimeString('en-IN', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '',
    };
    const messageText = await this.templateRenderer.render(template.templateText, placeholders);

    // Create broadcast event
    const broadcast = this.broadcastRepo.create({
      article: { id: article.id },
      messageText,
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

    // Fire-and-forget dispatch (non-blocking) — no imageUrl: WhatsApp link preview
    // renders a rich preview from the article's OG meta tags instead.
    this.dispatcher.dispatchBroadcast(saved.id, messageText).catch(err => {
      this.logger.error(`Broadcast #${saved.id} dispatch crashed: ${err.message}`, err.stack);
      this.broadcastRepo
        .update(saved.id, {
          status: BroadcastStatus.FAILED,
          completedAt: new Date(),
        })
        .catch(e => this.logger.error(`Failed to mark broadcast #${saved.id} as failed: ${e.message}`));
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

    const retryableTasks = tasks.filter(
      t => t.status !== MessageTaskStatus.SENT && t.status !== MessageTaskStatus.CANCELLED,
    );

    if (retryableTasks.length === 0 && broadcast.status === BroadcastStatus.FAILED && broadcast.article) {
      return this.retryFromArticle(broadcast);
    }

    if (retryableTasks.length === 0) return 0;

    // Use stored messageText if available (immutable snapshot from creation time)
    let messageText = broadcast.messageText;

    if (!messageText && broadcast.article) {
      messageText = await this.composeArticleText(broadcast.article);
    }

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

    this.dispatcher.dispatchBroadcast(broadcastId, messageText).catch(err => {
      this.logger.error(`Retry broadcast #${broadcastId} crashed: ${err.message}`, err.stack);
      this.broadcastRepo
        .update(broadcastId, {
          status: BroadcastStatus.FAILED,
          completedAt: new Date(),
        })
        .catch(e => this.logger.error(`Failed to mark retry broadcast #${broadcastId} as failed: ${e.message}`));
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
      task.nextRetryAt = null;
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
        this.logger.log(
          `Broadcast #${broadcast.id}: ${pendingCount} pending, but all waiting on retry backoff — skipping`,
        );
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

      // eslint-disable-next-line no-useless-assignment
      let messageText: string | null = null;

      // Use stored messageText if available (article broadcasts, ads, communities)
      if (broadcastWithArticle.messageText) {
        messageText = broadcastWithArticle.messageText;
      } else if (broadcastWithArticle.article) {
        messageText = await this.composeArticleText(broadcastWithArticle.article);
      } else {
        // Fallback to active template
        messageText = await this.composeBroadcastText();
      }

      if (!messageText) continue;

      this.logger.log(`Re-dispatching broadcast #${broadcast.id} — ${pendingCount} pending tasks`);
      this.dispatcher.dispatchBroadcast(broadcast.id, messageText).catch(err => {
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

  // ─── Edit / Delete Broadcast ──────────────────────────────────

  /**
   * Edit a broadcast's message text across all groups where it was successfully sent.
   * Previous text is pushed into editHistory, then each sent message is updated via WhatsApp's edit API.
   */
  async editBroadcastText(broadcastId: number, newText: string): Promise<{ edited: number; failed: number }> {
    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    // Push old text to edit history
    const history: Array<{ text: string; editedAt: string }> = broadcast.editHistory || [];
    if (broadcast.messageText) {
      history.push({ text: broadcast.messageText, editedAt: new Date().toISOString() });
    }
    broadcast.messageText = newText;
    broadcast.editHistory = history;
    await this.broadcastRepo.save(broadcast);

    // Find SENT tasks with a waMessageId
    const tasks = await this.taskRepo.find({
      where: { broadcast: { id: broadcastId }, status: MessageTaskStatus.SENT },
      relations: ['group', 'admin'],
    });
    const tasksWithId = tasks.filter(t => t.waMessageId);
    if (tasksWithId.length === 0) return { edited: 0, failed: 0 };

    // Group by admin for session resolution
    const byAdmin = new Map<number, MessageTask[]>();
    for (const task of tasksWithId) {
      const adminId = task.admin?.id;
      if (!adminId) continue;
      const list = byAdmin.get(adminId) || [];
      list.push(task);
      byAdmin.set(adminId, list);
    }

    let edited = 0;
    let failed = 0;

    for (const [adminId, adminTasks] of byAdmin) {
      const sessions = await this.adminSessionService.getAdminSessions(adminId);
      const readySession = sessions.find(s => s.openwaSessionStatus === 'ready');
      if (!readySession) {
        failed += adminTasks.length;
        continue;
      }

      for (const task of adminTasks) {
        const result = await this.automationService.editMessage(
          readySession.openwaSessionId,
          task.group.groupJid,
          task.waMessageId!,
          newText,
        );
        if (result.success) edited++;
        else failed++;
      }
    }

    this.logger.log(`Edited broadcast #${broadcastId}: ${edited} edited, ${failed} failed`);
    return { edited, failed };
  }

  /**
   * Soft-delete a broadcast: remove messages from all WhatsApp groups and mark as CANCELLED.
   */
  async deleteBroadcast(broadcastId: number): Promise<{ deleted: number; failed: number }> {
    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    const tasks = await this.taskRepo.find({
      where: { broadcast: { id: broadcastId }, status: MessageTaskStatus.SENT },
      relations: ['group', 'admin'],
    });
    const tasksWithId = tasks.filter(t => t.waMessageId);
    if (tasksWithId.length === 0) {
      // Still mark as CANCELLED even if no messages to delete
      broadcast.status = BroadcastStatus.CANCELLED;
      broadcast.completedAt = new Date();
      await this.broadcastRepo.save(broadcast);
      return { deleted: 0, failed: 0 };
    }

    const byAdmin = new Map<number, MessageTask[]>();
    for (const task of tasksWithId) {
      const adminId = task.admin?.id;
      if (!adminId) continue;
      const list = byAdmin.get(adminId) || [];
      list.push(task);
      byAdmin.set(adminId, list);
    }

    let deleted = 0;
    let failed = 0;

    for (const [adminId, adminTasks] of byAdmin) {
      const sessions = await this.adminSessionService.getAdminSessions(adminId);
      const readySession = sessions.find(s => s.openwaSessionStatus === 'ready');
      if (!readySession) {
        failed += adminTasks.length;
        continue;
      }

      for (const task of adminTasks) {
        try {
          const result = await this.automationService.deleteMessage(
            readySession.openwaSessionId,
            task.group.groupJid,
            task.waMessageId!,
          );
          if (result.success) deleted++;
          else failed++;
        } catch {
          failed++;
        }
      }
    }

    // Mark broadcast as CANCELLED (soft delete)
    broadcast.status = BroadcastStatus.CANCELLED;
    broadcast.completedAt = new Date();
    await this.broadcastRepo.save(broadcast);

    this.logger.log(`Deleted broadcast #${broadcastId}: ${deleted} removed, ${failed} failed`);
    return { deleted, failed };
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

    this.dispatcher.dispatchBroadcast(broadcast.id, messageText).catch(err => {
      this.logger.error(`Retry broadcast #${broadcast.id} (from article) crashed: ${err.message}`, err.stack);
      this.broadcastRepo
        .update(broadcast.id, {
          status: BroadcastStatus.FAILED,
          completedAt: new Date(),
        })
        .catch(e => this.logger.error(`Failed to mark retry broadcast #${broadcast.id} as failed: ${e.message}`));
    });

    return created;
  }

  private async composeArticleText(article: any): Promise<string | null> {
    const tz = await this.settingsService.get('TIMEZONE', 'Asia/Kolkata');
    const template = await this.templateService.getActive();
    if (!template) return null;
    const bulletsText = article.bulletPoints?.length
      ? article.bulletPoints.map((bp: string) => `• ${bp}`).join('\n')
      : article.description || '';
    const placeholders: NewsPlaceholders = {
      title: article.title || '',
      description: article.description || '',
      bullets: bulletsText,
      url: article.url,
      imageUrl: article.imageUrl || '',
      source: article.sourceName || '',
      publishedAt: article.publishedAt?.toISOString() || '',
      time: article.publishedAt
        ? article.publishedAt.toLocaleTimeString('en-IN', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '',
    };
    return await this.templateRenderer.render(template.templateText, placeholders);
  }

  /** Compose broadcast message text using the active template (for community broadcasts, fallback). */
  private async composeBroadcastText(): Promise<string | null> {
    const template = await this.templateService.getActive();
    if (!template) return null;
    const placeholders: NewsPlaceholders = {
      title: '',
      description: '',
      bullets: '',
      url: '',
      imageUrl: '',
      source: '',
      publishedAt: '',
      time: '',
    };
    return await this.templateRenderer.render(template.templateText, placeholders);
  }
}
