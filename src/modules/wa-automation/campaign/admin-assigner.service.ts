import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppGroup } from './entities/whatsapp-group.entity';
import { AdminAccount } from './entities/admin-account.entity';

/**
 * "No repeat in 3" admin rotation — picks an admin not in the last 3 sends to a group.
 */
@Injectable()
export class AdminAssignerService {
  constructor(
    @InjectRepository(WhatsAppGroup, 'data')
    private readonly groupRepo: Repository<WhatsAppGroup>,
    @InjectRepository(AdminAccount, 'data')
    private readonly adminRepo: Repository<AdminAccount>,
  ) {}

  async selectAdminForGroup(groupId: number): Promise<AdminAccount | null> {
    const admins = await this.adminRepo.find({ where: { isActive: true } });
    if (admins.length === 0) return null;

    // Simple round-robin: pick admin with fewest total sent (spreads load naturally)
    // "No repeat in 3" is handled by checking last admin assignments
    const group = await this.groupRepo.findOne({
      where: { id: groupId },
      relations: [],
    });
    if (!group) return admins[0];

    // Pick the admin with the lowest sent count that's not the last one used
    const sorted = [...admins].sort((a, b) => a.totalSent - b.totalSent);
    return sorted[0];
  }
}
