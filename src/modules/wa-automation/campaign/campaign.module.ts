import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { AdminAssignerService } from './admin-assigner.service';
import { AttemptTrackerService } from './attempt-tracker.service';
import { MaintenanceService } from './maintenance.service';
import { AdminAccount } from './entities/admin-account.entity';
import { WhatsAppGroup } from './entities/whatsapp-group.entity';
import { WhatsAppCommunity } from './entities/whatsapp-community.entity';
import { BroadcastEvent } from './entities/broadcast-event.entity';
import { MessageTask } from './entities/message-task.entity';
import { MessageAttempt } from './entities/message-attempt.entity';
import { TemplateModule } from '../template/template.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminAccount, WhatsAppGroup, WhatsAppCommunity,
      BroadcastEvent, MessageTask, MessageAttempt,
    ], 'data'),
    TemplateModule,
    AutomationModule,
  ],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    AdminAssignerService,
    AttemptTrackerService,
    MaintenanceService,
  ],
  exports: [
    CampaignService,
    AdminAssignerService,
    AttemptTrackerService,
    MaintenanceService,
  ],
})
export class CampaignModule {}
