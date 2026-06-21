import {
  Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdvertisementService } from './advertisement.service';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';

@ApiTags('wa-automation / advertisements')
@Controller('wa/advertisements')
@UseGuards(WaAuthGuard)
export class AdvertisementController {
  constructor(private readonly adService: AdvertisementService) {}

  @Get()
  @ApiOperation({ summary: 'List all advertisements' })
  async findAll() {
    return this.adService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get advertisement details' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create advertisement' })
  async create(@Body() body: Partial<import('./entities/advertisement.entity').Advertisement>) {
    return this.adService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update advertisement' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<import('./entities/advertisement.entity').Advertisement>) {
    return this.adService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete advertisement' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.adService.delete(id);
  }
}
