import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { AdminAssignerService } from './admin-assigner.service';
import { AttemptTrackerService } from './attempt-tracker.service';
import { MaintenanceService } from './maintenance.service';
import { AdminAccount } from '@database/entities/wa-automation/admin-account.entity';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { WhatsAppCommunity } from '@database/entities/wa-automation/whatsapp-community.entity';
import { BroadcastEvent } from '@database/entities/wa-automation/broadcast-event.entity';
import { MessageTask } from '@database/entities/wa-automation/message-task.entity';
import { MessageAttempt } from '@database/entities/wa-automation/message-attempt.entity';
import { WhatsAppGroupMember } from '@database/entities/wa-automation/whatsapp-group-member.entity';
import { TemplateModule } from '../template/template.module';
import { AutomationModule } from '../automation/automation.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        AdminAccount,
        WhatsAppGroup,
        WhatsAppCommunity,
        BroadcastEvent,
        MessageTask,
        MessageAttempt,
        WhatsAppGroupMember,
      ],
      'data',
    ),
    TemplateModule,
    AutomationModule,
    SettingsModule,
  ],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    BroadcastDispatcherService,
    AdminAssignerService,
    AttemptTrackerService,
    MaintenanceService,
  ],
  exports: [
    CampaignService,
    BroadcastDispatcherService,
    AdminAssignerService,
    AttemptTrackerService,
    MaintenanceService,
  ],
})
export class CampaignModule {}
