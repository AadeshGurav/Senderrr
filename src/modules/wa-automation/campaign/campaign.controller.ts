/* eslint-disable */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Query,
  DefaultValuePipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignService } from './campaign.service';
import { BroadcastStatus } from '@database/entities/wa-automation/broadcast-event.entity';
import { MessageTask, MessageTaskStatus } from '@database/entities/wa-automation/message-task.entity';
import { AdminAccount } from '@database/entities/wa-automation/admin-account.entity';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { WhatsAppCommunity } from '@database/entities/wa-automation/whatsapp-community.entity';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';
import { AdminAssignerService } from './admin-assigner.service';
import { MaintenanceService } from './maintenance.service';

@ApiTags('wa-automation / campaigns')
@Controller('wa/campaigns')
@UseGuards(WaAuthGuard)
export class CampaignController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly adminAssigner: AdminAssignerService,
    private readonly maintenanceService: MaintenanceService,
    @InjectRepository(AdminAccount, 'data')
    private readonly adminRepo: Repository<AdminAccount>,
    @InjectRepository(WhatsAppGroup, 'data')
    private readonly groupRepo: Repository<WhatsAppGroup>,
    @InjectRepository(WhatsAppCommunity, 'data')
    private readonly communityRepo: Repository<WhatsAppCommunity>,
    @InjectRepository(MessageTask, 'data')
    private readonly taskRepo: Repository<MessageTask>,
  ) {}

  // ─── Admins ───

  @Get('admins')
  @ApiOperation({ summary: 'List admin accounts' })
  async listAdmins() {
    return this.adminRepo.find({ order: { id: 'ASC' } });
  }

  @Post('admins')
  @ApiOperation({ summary: 'Create admin account' })
  async createAdmin(
    @Body()
    body: {
      label: string;
      phoneNumber: string;
      sessionsPerAdmin?: number;
      autoCreateSession?: boolean;
      isSuperAdmin?: boolean;
    },
  ) {
    const admin = this.adminRepo.create({
      label: body.label,
      phoneNumber: body.phoneNumber,
      sessionsPerAdmin: Math.min(body.sessionsPerAdmin || 1, 4),
      isSuperAdmin: body.isSuperAdmin ?? false,
    });
    return this.adminRepo.save(admin);
  }

  @Post('admins/:id/toggle')
  async toggleAdmin(@Param('id', ParseIntPipe) id: number) {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (admin) {
      admin.isActive = !admin.isActive;
      await this.adminRepo.save(admin);
    }
    return admin;
  }

  @Post('admins/:id/warmup')
  @ApiOperation({ summary: 'Toggle warmup mode for an admin' })
  async toggleWarmup(@Param('id', ParseIntPipe) id: number) {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (admin) {
      admin.skipWarmup = !admin.skipWarmup;
      if (admin.skipWarmup) {
        admin.warmUpStartedAt = null;
        admin.warmUpDay = 0;
      } else if (!admin.warmUpStartedAt) {
        admin.warmUpStartedAt = new Date();
      }
      await this.adminRepo.save(admin);
    }
    return admin;
  }

  @Post('admins/:id/super-admin')
  @ApiOperation({ summary: 'Toggle super admin status' })
  async toggleSuperAdmin(@Param('id', ParseIntPipe) id: number, @Body() body: { isSuperAdmin: boolean }) {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (admin) {
      admin.isSuperAdmin = body.isSuperAdmin;
      await this.adminRepo.save(admin);
    }
    return admin;
  }

  // ─── Groups ───

  @Get('groups')
  @ApiOperation({ summary: 'List WhatsApp groups' })
  async listGroups() {
    return this.groupRepo.find({ order: { name: 'ASC' }, relations: ['community'] });
  }

  @Post('groups')
  @ApiOperation({ summary: 'Register a WhatsApp group' })
  async createGroup(@Body() body: { name: string; groupJid: string; communityId?: number }) {
    const group = this.groupRepo.create({
      name: body.name,
      groupJid: body.groupJid,
      community: body.communityId ? { id: body.communityId } : null,
    });
    return this.groupRepo.save(group);
  }

  @Post('groups/:id/toggle')
  async toggleGroup(@Param('id', ParseIntPipe) id: number) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (group) {
      group.isActive = !group.isActive;
      await this.groupRepo.save(group);
    }
    return group;
  }

  @Post('groups/:id/mark-healthy')
  async markGroupHealthy(@Param('id', ParseIntPipe) id: number) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (group) {
      group.isHealthy = true;
      group.consecutiveFailures = 0;
      await this.groupRepo.save(group);
    }
    return group;
  }

  @Post('groups/:id/link-community')
  async linkGroupCommunity(@Param('id', ParseIntPipe) id: number, @Body() body: { communityId: number }) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (group) {
      group.community = { id: body.communityId } as any;
      await this.groupRepo.save(group);
    }
    return group;
  }

  @Post('groups/:id/unlink-community')
  async unlinkGroupCommunity(@Param('id', ParseIntPipe) id: number) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (group) {
      group.community = null;
      await this.groupRepo.save(group);
    }
    return group;
  }

  @Post('groups/set-targets')
  @ApiOperation({ summary: 'Set which groups receive article broadcasts' })
  async setGroupTargets(@Body() body: { groupIds: number[] }) {
    const allGroups = await this.groupRepo.find();
    for (const group of allGroups) {
      group.isTargeted = body.groupIds.includes(group.id);
    }
    await this.groupRepo.save(allGroups);
    return { targeted: body.groupIds.length };
  }

  // ─── Communities ───

  @Get('communities')
  @ApiOperation({ summary: 'List communities' })
  async listCommunities() {
    return this.communityRepo.find({ order: { name: 'ASC' } });
  }

  @Post('communities')
  @ApiOperation({ summary: 'Create a community' })
  async createCommunity(@Body() body: { name: string; communityJid: string }) {
    const comm = this.communityRepo.create(body);
    return this.communityRepo.save(comm);
  }

  @Post('communities/:id/broadcast')
  @ApiOperation({ summary: 'Trigger broadcast to all sub-groups of a community' })
  async communityBroadcast(@Param('id', ParseIntPipe) id: number) {
    const community = await this.communityRepo.findOne({ where: { id } });
    if (!community) {
      return { success: false, message: 'Community not found' };
    }

    const groups = await this.groupRepo.find({
      where: { community: { id } as any, isActive: true },
    });

    if (groups.length === 0) {
      return { success: false, message: 'No active groups in this community' };
    }

    const result = await this.campaignService.createCommunityBroadcast(community, groups);
    return {
      communityId: id,
      communityName: community.name,
      affectedGroups: groups.length,
      broadcastId: result.broadcastId,
      tasksCreated: result.tasksCreated,
    };
  }

  // ─── Broadcasts ───

  @Get('broadcasts')
  @ApiOperation({ summary: 'List broadcast events' })
  async listBroadcasts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('status') status?: BroadcastStatus,
  ) {
    return this.campaignService.getAllBroadcasts(page, Math.min(limit, 100), status);
  }

  @Get('broadcasts/:id')
  @ApiOperation({ summary: 'Get broadcast details with tasks' })
  async getBroadcast(@Param('id', ParseIntPipe) id: number) {
    const broadcast = await this.campaignService.getBroadcast(id);
    const tasks = await this.campaignService.getTasksForBroadcast(id);
    return { broadcast, tasks };
  }

  @Post('broadcasts/:id/retry')
  @ApiOperation({ summary: 'Retry failed messages immediately' })
  async retryBroadcast(@Param('id', ParseIntPipe) id: number) {
    const retried = await this.campaignService.retryBroadcastTasks(id);
    return { retried };
  }

  @Patch('broadcasts/:id/edit')
  @ApiOperation({ summary: 'Edit broadcast message text (updates in all groups via WhatsApp edit)' })
  async editBroadcast(@Param('id', ParseIntPipe) id: number, @Body() body: { messageText: string }) {
    if (!body.messageText?.trim()) throw new BadRequestException('messageText is required');
    return this.campaignService.editBroadcastText(id, body.messageText);
  }

  @Delete('broadcasts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete broadcast (removes from all groups + soft-deletes)' })
  async deleteBroadcast(@Param('id', ParseIntPipe) id: number) {
    return this.campaignService.deleteBroadcast(id);
  }

  // ─── Maintenance ───

  @Post('broadcasts/retry-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry all failed broadcasts (respects anti-ban pacing)' })
  async retryAllFailed() {
    return this.campaignService.retryAllFailed();
  }

  @Post('recover-groups')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger group recovery' })
  async recoverGroups() {
    const count = await this.maintenanceService.autoRecoverUnhealthyGroups();
    return { recovered: count };
  }
}
