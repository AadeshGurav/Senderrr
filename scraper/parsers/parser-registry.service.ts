import { Injectable } from '@nestjs/common';
import { IArticleParser } from './parser.interface';

@Injectable()
export class ParserRegistryService {
  private parsers = new Map<string, IArticleParser>();

  register(parser: IArticleParser): void {
    this.parsers.set(parser.domain, parser);
  }

  getParserForUrl(url: string): IArticleParser | undefined {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      for (const [domain, parser] of this.parsers) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return parser;
        }
      }
    } catch {
      // Invalid URL
    }
    return undefined;
  }

  listRegistered(): string[] {
    return Array.from(this.parsers.keys());
  }
}
