/* eslint-disable */
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Multer } from 'multer';
import { AdvertisementService } from './advertisement.service';
import { AdTemplateService } from './ad-template.service';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';
import type { Advertisement } from '@database/entities/wa-automation/advertisement.entity';

@ApiTags('wa-automation / advertisements')
@Controller('wa/advertisements')
@UseGuards()
export class AdvertisementController {
  constructor(
    private readonly adService: AdvertisementService,
    private readonly tplService: AdTemplateService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all advertisements' })
  async findAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adService.findAll(status, search);
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

  @Get(':id/telemetry')
  @ApiOperation({ summary: 'Get detailed advertisement telemetry with per-group breakdown' })
  async getTelemetry(@Param('id', ParseIntPipe) id: number) {
    return this.adService.getTelemetry(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get advertisement logs' })
  async getLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.adService.getLogs(id, page, limit);
  }

  @Post()
  @ApiOperation({ summary: 'Create advertisement' })
  async create(@Body() body: Partial<Advertisement>) {
    return this.adService.create(body);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send advertisement to targets' })
  async send(@Param('id', ParseIntPipe) id: number) {
    return this.adService.sendAdvertisement(id);
  }

  @Post(':id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'data', 'media'),
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname);
          cb(null, `ad-${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
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
  async addMedia(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: any) {
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
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<Advertisement>) {
    return this.adService.update(id, body);
  }

  // ─── Template CRUD ───────────────────────────────────────────────

  @Get(':id/templates')
  @ApiOperation({ summary: 'List templates for an advertisement' })
  async listTemplates(@Param('id', ParseIntPipe) id: number) {
    return this.tplService.findByAd(id);
  }

  @Post(':id/templates')
  @ApiOperation({ summary: 'Create a template for an advertisement' })
  async createTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name: string; body?: string; mediaId?: number },
  ) {
    return this.tplService.create(id, body);
  }

  @Put(':id/templates/:tplId')
  @ApiOperation({ summary: 'Update a template' })
  async updateTemplate(
    @Param('id', ParseIntPipe) _id: number,
    @Param('tplId', ParseIntPipe) tplId: number,
    @Body() body: { name?: string; body?: string; mediaId?: number },
  ) {
    return this.tplService.update(tplId, body);
  }

  @Post(':id/templates/:tplId/activate')
  @ApiOperation({ summary: 'Activate a template for an advertisement' })
  async activateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Param('tplId', ParseIntPipe) tplId: number,
  ) {
    return this.tplService.activate(id, tplId);
  }

  @Delete(':id/templates/:tplId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template' })
  async deleteTemplate(
    @Param('id', ParseIntPipe) _id: number,
    @Param('tplId', ParseIntPipe) tplId: number,
  ) {
    await this.tplService.delete(tplId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete advertisement' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.adService.delete(id);
  }
}
