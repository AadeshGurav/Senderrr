import { Injectable } from '@nestjs/common';
import { IArticleParser, ArticlePreview, ParsedArticle } from '../parser.interface';

@Injectable()
export class GenericParser implements IArticleParser {
  domain = '*'; // Handles any URL as fallback

  parseListing(html: string, _baseUrl: string): ArticlePreview[] {
    const previews: ArticlePreview[] = [];
    const seen = new Set<string>();

    // Common listing patterns used by WordPress/Newspaper theme and similar:
    // 1. td-block-span / td_module (Newspaper theme)
    // 2. article-card / post-item patterns
    // 3. <h3> with <a> linking to articles
    // 4. Generic <a href="..."> with article-like URL patterns

    const patterns = [
      // td_module blocks: <div class="td_module_1 td_module_wrap ..."> <h3><a href="URL">Title</a></h3>
      /<div[^>]*class="[^"]*\btd_module\b[^"]*"[^>]*>[\s\S]*?<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi,
      // Article card divs with h3/a
      /<div[^>]*class="[^"]*\b(?:td-block-span|post-item|article-card|news-item|blog-item|entry)[^"]*"[^>]*>[\s\S]*?<h[23][^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h[23]>/gi,
      // Generic h3 > a article links (common in many themes)
      /<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi,
      // h2 > a article links
      /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        let url = match[1].trim();
        const title = this.stripHtml(match[2]).trim();

        // Normalize URL
        if (url.startsWith('/')) {
          try {
            const base = new URL(_baseUrl);
            url = `${base.protocol}//${base.host}${url}`;
          } catch {
            continue;
          }
        }

        // Deduplicate and filter out non-article URLs
        if (seen.has(url)) continue;
        if (!url.startsWith('http')) continue;
        // Skip homepage URLs, anchor links, admin pages, etc.
        if (url === _baseUrl || url === _baseUrl + '/' || url.includes('#') || url.includes('login') || url.includes('wp-admin') || url.includes('.css') || url.includes('.js')) continue;
        // Skip very short titles (likely not real articles)
        if (title.length < 5) continue;

        seen.add(url);
        previews.push({ url, title, description: '' });
      }
    }

    return previews;
  }

  parseArticle(html: string, url: string): ParsedArticle {
    // Prefer og:title or <title> over <h1>, which is often the site logo
    const title = this.extract(html, /<meta[^>]+property="(?:og|twitter):title"[^>]+content="([^"]+)"/i)
      || this.extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
      || this.extract(html, /<h1[^>]*>(.*?)<\/h1>/is);

    const description = this.extract(html, /<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
      || this.extract(html, /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);

    // Try common article content containers (WordPress, Newspaper theme, generic CMS)
    const body = this.extractTagContent(html, 'article')
      || this.extractTagContent(html, 'main')
      || this.extractContentByClass(html, 'td-post-content')
      || this.extractContentByClass(html, 'entry-content')
      || this.extractContentByClass(html, 'post-content')
      || this.extractContentByClass(html, 'article-body')
      || this.extractContentByClass(html, 'article-content')
      || this.extractContentByClass(html, 'content')
      || this.extractContentByClass(html, 'td-block-row')
      || this.extractAfterArticleCard(html);

    const imageUrl = this.extract(html, /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
      || this.extract(html, /<meta[^>]+property="twitter:image"[^>]+content="([^"]+)"/i);

    return {
      url,
      title: title || 'Untitled',
      description: description || '',
      body: body || (title || 'Untitled'),
      imageUrl: imageUrl || undefined,
      sourceName: new URL(url).hostname,
      publishedAt: undefined,
    };
  }

  formatMessage(article: ParsedArticle): string {
    const lines = [
      `*${article.title}*`,
      '',
      article.description,
      '',
      `📰 *Source:* ${article.sourceName || 'Web'}`,
    ];
    if (article.url) {
      lines.push('');
      lines.push(`🔗 *Read more:* ${article.url}`);
    }
    return lines.join('\n');
  }

  private extract(html: string, pattern: RegExp): string | undefined {
    const match = html.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private extractTagContent(html: string, tag: string): string | undefined {
    const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
    return match ? this.stripHtml(match[1]).slice(0, 2000) : undefined;
  }

  private extractContentByClass(html: string, className: string): string | undefined {
    // Matches common class patterns like class="td-post-content", class="entry-content", etc.
    const patterns = [
      new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'),
      new RegExp(`class='[^']*\\b${className}\\b[^']*'[^>]*>([\\s\\S]*?)<\\/div>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return this.stripHtml(match[1]).slice(0, 2000);
      }
    }
    return undefined;
  }

  /**
   * Fallback for listing pages: find content after the first article card.
   * Many sites have structures like: <div class="td-block-span6">...article...</div>
   */
  private extractAfterArticleCard(html: string): string | undefined {
    // Look for article cards/blocks and take text from them
    const articleBlock = html.match(/<div[^>]*class="[^"]*\b(?:td-block-span|td_module|post-item|article-card|news-item)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    if (articleBlock) {
      const text = this.stripHtml(articleBlock[1]).slice(0, 2000);
      if (text.length > 50) return text; // Only use if it has substantial content
    }
    return undefined;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
