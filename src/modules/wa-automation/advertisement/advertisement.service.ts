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
    return this.adRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['targetGroups', 'targetCommunities', 'mediaAttachments'],
    });
  }

  async findOne(id: number): Promise<Advertisement | null> {
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
   * Called by user "Send" button. Activates the ad and dispatches the first day's broadcast
   * through the existing anti-ban/rate-limited broadcast pipeline.
   */
  async sendAdvertisement(id: number): Promise<{ success: boolean; message: string }> {
    const ad = await this.findOne(id);
    if (!ad) {
      return { success: false, message: 'Advertisement not found' };
    }
    if (!ad.isSendable) {
      return { success: false, message: 'Advertisement cannot be sent' };
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

  /**
   * Dispatch the next day for an active ad (called by scheduler).
   * Guards against double-dispatch on the same day.
   */
  async dispatchNextDay(id: number): Promise<void> {
    const ad = await this.findOne(id);
    if (!ad || ad.status !== AdvertisementStatus.ACTIVE) return;

    if (ad.daysUsed >= ad.packageDays) {
      ad.status = AdvertisementStatus.COMPLETED;
      await this.adRepo.save(ad);
      this.logger.log(`Ad #${id}: package days exhausted, marking completed`);
      return;
    }

    // Check if already dispatched today to prevent double-send
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await this.broadcastRepo.findOne({
      where: { advertisementId: id, createdAt: MoreThanOrEqual(todayStart) },
    });
    if (existing) {
      this.logger.debug(`Ad #${id}: already dispatched today, skipping`);
      return;
    }

    await this.dispatchDay(ad);
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

  /** Mark ad as used for the day */
  async markDayUsed(id: number): Promise<void> {
    const ad = await this.findOne(id);
    if (ad) {
      ad.daysUsed++;
      if (ad.daysUsed >= ad.packageDays) {
        ad.status = AdvertisementStatus.COMPLETED;
      }
      await this.adRepo.save(ad);
    }
  }

  /** Due ads that are active and haven't exhausted package days */
  async findDue(): Promise<Advertisement[]> {
    return this.adRepo.find({
      where: { status: AdvertisementStatus.ACTIVE },
      relations: ['targetGroups', 'targetCommunities'],
    });
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
