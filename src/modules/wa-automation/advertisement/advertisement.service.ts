import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import * as fs from 'fs/promises';
import { Advertisement, AdvertisementStatus, AdvertisementTargetType } from './entities/advertisement.entity';
import { MediaAttachment } from './entities/media-attachment.entity';
import { WhatsAppGroup } from '../campaign/entities/whatsapp-group.entity';
import { WhatsAppCommunity } from '../campaign/entities/whatsapp-community.entity';
import { BroadcastEvent, BroadcastStatus } from '../campaign/entities/broadcast-event.entity';
import { MessageTask, MessageTaskStatus } from '../campaign/entities/message-task.entity';
import { AdminAssignerService } from '../campaign/admin-assigner.service';
import { BroadcastDispatcherService } from '../campaign/broadcast-dispatcher.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdvertisementService {
  private readonly logger = new Logger('AdvertisementService');
  private readonly MEDIA_EXTENSIONS: Map<string, string> = new Map([
    ['jpg', 'image'], ['jpeg', 'image'], ['png', 'image'], ['gif', 'image'], ['webp', 'image'],
    ['mp4', 'video'], ['mov', 'video'], ['avi', 'video'], ['mkv', 'video'],
    ['pdf', 'document'], ['doc', 'document'], ['docx', 'document'], ['txt', 'document'],
  ]);

  constructor(
    @InjectRepository(Advertisement, 'data')
    private readonly adRepo: Repository<Advertisement>,
    @InjectRepository(MediaAttachment, 'data')
    private readonly mediaRepo: Repository<MediaAttachment>,
    @InjectRepository(WhatsAppGroup, 'data')
    private readonly groupRepo: Repository<WhatsAppGroup>,
    @InjectRepository(WhatsAppCommunity, 'data')
    private readonly communityRepo: Repository<WhatsAppCommunity>,
    @InjectRepository(BroadcastEvent, 'data')
    private readonly broadcastRepo: Repository<BroadcastEvent>,
    @InjectRepository(MessageTask, 'data')
    private readonly taskRepo: Repository<MessageTask>,
    private readonly adminAssigner: AdminAssignerService,
    private readonly dispatcher: BroadcastDispatcherService,
  ) {}

  async findAll(): Promise<Advertisement[]> {
    await this.checkExpired();
    return this.adRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['targetGroups', 'targetCommunities', 'mediaAttachments'],
    });
  }

  async findOne(id: number): Promise<Advertisement | null> {
    await this.checkExpired();
    return this.adRepo.findOne({
      where: { id },
      relations: ['targetGroups', 'targetCommunities', 'mediaAttachments'],
    });
  }

  async create(data: Partial<Advertisement>): Promise<Advertisement> {
    const ad = this.adRepo.create(data);
    return this.adRepo.save(ad);
  }

  async update(id: number, data: Partial<Advertisement>): Promise<Advertisement | null> {
    const ad = await this.findOne(id);
    if (!ad) return null;
    Object.assign(ad, data);
    return this.adRepo.save(ad);
  }

  async delete(id: number): Promise<boolean> {
    await this.mediaRepo.delete({ advertisement: { id } });
    await this.broadcastRepo.update({ advertisementId: id }, { advertisementId: null as any });
    const result = await this.adRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async getStatistics(id: number): Promise<{ daysUsed: number; daysRemaining: number; isSendable: boolean }> {
    const ad = await this.findOne(id);
    if (!ad) return { daysUsed: 0, daysRemaining: 0, isSendable: false };
    return {
      daysUsed: ad.daysUsed,
      daysRemaining: Math.max(0, ad.packageDays - ad.daysUsed),
      isSendable: ad.status === AdvertisementStatus.DRAFT || (ad.status === AdvertisementStatus.ACTIVE && ad.daysUsed < ad.packageDays),
    };
  }

  /**
   * Auto-transition ACTIVE ads whose package days have been fully used to COMPLETED.
   * Called automatically at the start of findAll() and findOne().
   */
  async checkExpired(): Promise<void> {
    try {
      const expired = await this.adRepo
        .createQueryBuilder('ad')
        .where('ad.status = :active', { active: AdvertisementStatus.ACTIVE })
        .andWhere('ad.daysUsed >= ad.packageDays')
        .getMany();
      for (const ad of expired) {
        ad.status = AdvertisementStatus.COMPLETED;
        await this.adRepo.save(ad);
        this.logger.log(`Ad #${ad.id}: auto-transitioned to COMPLETED (${ad.daysUsed}/${ad.packageDays} days used)`);
      }
    } catch (err) {
      this.logger.warn(`checkExpired error: ${(err as Error).message}`);
    }
  }

  /**
   * Get detailed telemetry for an ad campaign including per-group breakdown.
   */
  async getTelemetry(id: number): Promise<{
    totalSent: number;
    totalFailed: number;
    todaySent: number;
    todayFailed: number;
    daysRemaining: number;
    totalGroups: number;
    perGroup: Array<{ groupName: string; totalSent: number; totalFailed: number; todaySent: number }>;
    packageDays: number;
    daysUsed: number;
    status: string;
  }> {
    const ad = await this.findOne(id);
    if (!ad) {
      return { totalSent: 0, totalFailed: 0, todaySent: 0, todayFailed: 0, daysRemaining: 0, totalGroups: 0, perGroup: [], packageDays: 0, daysUsed: 0, status: 'unknown' };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // All broadcasts for this ad
    const broadcasts = await this.broadcastRepo.find({
      where: { advertisementId: id },
    });
    const broadcastIds = broadcasts.map(b => b.id);

    if (broadcastIds.length === 0) {
      return {
        totalSent: 0, totalFailed: 0, todaySent: 0, todayFailed: 0,
        daysRemaining: Math.max(0, ad.packageDays - ad.daysUsed),
        totalGroups: 0, perGroup: [],
        packageDays: ad.packageDays, daysUsed: ad.daysUsed, status: ad.status,
      };
    }

    // Total counts
    const [totalSent, totalFailed] = await Promise.all([
      this.taskRepo.count({
        where: { broadcast: { id: In(broadcastIds) }, status: MessageTaskStatus.SENT },
      }),
      this.taskRepo.count({
        where: { broadcast: { id: In(broadcastIds) }, status: MessageTaskStatus.FAILED },
      }),
    ]);

    // Today counts
    const [todaySent, todayFailed] = await Promise.all([
      this.taskRepo.count({
        where: { broadcast: { id: In(broadcastIds) }, status: MessageTaskStatus.SENT, lastAttemptAt: MoreThanOrEqual(todayStart) },
      }),
      this.taskRepo.count({
        where: { broadcast: { id: In(broadcastIds) }, status: MessageTaskStatus.FAILED, lastAttemptAt: MoreThanOrEqual(todayStart) },
      }),
    ]);

    // Per-group breakdown — compatible with both SQLite and PostgreSQL
    const perGroupRaw = await this.taskRepo
      .createQueryBuilder('task')
      .select('"group".name', 'groupName')
      .addSelect('COUNT(CASE WHEN task.status = \'sent\' THEN 1 END)', 'totalSent')
      .addSelect('COUNT(CASE WHEN task.status = \'failed\' THEN 1 END)', 'totalFailed')
      .addSelect('COUNT(CASE WHEN task.status = \'sent\' AND task.lastAttemptAt >= :todayStart THEN 1 END)', 'todaySent')
      .leftJoin('task.group', '"group"')
      .where('task.broadcastId IN (:...broadcastIds)', { broadcastIds })
      .groupBy('"group".name')
      .orderBy('"group".name', 'ASC')
      .setParameter('todayStart', todayStart)
      .getRawMany();

    const perGroup = perGroupRaw.map((r: any) => ({
      groupName: r.groupName || 'Unknown',
      totalSent: parseInt(r.totalSent, 10) || 0,
      totalFailed: parseInt(r.totalFailed, 10) || 0,
      todaySent: parseInt(r.todaySent, 10) || 0,
    }));

    return {
      totalSent,
      totalFailed,
      todaySent,
      todayFailed,
      daysRemaining: Math.max(0, ad.packageDays - ad.daysUsed),
      totalGroups: perGroup.length,
      perGroup,
      packageDays: ad.packageDays,
      daysUsed: ad.daysUsed,
      status: ad.status,
    };
  }

  /**
   * Called by user "Send" button. Activates the ad and dispatches immediately
   * through the existing anti-ban/rate-limited broadcast pipeline.
   * No day-count restriction — admins can send as many times as they want per day.
   */
  async sendAdvertisement(id: number): Promise<{ success: boolean; message: string }> {
    const ad = await this.findOne(id);
    if (!ad) {
      return { success: false, message: 'Advertisement not found' };
    }
    if (ad.status === AdvertisementStatus.COMPLETED || ad.status === AdvertisementStatus.CANCELLED) {
      return { success: false, message: 'Advertisement is completed or cancelled' };
    }

    // Activate the ad if it's in DRAFT status
    if (ad.status === AdvertisementStatus.DRAFT) {
      ad.status = AdvertisementStatus.ACTIVE;
      await this.adRepo.save(ad);
    }

    await this.dispatchDay(ad);

    this.logger.log(`Advertisement #${id} queued for broadcast`);
    return { success: true, message: 'Queued for broadcast' };
  }

  /**
   * Dispatch one day's broadcast for this ad — creates a BroadcastEvent + MessageTasks
   * and sends through BroadcastDispatcherService which handles rate limiting, anti-ban,
   * human-like pacing, quiet hours, etc.
   *
   * Shared by both user send and scheduler day-dispatch.
   */
  async dispatchDay(ad: Advertisement): Promise<void> {
    const groups = await this.resolveTargetGroups(ad);
    if (groups.length === 0) {
      this.logger.warn(`Ad #${ad.id}: no eligible target groups`);
      return;
    }

    // Resolve first media attachment for imageUrl
    let imageUrl: string | undefined;
    const media = await this.mediaRepo.findOne({
      where: { advertisement: { id: ad.id } },
      order: { createdAt: 'ASC' },
    });
    if (media?.filePath) {
      try {
        const fileBuffer = await fs.readFile(media.filePath);
        const mimeType = this.getMimeType(media.filePath);
        imageUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      } catch (err) {
        this.logger.warn(`Ad #${ad.id}: could not read media file ${media.filePath}: ${(err as Error).message}`);
      }
    }

    const broadcast = this.broadcastRepo.create({
      advertisementId: ad.id,
      messageText: ad.body,
      status: BroadcastStatus.PENDING,
      totalMessages: groups.length,
    });
    const saved = await this.broadcastRepo.save(broadcast);

    let tasksCreated = 0;
    for (const group of groups) {
      const admin = await this.adminAssigner.selectAdminForGroup(group.id);
      if (!admin) {
        this.logger.warn(`Ad #${ad.id}: no available admin for group #${group.id} (${group.name}), skipping`);
        continue;
      }
      const task = this.taskRepo.create({
        broadcast: { id: saved.id },
        group: { id: group.id },
        admin: { id: admin.id },
        status: MessageTaskStatus.PENDING,
        workerId: `admin-${admin.id}-sess-0`,
      });
      await this.taskRepo.save(task);
      tasksCreated++;
    }

    if (tasksCreated === 0) {
      this.logger.warn(`Ad #${ad.id}: no tasks could be created, marking broadcast as failed`);
      saved.status = BroadcastStatus.FAILED;
      saved.completedAt = new Date();
      await this.broadcastRepo.save(saved);
      return;
    }

    // Fire-and-forget dispatch through the existing broadcast dispatcher
    // This reuses the full anti-ban pipeline: rate limits, jitter, human-like pacing,
    // quiet hours, group health, retry with backoff, etc.
    // Pass the ad body as messageText and first media as imageUrl
    this.dispatcher.dispatchBroadcast(saved.id, ad.body, imageUrl).catch((err: Error) => {
      this.logger.error(`Ad broadcast #${saved.id} crashed: ${err.message}`);
      this.broadcastRepo.update(saved.id, {
        status: BroadcastStatus.FAILED,
        completedAt: new Date(),
      }).catch(e => this.logger.error(`Failed to mark ad broadcast #${saved.id} as failed: ${e.message}`));
    });

    await this.markDayUsed(ad.id);
    this.logger.log(`Dispatched ad #${ad.id} day ${ad.daysUsed}/${ad.packageDays} (broadcast #${saved.id}, ${tasksCreated} tasks)`);
  }

  async addMedia(id: number, filePath: string, originalFilename: string, mediaType: string): Promise<MediaAttachment> {
    const ad = await this.findOne(id);
    if (!ad) {
      throw new Error('Advertisement not found');
    }

    const media = this.mediaRepo.create({
      advertisement: ad,
      filePath,
      originalFilename,
      mediaType,
    });

    return this.mediaRepo.save(media);
  }

  async removeMedia(id: number): Promise<boolean> {
    const result = await this.mediaRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  private detectMediaType(filename: string): string {
    const parts = filename.split('.');
    const suffix = parts.length > 1 ? parts[parts.length - 1]?.toLowerCase() : '';
    for (const [ext, type] of this.MEDIA_EXTENSIONS.entries()) {
      if (suffix === ext) {
        return type;
      }
    }
    return 'document';
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp',
      mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Mark ad as used for the day — only increments daysUsed if this is the
   * first dispatch on a new calendar day. Multiple sends within the same day
   * do NOT consume extra package days.
   */
  async markDayUsed(id: number): Promise<void> {
    const ad = await this.adRepo.findOne({ where: { id } });
    if (!ad) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDispatch = ad.lastDispatchedAt ? new Date(ad.lastDispatchedAt) : null;
    const isNewDay = !lastDispatch || lastDispatch < today;

    if (isNewDay) {
      ad.daysUsed++;
      ad.lastDispatchedAt = new Date();
      // Only auto-complete if daysUsed exceeds packageDays AND it's a new day
      if (ad.daysUsed >= ad.packageDays) {
        ad.status = AdvertisementStatus.COMPLETED;
      }
      await this.adRepo.save(ad);
      this.logger.log(`Ad #${id}: daysUsed=${ad.daysUsed}/${ad.packageDays} (new day)`);
    } else {
      // Same day, just update lastDispatchedAt timestamp without consuming a day
      ad.lastDispatchedAt = new Date();
      await this.adRepo.save(ad);
      this.logger.log(`Ad #${id}: re-dispatched same day (daysUsed stays ${ad.daysUsed}/${ad.packageDays})`);
    }
  }

  /**
   * Resolve the actual WhatsAppGroup targets for this advertisement based on targetType.
   *
   * - ALL_GROUPS: all groups that are targeted (via the admin's target selection)
   * - ALL_COMMUNITIES: sub-groups of all active communities
   * - SPECIFIC: union of selected groups + sub-groups of selected communities
   */
  private async resolveTargetGroups(ad: Advertisement): Promise<WhatsAppGroup[]> {
    switch (ad.targetType) {
      case AdvertisementTargetType.ALL_GROUPS:
        return this.groupRepo.find({
          where: { isActive: true, isHealthy: true, isTargeted: true },
        });

      case AdvertisementTargetType.ALL_COMMUNITIES: {
        const communities = await this.communityRepo.find({ where: { isActive: true } });
        const communityIds = communities.map(c => c.id);
        if (communityIds.length === 0) return [];
        return this.groupRepo.find({
          where: { isActive: true, isHealthy: true, community: { id: In(communityIds) } },
        });
      }

      case AdvertisementTargetType.SPECIFIC: {
        const groupIds = ad.targetGroups?.map(g => g.id) || [];
        const communityIds = ad.targetCommunities?.map(c => c.id) || [];
        const groups: WhatsAppGroup[] = [];

        if (groupIds.length > 0) {
          const directGroups = await this.groupRepo.find({
            where: { id: In(groupIds), isActive: true, isHealthy: true },
          });
          groups.push(...directGroups);
        }

        if (communityIds.length > 0) {
          const communityGroups = await this.groupRepo.find({
            where: { community: { id: In(communityIds) }, isActive: true, isHealthy: true },
          });
          const seen = new Set(groups.map(g => g.id));
          for (const g of communityGroups) {
            if (!seen.has(g.id)) {
              groups.push(g);
              seen.add(g.id);
            }
          }
        }

        return groups;
      }

      default:
        return [];
    }
  }
}
