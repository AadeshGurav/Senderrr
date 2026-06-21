import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';

@ApiTags('wa-automation / settings')
@Controller('wa/settings')
@UseGuards(WaAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all runtime settings' })
  async findAll() {
    return this.settingsService.all();
  }

  @Put()
  @ApiOperation({ summary: 'Bulk update runtime settings' })
  async update(@Body() body: Array<{ key: string; value: string }>) {
    await this.settingsService.bulkSet(body);
    return { success: true };
  }
}
