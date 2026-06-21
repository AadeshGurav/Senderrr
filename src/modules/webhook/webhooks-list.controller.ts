import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { Webhook } from './entities/webhook.entity';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksListController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @ApiOperation({ summary: 'List all webhooks across all sessions' })
  @ApiResponse({
    status: 200,
    description: 'List of all webhooks',
  })
  async findAll(): Promise<Webhook[]> {
    return this.webhookService.findAll();
  }
}
