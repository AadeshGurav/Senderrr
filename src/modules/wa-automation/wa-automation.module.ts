import { Module } from '@nestjs/common';
import { WaAuthModule } from './wa-auth/wa-auth.module';
import { SettingsModule } from './settings/settings.module';
import { TemplateModule } from './template/template.module';
import { ScraperModule } from '@scraper/scraper.module';
import { AutomationModule } from './automation/automation.module';
import { CampaignModule } from './campaign/campaign.module';
import { AdvertisementModule } from './advertisement/advertisement.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    WaAuthModule,
    SettingsModule,
    TemplateModule,
    ScraperModule,
    AutomationModule,
    CampaignModule,
    AdvertisementModule,
    SchedulerModule,
  ],
  exports: [
    WaAuthModule,
    SettingsModule,
    TemplateModule,
    ScraperModule,
    AutomationModule,
    CampaignModule,
    AdvertisementModule,
  ],
})
export class WaAutomationModule {}
