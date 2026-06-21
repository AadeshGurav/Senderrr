import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { RuntimeSetting } from './entities/runtime-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RuntimeSetting], 'data')],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
