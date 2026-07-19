import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { Session } from '@database/entities/session/session.entity';
import { Message } from '@database/entities/message/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Session, Message], 'data')],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
