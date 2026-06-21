import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [ChannelController],
})
export class ChannelModule {}
