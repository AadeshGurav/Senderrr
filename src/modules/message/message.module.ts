import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageService } from './message.service';
import { BulkMessageService } from './bulk-message.service';
import { MessageController } from './message.controller';
import { SessionModule } from '../session/session.module';
import { Message } from '@database/entities/message/message.entity';
import { MessageBatch } from '@database/entities/message/message-batch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Message, MessageBatch], 'data'), SessionModule],
  controllers: [MessageController],
  providers: [MessageService, BulkMessageService],
  exports: [MessageService, BulkMessageService],
})
export class MessageModule {}
