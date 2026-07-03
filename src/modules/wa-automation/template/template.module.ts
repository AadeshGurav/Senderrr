import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateRendererService } from './template-renderer.service';
import { MessageTemplate } from './entities/message-template.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([MessageTemplate], 'data'), SettingsModule],
  controllers: [TemplateController],
  providers: [TemplateService, TemplateRendererService],
  exports: [TemplateService, TemplateRendererService],
})
export class TemplateModule {}
