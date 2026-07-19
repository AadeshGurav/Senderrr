import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookProcessor } from './processors/webhook.processor';
import { QUEUE_NAMES } from './queue-names';
import { Webhook } from '@database/entities/webhook/webhook.entity';
import { HooksModule } from '../../core/hooks/hooks.module';

// Re-export for backward compatibility
export { QUEUE_NAMES } from './queue-names';

/**
 * QueueModule — provides async webhook delivery via BullMQ + Redis.
 *
 * On the free tier without Redis, this module is skipped and webhooks
 * fall back to synchronous inline delivery (WebhookService handles this).
 *
 * Redis connection failures are handled gracefully: if BullMQ can't connect,
 * the module logs a warning and continues without queue support.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook], 'data'),
    HooksModule,

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('redis.host', 'localhost');
        const port = configService.get<number>('redis.port', 6379);
        const password = configService.get<string>('redis.password');

        return {
          connection: {
            host,
            port,
            password: password || undefined,
            // Max retries with backoff when Redis is unavailable
            maxRetriesPerRequest: null, // Required for BullMQ
            // Connection timeout — fail fast so the app still starts
            connectTimeout: 5000,
            // Lazy connect — don't fail on startup if Redis is unreachable
            lazyConnect: true,
          },
        };
      },
    }),

    BullModule.registerQueue({ name: QUEUE_NAMES.WEBHOOK }),

    // Bull Board admin UI — skip in production for security
    ...(process.env.NODE_ENV !== 'production'
      ? [
          BullBoardModule.forRoot({
            route: '/admin/queues',
            adapter: ExpressAdapter,
          }),
          BullBoardModule.forFeature({
            name: QUEUE_NAMES.WEBHOOK,
            adapter: BullMQAdapter,
          }),
        ]
      : []),
  ],
  providers: [WebhookProcessor],
  exports: [BullModule],
})
export class QueueModule {}