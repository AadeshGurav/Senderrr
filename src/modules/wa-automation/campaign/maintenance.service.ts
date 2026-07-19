import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { ConfigService } from '@nestjs/config';

/**
 * Auto-recover groups that have been unhealthy for more than the configured window.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger('MaintenanceService');
  private readonly maxConsecutiveFailures: number;
  private readonly recoveryHours: number;

  constructor(
    @InjectRepository(WhatsAppGroup, 'data')
    private readonly groupRepo: Repository<WhatsAppGroup>,
    configService: ConfigService,
  ) {
    this.maxConsecutiveFailures = configService.get<number>('automation.groupMaxConsecutiveFailures', 10);
    this.recoveryHours = configService.get<number>('automation.groupUnhealthyRecoveryHours', 2);
  }

  async autoRecoverUnhealthyGroups(): Promise<number> {
    const cutoff = new Date(Date.now() - this.recoveryHours * 3600_000);
    const staleUnhealthy = await this.groupRepo.find({
      where: {
        isHealthy: false,
        lastFailureAt: LessThan(cutoff),
      },
    });

    for (const group of staleUnhealthy) {
      group.isHealthy = true;
      group.consecutiveFailures = 0;
      await this.groupRepo.save(group);
    }

    if (staleUnhealthy.length > 0) {
      this.logger.log(`Auto-recovered ${staleUnhealthy.length} unhealthy groups`);
    }

    return staleUnhealthy.length;
  }

  async markGroupFailed(groupId: number): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) return;

    group.consecutiveFailures++;
    group.totalFailed++;
    group.lastFailureAt = new Date();

    if (group.consecutiveFailures >= this.maxConsecutiveFailures) {
      group.isHealthy = false;
      this.logger.warn(`Group ${group.name} (${group.groupJid}) marked unhealthy after ${group.consecutiveFailures} failures`);
    }

    await this.groupRepo.save(group);
  }

  async markGroupSuccess(groupId: number): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) return;

    group.consecutiveFailures = 0;
    group.totalSent++;
    group.lastSentAt = new Date();
    await this.groupRepo.save(group);
  }
}
