import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageTemplate } from '@database/entities/wa-automation/message-template.entity';

@Injectable()
export class TemplateService {
  private readonly defaultTemplate = `*{news.title}*

{news.bullets}

📰 *Source:* {news.source}
🕐 *Published:* {news.time}

🔗 *Read more:* {news.url}`;

  constructor(
    @InjectRepository(MessageTemplate, 'data')
    private readonly templateRepo: Repository<MessageTemplate>,
  ) {}

  async findAll(): Promise<MessageTemplate[]> {
    return this.templateRepo.find({ order: { updatedAt: 'DESC' } });
  }

  async findOne(id: number): Promise<MessageTemplate> {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  async getActive(): Promise<MessageTemplate> {
    let active = await this.templateRepo.findOne({ where: { isActive: true } });
    if (!active) {
      // Create default template if none exists
      active = this.templateRepo.create({
        name: 'Default Marathi Template',
        templateText: this.defaultTemplate,
        isActive: true,
      });
      active = await this.templateRepo.save(active);
    }
    return active;
  }

  async create(data: { name: string; templateText: string }): Promise<MessageTemplate> {
    const tpl = this.templateRepo.create({ ...data, isActive: false });
    return this.templateRepo.save(tpl);
  }

  async update(id: number, data: { name?: string; templateText?: string }): Promise<MessageTemplate> {
    const tpl = await this.findOne(id);
    if (data.name !== undefined) tpl.name = data.name;
    if (data.templateText !== undefined) tpl.templateText = data.templateText;
    return this.templateRepo.save(tpl);
  }

  async activate(id: number): Promise<MessageTemplate> {
    // Deactivate all templates first
    await this.templateRepo
      .createQueryBuilder()
      .update(MessageTemplate)
      .set({ isActive: false })
      .execute();
    // Then activate the chosen one
    const tpl = await this.findOne(id);
    tpl.isActive = true;
    return this.templateRepo.save(tpl);
  }

  async deactivate(id: number): Promise<MessageTemplate> {
    const tpl = await this.findOne(id);
    tpl.isActive = false;
    return this.templateRepo.save(tpl);
  }

  async delete(id: number): Promise<void> {
    const result = await this.templateRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Template not found');
  }
}
