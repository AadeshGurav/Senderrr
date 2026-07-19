import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';
import { ParserRegistryService } from './parsers/parser-registry.service';
import { GenericParser } from './parsers/built-in/generic.parser';
import { ChangeDetectorService } from './change-detector.service';
import { ScrapedArticle } from '@database/entities/wa-automation/scraped-article.entity';
import { ArticleHash } from '@database/entities/wa-automation/article-hash.entity';
import { ScraperActivityLog } from '@database/entities/wa-automation/scraper-activity-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ScrapedArticle, ArticleHash, ScraperActivityLog], 'data')],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    ParserRegistryService,
    ChangeDetectorService,
  ],
  exports: [ScraperService, ParserRegistryService, ChangeDetectorService],
})
export class ScraperModule {}
