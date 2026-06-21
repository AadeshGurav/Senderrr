import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ScraperService } from './scraper.service';
import { ParserRegistryService } from './parsers/parser-registry.service';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';

@ApiTags('wa-automation / scraper')
@Controller('wa/scraper')
@UseGuards(WaAuthGuard)
export class ScraperController {
  constructor(
    private readonly scraperService: ScraperService,
    private readonly parserRegistry: ParserRegistryService,
  ) {}

  @Get('articles')
  @ApiOperation({ summary: 'Recent scraped articles' })
  async getArticles() {
    return this.scraperService.getRecentArticles();
  }

  @Post('run')
  @ApiOperation({ summary: 'Manually trigger scraper for a URL' })
  async runScraper(@Body() body: { url: string }) {
    const article = await this.scraperService.detectAndStoreChange(body.url);
    if (article) {
      return { detected: true, article };
    }
    return { detected: false, message: 'No new content' };
  }

  @Post('run-all')
  @ApiOperation({ summary: 'Run scraper on all configured target URLs' })
  async runAll() {
    const articles = await this.scraperService.scrapeAllTargetUrls();
    return { scraped: articles.length, articles };
  }

  @Post('unseed')
  @ApiOperation({ summary: 'Clear all seen hashes and re-scrape all targets' })
  async unseed() {
    await this.scraperService.unseedArticles();
    const articles = await this.scraperService.scrapeAllTargetUrls();
    return { success: true, scraped: articles.length, articles };
  }

  @Get('parsers')
  @ApiOperation({ summary: 'List registered parsers' })
  async getParsers() {
    return { parsers: this.parserRegistry.listRegistered() };
  }
}
