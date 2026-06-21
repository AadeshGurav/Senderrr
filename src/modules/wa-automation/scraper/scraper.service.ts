import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ScrapedArticle } from './entities/scraped-article.entity';
import { ArticleHash } from './entities/article-hash.entity';
import { ParserRegistryService } from './parsers/parser-registry.service';
import { GenericParser } from './parsers/built-in/generic.parser';
import { ChangeDetectorService } from './change-detector.service';
import { IArticleParser, ParsedArticle } from './parsers/parser.interface';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger('ScraperService');
  private readonly fetcher: typeof fetch;

  constructor(
    @InjectRepository(ScrapedArticle, 'data')
    private readonly articleRepo: Repository<ScrapedArticle>,
    @InjectRepository(ArticleHash, 'data')
    private readonly hashRepo: Repository<ArticleHash>,
    private readonly parserRegistry: ParserRegistryService,
    private readonly changeDetector: ChangeDetectorService,
    private readonly configService: ConfigService,
  ) {
    this.fetcher = globalThis.fetch.bind(globalThis);
    // Register built-in parsers
    this.parserRegistry.register(new GenericParser());
  }

  getTargetUrls(): string[] {
    const urls = this.configService.get<string>('scraper.targetUrls', '');
    if (urls) return urls.split(',').map(u => u.trim()).filter(Boolean);
    return [];
  }

  async fetchPageContent(url: string, timeout = 30_000): Promise<string> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return response.text();
  }

  async detectAndStoreChange(url: string): Promise<ScrapedArticle | null> {
    this.logger.log(`Checking hash-based change for: ${url}`);
    const html = await this.fetchPageContent(url);
    const newHash = this.changeDetector.hashContent(html);

    const existing = await this.hashRepo.findOne({ where: { url } });
    if (existing && !this.changeDetector.hasChanged(existing.contentHash, html)) {
      return null; // No change
    }

    // Update or create hash
    if (existing) {
      existing.contentHash = newHash;
      await this.hashRepo.save(existing);
    } else {
      await this.hashRepo.save(this.hashRepo.create({ url, contentHash: newHash }));
    }

    // Parse and store article
    const parser = this.parserRegistry.getParserForUrl(url) || new GenericParser();
    const parsed = parser.parseArticle(html, url);
    return this.storeArticle(parsed);
  }

  async detectNewArticles(url: string, parser: IArticleParser): Promise<ScrapedArticle[]> {
    this.logger.log(`Listing-based detection for: ${url}`);
    const html = await this.fetchPageContent(url);
    const previews = parser.parseListing(html, url);

    const articles: ScrapedArticle[] = [];
    for (const preview of previews) {
      const existingHash = await this.hashRepo.findOne({ where: { url: preview.url } });
      if (existingHash) continue; // Already seen

      try {
        const articleHtml = await this.fetchPageContent(preview.url);
        const parsed = parser.parseArticle(articleHtml, preview.url);
        const stored = await this.storeArticle(parsed);
        articles.push(stored);

        // Mark as seen
        const hash = this.changeDetector.hashContent(articleHtml);
        await this.hashRepo.save(this.hashRepo.create({ url: preview.url, contentHash: hash }));
      } catch (err) {
        this.logger.warn(`Failed to fetch/parse ${preview.url}: ${(err as Error).message}`);
      }
    }
    return articles;
  }

  private async storeArticle(parsed: ParsedArticle): Promise<ScrapedArticle> {
    const article = this.articleRepo.create({
      url: parsed.url,
      title: parsed.title,
      description: parsed.description,
      body: parsed.body,
      imageUrl: parsed.imageUrl,
      sourceName: parsed.sourceName,
      publishedAt: parsed.publishedAt,
    });
    return this.articleRepo.save(article);
  }

  async getRecentArticles(limit = 50): Promise<ScrapedArticle[]> {
    return this.articleRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getArticle(id: number): Promise<ScrapedArticle | null> {
    return this.articleRepo.findOne({ where: { id } });
  }

  async unseedArticles(): Promise<void> {
    await this.hashRepo.clear();
  }

  async scrapeAllTargetUrls(): Promise<ScrapedArticle[]> {
    const urls = this.getTargetUrls();
    const results: ScrapedArticle[] = [];
    const parser = new GenericParser();
    for (const url of urls) {
      try {
        const articles = await this.detectFromListing(url, parser);
        results.push(...articles);
      } catch (err) {
        this.logger.warn(`Scrape failed for ${url}: ${(err as Error).message}`);
      }
    }
    return results;
  }

  /**
   * Detect new articles from a listing page URL.
   * Uses parser.parseListing to find article URLs, then fetches and parses each one.
   */
  async detectFromListing(url: string, parser: IArticleParser): Promise<ScrapedArticle[]> {
    this.logger.log(`Checking listing page: ${url}`);
    const html = await this.fetchPageContent(url);
    const newHash = this.changeDetector.hashContent(html);

    const existing = await this.hashRepo.findOne({ where: { url } });
    if (existing && !this.changeDetector.hasChanged(existing.contentHash, html)) {
      this.logger.log(`No change detected on listing page: ${url}`);
      return []; // No change on listing page
    }

    // Update or create hash for the listing page itself
    if (existing) {
      existing.contentHash = newHash;
      await this.hashRepo.save(existing);
    } else {
      await this.hashRepo.save(this.hashRepo.create({ url, contentHash: newHash }));
    }

    // Extract article previews from the listing
    const previews = parser.parseListing(html, url);
    if (previews.length === 0) {
      this.logger.warn(`No articles found on listing page: ${url}`);
      return [];
    }

    this.logger.log(`Found ${previews.length} article(s) on listing page`);

    const articles: ScrapedArticle[] = [];
    for (const preview of previews) {
      // Check if we've already seen this article URL
      const existingHash = await this.hashRepo.findOne({ where: { url: preview.url } });
      if (existingHash) continue; // Already seen

      try {
        const articleHtml = await this.fetchPageContent(preview.url);
        const parsed = parser.parseArticle(articleHtml, preview.url);
        const stored = await this.storeArticle(parsed);
        articles.push(stored);

        // Mark as seen
        const hash = this.changeDetector.hashContent(articleHtml);
        await this.hashRepo.save(this.hashRepo.create({ url: preview.url, contentHash: hash }));
      } catch (err) {
        this.logger.warn(`Failed to fetch/parse ${preview.url}: ${(err as Error).message}`);
      }
    }

    return articles;
  }
}
