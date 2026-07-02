import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { Advertisement as AdvertisementEntity } from './entities/advertisement.entity';
import { MediaAttachment } from './entities/media-attachment.entity';
import { WhatsAppGroup, WhatsAppCommunity } from '../campaign/entities';
import { BroadcastEvent } from '../campaign/entities/broadcast-event.entity';
import { MessageTask } from '../campaign/entities/message-task.entity';
import { CampaignModule } from '../campaign/campaign.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdvertisementEntity, MediaAttachment,
      WhatsAppGroup, WhatsAppCommunity,
      BroadcastEvent, MessageTask,
    ], 'data'),
    CampaignModule,
  ],
  controllers: [AdvertisementController],
  providers: [AdvertisementService],
  exports: [AdvertisementService],
})
export class AdvertisementModule {}
