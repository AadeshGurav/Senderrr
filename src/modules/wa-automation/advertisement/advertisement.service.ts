import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Advertisement, AdvertisementStatus, AdvertisementTargetType } from './entities/advertisement.entity';
import { MediaAttachment } from './entities/media-attachment.entity';
import { WhatsAppGroup } from '../campaign/entities';
import { WhatsAppCommunity } from '../campaign/entities';
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

    // TODO: Dispatch messages to all targets (this will be integrated with the broadcast system)
    this.logger.log(`Queued advertisement #${id} for sending`);
    return { success: true, message: 'Queued for sending' };
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

  /** Due ads that haven't been sent today */
  async findDue(): Promise<Advertisement[]> {
    return this.adRepo.find({
      where: { status: AdvertisementStatus.ACTIVE },
      relations: ['targetGroups', 'targetCommunities'],
    });
  }
}
