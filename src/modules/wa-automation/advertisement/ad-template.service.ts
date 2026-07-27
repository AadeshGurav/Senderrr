/* eslint-disable */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdTemplate } from '@database/entities/wa-automation/ad-template.entity';
import { Advertisement } from '@database/entities/wa-automation/advertisement.entity';

@Injectable()
export class AdTemplateService {
  constructor(
    @InjectRepository(AdTemplate, 'data')
    private readonly tplRepo: Repository<AdTemplate>,
    @InjectRepository(Advertisement, 'data')
    private readonly adRepo: Repository<Advertisement>,
  ) {}

  async findByAd(adId: number): Promise<AdTemplate[]> {
    return this.tplRepo.find({
      where: { advertisement: { id: adId } },
      relations: ['media'],
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    adId: number,
    data: { name: string; body?: string; mediaId?: number },
  ): Promise<AdTemplate> {
    const ad = await this.adRepo.findOne({ where: { id: adId } });
    if (!ad) throw new NotFoundException('Advertisement not found');

    const tpl = this.tplRepo.create({
      advertisement: { id: adId },
      name: data.name,
      body: data.body ?? null,
      mediaId: data.mediaId ?? null,
      isActive: false,
    });
    return this.tplRepo.save(tpl);
  }

  async update(
    id: number,
    data: { name?: string; body?: string; mediaId?: number },
  ): Promise<AdTemplate> {
    const tpl = await this.tplRepo.findOne({ where: { id }, relations: ['media'] });
    if (!tpl) throw new NotFoundException('Template not found');
    if (data.name !== undefined) tpl.name = data.name;
    if (data.body !== undefined) tpl.body = data.body;
    if (data.mediaId !== undefined) tpl.mediaId = data.mediaId;
    return this.tplRepo.save(tpl);
  }

  async activate(adId: number, id: number): Promise<AdTemplate> {
    // Deactivate all templates for this ad
    await this.tplRepo
      .createQueryBuilder()
      .update(AdTemplate)
      .set({ isActive: false })
      .where('advertisementId = :adId', { adId })
      .execute();

    // Activate the chosen one
    const tpl = await this.tplRepo.findOne({ where: { id }, relations: ['media'] });
    if (!tpl) throw new NotFoundException('Template not found');
    tpl.isActive = true;
    return this.tplRepo.save(tpl);
  }

  async deactivate(id: number): Promise<AdTemplate> {
    const tpl = await this.tplRepo.findOne({ where: { id }, relations: ['media'] });
    if (!tpl) throw new NotFoundException('Template not found');
    tpl.isActive = false;
    return this.tplRepo.save(tpl);
  }

  async delete(id: number): Promise<void> {
    const tpl = await this.tplRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    await this.tplRepo.remove(tpl);
  }
}
