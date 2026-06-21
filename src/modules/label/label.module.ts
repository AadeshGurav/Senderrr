import { Module } from '@nestjs/common';
import { LabelController } from './label.controller';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [LabelController],
})
export class LabelModule {}
