import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Advertisement, AdvertisementStatus } from './entities/advertisement.entity';

@Injectable()
export class AdvertisementService {
  private readonly logger = new Logger('AdvertisementService');

  constructor(
    @InjectRepository(Advertisement, 'data')
    private readonly adRepo: Repository<Advertisement>,
  ) {}

  async findAll(): Promise<Advertisement[]> {
    return this.adRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<Advertisement | null> {
    return this.adRepo.findOne({ where: { id }, relations: ['targetGroups', 'targetCommunities'] });
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
    // Simplified: active ads that still have days remaining
    return this.adRepo.find({
      where: { status: AdvertisementStatus.ACTIVE },
    });
  }
}
