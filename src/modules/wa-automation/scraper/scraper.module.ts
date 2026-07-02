import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';
import { ParserRegistryService } from './parsers/parser-registry.service';
import { GenericParser } from './parsers/built-in/generic.parser';
import { ChangeDetectorService } from './change-detector.service';
import { ScrapedArticle } from './entities/scraped-article.entity';
import { ArticleHash } from './entities/article-hash.entity';
import { ScraperActivityLog } from './entities/scraper-activity-log.entity';

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
