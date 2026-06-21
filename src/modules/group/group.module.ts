import { Module } from '@nestjs/common';
import { GroupController } from './group.controller';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [GroupController],
})
export class GroupModule {}
