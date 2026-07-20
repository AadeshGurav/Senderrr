import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { RateLimiterService } from './rate-limiter.service';
import { WorkerTrackerService } from './worker-tracker.service';
import { WorkerMappingService } from './worker-mapping.service';
import { SessionHealthService } from './session-health.service';
import { GroupSyncService } from './group-sync.service';
import { JitterService } from './anti-ban/jitter.service';
import { QuietHoursService } from './anti-ban/quiet-hours.service';
import { AdminSessionService } from './admin-session.service';
import { WorkerSession } from '@database/entities/wa-automation/worker-session.entity';
import { WorkerSessionLog } from '@database/entities/wa-automation/worker-session-log.entity';
import { AdminSession } from '@database/entities/wa-automation/admin-session.entity';
import { AdminAccount } from '@database/entities/wa-automation/admin-account.entity';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { WhatsAppGroupMember } from '@database/entities/wa-automation/whatsapp-group-member.entity';
import { EngineModule } from '@whatsapp-engine/engine.module';
import { SessionModule } from '../../session/session.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [WorkerSession, WorkerSessionLog, AdminSession, AdminAccount, WhatsAppGroup, WhatsAppGroupMember],
      'data',
    ),
    EngineModule,
    forwardRef(() => SessionModule),
    SettingsModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    RateLimiterService,
    WorkerTrackerService,
    WorkerMappingService,
    SessionHealthService,
    GroupSyncService,
    JitterService,
    QuietHoursService,
    AdminSessionService,
  ],
  exports: [
    AutomationService,
    RateLimiterService,
    WorkerTrackerService,
    WorkerMappingService,
    SessionHealthService,
    GroupSyncService,
    JitterService,
    QuietHoursService,
    AdminSessionService,
  ],
})
export class AutomationModule {}
