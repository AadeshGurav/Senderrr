import {
  Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Multer } from 'multer';
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

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get advertisement statistics' })
  async getStatistics(@Param('id', ParseIntPipe) id: number) {
    return this.adService.getStatistics(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create advertisement' })
  async create(@Body() body: Partial<import('./entities/advertisement.entity').Advertisement>) {
    return this.adService.create(body);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send advertisement to targets' })
  async send(@Param('id', ParseIntPipe) id: number) {
    return this.adService.sendAdvertisement(id);
  }

  @Post(':id/media')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Add media attachment to advertisement' })
  async addMedia(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new Error('File is required');
    }

    const mediaType = this.adService['detectMediaType'](file.originalname);
    const media = await this.adService.addMedia(id, file.path, file.originalname, mediaType);
    return media;
  }

  @Delete('media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove media attachment' })
  async removeMedia(@Param('id', ParseIntPipe) id: number) {
    await this.adService.removeMedia(id);
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
