import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WhatsAppGroupMember } from './entities/whatsapp-group-member.entity';
import { AdminAccount } from './entities/admin-account.entity';
import { RateLimiterService } from '../automation/rate-limiter.service';
import { MessageTask, MessageTaskStatus } from './entities/message-task.entity';

@Injectable()
export class AdminAssignerService {
  private readonly logger = new Logger('AdminAssignerService');

  constructor(
    @InjectRepository(WhatsAppGroupMember, 'data')
    private readonly memberRepo: Repository<WhatsAppGroupMember>,
    @InjectRepository(AdminAccount, 'data')
    private readonly adminRepo: Repository<AdminAccount>,
    @InjectRepository(MessageTask, 'data')
    private readonly taskRepo: Repository<MessageTask>,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async selectAdminForGroup(groupId: number): Promise<AdminAccount | null> {
    let eligibleIds: number[] = [];

    try {
      const members = await this.memberRepo.find({ where: { groupId } });
      eligibleIds = members.map(m => m.adminId);
    } catch (err) {
      this.logger.warn(`Group member lookup failed (schema issue?), falling back to all admins: ${(err as Error).message}`);
    }

    if (eligibleIds.length === 0) {
      const all = await this.adminRepo.find({ where: { isActive: true } });
      eligibleIds = all.map(a => a.id);
      if (eligibleIds.length === 0) return null;
    }

    const eligibleAdmins = await this.adminRepo.find({
      where: { id: In(eligibleIds), isActive: true },
    });
    if (eligibleAdmins.length === 0) return null;

    let best: AdminAccount | null = null;
    let bestScore = -Infinity;

    for (const admin of eligibleAdmins) {
      const warmUpMultiplier = this.rateLimiter.getWarmUpMultiplier(
        admin.warmUpStartedAt,
        admin.skipWarmup,
      );
      const counts = this.rateLimiter.getCounts(admin.id);
      const hourlyHeadroom = 1 - (counts.hourly / (counts.hourlyLimit * warmUpMultiplier));

      const pendingLoad = await this.taskRepo.count({
        where: {
          admin: { id: admin.id },
          status: In([MessageTaskStatus.PENDING, MessageTaskStatus.IN_PROGRESS]),
        },
      });
      const loadFactor = Math.max(0, 1 - pendingLoad / 100);

      const score = hourlyHeadroom * 2 + loadFactor;
      if (score > bestScore) {
        bestScore = score;
        best = admin;
      }
    }

    return best;
  }
}
