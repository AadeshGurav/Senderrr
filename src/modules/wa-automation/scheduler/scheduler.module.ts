import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { ScraperModule } from '../scraper/scraper.module';
import { CampaignModule } from '../campaign/campaign.module';
import { AutomationModule } from '../automation/automation.module';
import { SettingsModule } from '../settings/settings.module';
import { BroadcastEvent } from '../campaign/entities/broadcast-event.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([BroadcastEvent], 'data'),
    ConfigModule,
    ScraperModule,
    CampaignModule,
    AutomationModule,
    SettingsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
