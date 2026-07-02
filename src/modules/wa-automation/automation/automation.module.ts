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
import { WorkerSession } from './entities/worker-session.entity';
import { WorkerSessionLog } from './entities/worker-session-log.entity';
import { AdminSession } from './entities/admin-session.entity';
import { AdminAccount } from '../campaign/entities/admin-account.entity';
import { WhatsAppGroup } from '../campaign/entities/whatsapp-group.entity';
import { WhatsAppGroupMember } from '../campaign/entities/whatsapp-group-member.entity';
import { EngineModule } from '../../../engine/engine.module';
import { SessionModule } from '../../session/session.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkerSession,
      WorkerSessionLog,
      AdminSession,
      AdminAccount,
      WhatsAppGroup,
      WhatsAppGroupMember,
    ], 'data'),
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
