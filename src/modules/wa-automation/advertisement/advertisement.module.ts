import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { Advertisement as AdvertisementEntity } from './entities/advertisement.entity';
import { MediaAttachment } from './entities/media-attachment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdvertisementEntity, MediaAttachment], 'data')],
  controllers: [AdvertisementController],
  providers: [AdvertisementService],
  exports: [AdvertisementService],
})
export class AdvertisementModule {}
