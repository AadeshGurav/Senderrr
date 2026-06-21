import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ScraperModule } from '../scraper/scraper.module';
import { CampaignModule } from '../campaign/campaign.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ScraperModule,
    CampaignModule,
    AutomationModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
