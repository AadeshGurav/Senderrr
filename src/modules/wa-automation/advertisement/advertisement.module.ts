import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { Advertisement as AdvertisementEntity } from '@database/entities/wa-automation/advertisement.entity';
import { MediaAttachment } from '@database/entities/wa-automation/media-attachment.entity';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { WhatsAppCommunity } from '@database/entities/wa-automation/whatsapp-community.entity';
import { BroadcastEvent } from '@database/entities/wa-automation/broadcast-event.entity';
import { MessageTask } from '@database/entities/wa-automation/message-task.entity';
import { CampaignModule } from '../campaign/campaign.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [AdvertisementEntity, MediaAttachment, WhatsAppGroup, WhatsAppCommunity, BroadcastEvent, MessageTask],
      'data',
    ),
    CampaignModule,
  ],
  controllers: [AdvertisementController],
  providers: [AdvertisementService],
  exports: [AdvertisementService],
})
export class AdvertisementModule {}
