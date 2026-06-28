import {
  Controller, Get, Post, Put, Delete,
  Param, Body, ParseIntPipe, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TemplateService } from './template.service';
import { TemplateRendererService, NewsPlaceholders } from './template-renderer.service';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';

@ApiTags('wa-automation / templates')
@Controller('wa/templates')
@UseGuards(WaAuthGuard)
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly renderer: TemplateRendererService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all templates' })
  async findAll() {
    return this.templateService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active template with rendered preview' })
  async getActive() {
    return this.templateService.getActive();
  }

  @Post()
  @ApiOperation({ summary: 'Create a template' })
  async create(@Body() body: { name: string; templateText: string }) {
    return this.templateService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a template' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; templateText?: string }) {
    return this.templateService.update(id, body);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a template' })
  async activate(@Param('id', ParseIntPipe) id: number) {
    return this.templateService.activate(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a template' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.templateService.deactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.templateService.delete(id);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview rendered template with sample data' })
  async preview(@Body() body: { templateText: string }) {
    const sample: NewsPlaceholders = {
      title: 'Sample News Headline',
      description: 'This is a sample description for preview purposes.',
      url: 'https://example.com/article/123',
      imageUrl: 'https://example.com/image.jpg',
      source: 'Sample Source',
      publishedAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
    return { rendered: this.renderer.render(body.templateText, sample) };
  }
}
