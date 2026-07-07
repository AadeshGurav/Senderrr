export interface ArticlePreview {
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
  sourceName?: string;
  publishedAt?: Date;
  bulletPoints?: string[];
}

export interface ParsedArticle {
  url: string;
  title: string;
  description: string;
  body: string;
  imageUrl?: string;
  sourceName?: string;
  publishedAt?: Date;
  bulletPoints?: string[];
}

export interface IArticleParser {
  /** The domain this parser handles (e.g. 'ratnagirikhabardar.com') */
  domain: string;

  /** Parse a listing page to discover article URLs */
  parseListing(html: string, baseUrl: string): ArticlePreview[];

  /** Parse an article page for full content */
  parseArticle(html: string, url: string): ParsedArticle;

  /** Format article data into a WhatsApp message string */
  formatMessage(article: ParsedArticle): string;
}
