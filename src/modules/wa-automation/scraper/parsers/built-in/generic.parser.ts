import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { IArticleParser, ArticlePreview, ParsedArticle } from '../parser.interface';

@Injectable()
export class GenericParser implements IArticleParser {
  domain = '*'; // Handles any URL as fallback

  parseListing(html: string, baseUrl: string): ArticlePreview[] {
    const previews: ArticlePreview[] = [];
    const seen = new Set<string>();

    // Try cheerio-based parsing first (more robust)
    try {
      const $ = cheerio.load(html);
      const baseHost = new URL(baseUrl).host;

      // Collect all candidate links from common article containers
      const candidates: { url: string; title: string; el: any }[] = [];

      // Strategy 1: <article> tags with <a> inside
      $('article').each((_, article) => {
        const $article = $(article);
        $article.find('a[href]').each((__, a) => {
          const $a = $(a);
          const href = $a.attr('href') || '';
          const text = $a.text().trim();
          if (text.length >= 5) {
            candidates.push({ url: href, title: text, el: a });
          }
        });
      });

      // Strategy 2: heading > link patterns (h1-h4 > a)
      $('h1 a[href], h2 a[href], h3 a[href], h4 a[href]').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        const text = $a.text().trim();
        if (text.length >= 5) {
          candidates.push({ url: href, title: text, el: a });
        }
      });

      // Strategy 3: links inside known article container classes
      const articleSelectors = [
        '.td_module', '.td-block-span', '.post-item', '.article-card',
        '.news-item', '.blog-item', '.entry', '.post', '.hentry',
        '.item-details', '.story', '.teaser', '.card',
      ];
      for (const sel of articleSelectors) {
        $(sel).each((_, container) => {
          const $container = $(container);
          $container.find('a[href]').each((__, a) => {
            const $a = $(a);
            const href = $a.attr('href') || '';
            const text = $a.text().trim();
            if (text.length >= 5) {
              candidates.push({ url: href, title: text, el: a });
            }
          });
        });
      }

      // Strategy 4: any prominent <a> with article-like URL patterns
      $('a[href*="/article"], a[href*="/news"], a[href*="/story"], a[href*="/post"], a[href*="/blog"], a[href*="/202"], a[href*="?p="]').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        const text = $a.text().trim();
        if (text.length >= 5) {
          candidates.push({ url: href, title: text, el: a });
        }
      });

      for (const c of candidates) {
        let url = c.url;
        const title = c.title;

        // Normalize relative URLs
        if (url.startsWith('/')) {
          try {
            const base = new URL(baseUrl);
            url = `${base.protocol}//${base.host}${url}`;
          } catch {
            continue;
          }
        }

        // Deduplicate and filter
        if (seen.has(url)) continue;
        if (!url.startsWith('http')) continue;
        if (url === baseUrl || url === baseUrl + '/') continue;
        if (url.includes('#') || url.includes('login') || url.includes('wp-admin') || url.includes('.css') || url.includes('.js')) continue;
        if (title.length < 5) continue;

        // Skip if URL points to the same host but not to an article path
        try {
          const u = new URL(url);
          // If same host and looks like homepage path, skip
          if (u.host === baseHost && (u.pathname === '/' || u.pathname === '')) continue;
        } catch {
          continue;
        }

        seen.add(url);
        previews.push({ url, title, description: '' });
      }
    } catch {
      // Cheerio failed — fall through to regex
    }

    // Regex fallback if cheerio found nothing
    if (previews.length === 0) {
      const patterns = [
        /<div[^>]*class="[^"]*\btd_module\b[^"]*"[^>]*>[\s\S]*?<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi,
        /<div[^>]*class="[^"]*\b(?:td-block-span|post-item|article-card|news-item|blog-item|entry)[^"]*"[^>]*>[\s\S]*?<h[23][^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h[23]>/gi,
        /<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi,
        /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/gi,
      ];

      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) !== null) {
          let url = match[1].trim();
          const title = this.stripHtml(match[2]).trim();

          if (url.startsWith('/')) {
            try {
              const base = new URL(baseUrl);
              url = `${base.protocol}//${base.host}${url}`;
            } catch {
              continue;
            }
          }

          if (seen.has(url)) continue;
          if (!url.startsWith('http')) continue;
          if (url === baseUrl || url === baseUrl + '/' || url.includes('#') || url.includes('login') || url.includes('wp-admin') || url.includes('.css') || url.includes('.js')) continue;
          if (title.length < 5) continue;

          seen.add(url);
          previews.push({ url, title, description: '' });
        }
      }
    }

    return previews;
  }

  parseArticle(html: string, url: string): ParsedArticle {
    let title = '';
    let description = '';
    let body = '';
    let imageUrl = '';
    let publishedAt: Date | undefined;

    try {
      const $ = cheerio.load(html);

      // Title: og:title > twitter:title > <title> > <h1>
      title = $('meta[property="og:title"]').attr('content')
        || $('meta[name="twitter:title"]').attr('content')
        || $('title').text()
        || $('h1').first().text()
        || '';

      // Description: meta description > og:description
      description = $('meta[name="description"]').attr('content')
        || $('meta[property="og:description"]').attr('content')
        || '';

      // Image: og:image > twitter:image
      imageUrl = $('meta[property="og:image"]').attr('content')
        || $('meta[name="twitter:image"]').attr('content')
        || '';

      // Body: article > main > known content classes
      const bodySelectors = [
        'article',
        'main',
        '.td-post-content',
        '.entry-content',
        '.post-content',
        '.article-body',
        '.article-content',
        '.content',
        '.td-block-row',
        '.post',
        '.story-body',
        '.news-body',
      ];
      for (const sel of bodySelectors) {
        const el = $(sel).first();
        if (el.length) {
          body = el.text().trim().replace(/\s+/g, ' ').slice(0, 2000);
          if (body.length > 100) break;
        }
      }

      // If no body found, try <p> tags inside main content area
      if (!body || body.length < 50) {
        const paragraphs: string[] = [];
        $('p').each((_, p) => {
          const text = $(p).text().trim();
          if (text.length > 30) paragraphs.push(text);
        });
        if (paragraphs.length > 0) {
          body = paragraphs.join(' ').slice(0, 2000);
        }
      }

      // Published date: article:published_time > <time datetime> > JSON-LD
      const dateStr = $('meta[property="article:published_time"]').attr('content')
        || $('time').attr('datetime');
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) publishedAt = d;
      }

      // JSON-LD fallback for date
      if (!publishedAt) {
        const ldMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
        if (ldMatch) {
          const d = new Date(ldMatch[1]);
          if (!isNaN(d.getTime())) publishedAt = d;
        }
      }
    } catch {
      // Cheerio failed — fall through to regex
    }

    // Regex fallback for title if cheerio didn't get it
    if (!title) {
      title = this.extract(html, /<meta[^>]+property="(?:og|twitter):title"[^>]+content="([^"]+)"/i)
        || this.extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
        || this.extract(html, /<h1[^>]*>(.*?)<\/h1>/is)
        || 'Untitled';
    }

    // Regex fallback for body
    if (!body || body.length < 50) {
      body = this.extractTagContent(html, 'article')
        || this.extractTagContent(html, 'main')
        || this.extractContentByClass(html, 'td-post-content')
        || this.extractContentByClass(html, 'entry-content')
        || this.extractContentByClass(html, 'post-content')
        || this.extractContentByClass(html, 'article-body')
        || this.extractContentByClass(html, 'article-content')
        || this.extractContentByClass(html, 'content')
        || this.extractContentByClass(html, 'td-block-row')
        || this.extractAfterArticleCard(html)
        || title;
    }

    // Regex fallback for description
    if (!description) {
      description = this.extract(html, /<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
        || this.extract(html, /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
        || '';
    }

    // Regex fallback for image
    if (!imageUrl) {
      imageUrl = this.extract(html, /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
        || this.extract(html, /<meta[^>]+property="twitter:image"[^>]+content="([^"]+)"/i)
        || '';
    }

    // Regex fallback for date
    if (!publishedAt) {
      publishedAt = this.extractDate(html);
    }

    return {
      url,
      title: title?.trim() || 'Untitled',
      description: description?.trim() || '',
      body: body?.trim() || title?.trim() || 'Untitled',
      imageUrl: imageUrl?.trim() || undefined,
      sourceName: new URL(url).hostname,
      publishedAt,
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

  // ─── Regex fallback helpers ───────────────────────────────────

  private extract(html: string, pattern: RegExp): string | undefined {
    const match = html.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private extractTagContent(html: string, tag: string): string | undefined {
    const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
    return match ? this.stripHtml(match[1]).slice(0, 2000) : undefined;
  }

  private extractContentByClass(html: string, className: string): string | undefined {
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

  private extractAfterArticleCard(html: string): string | undefined {
    const articleBlock = html.match(/<div[^>]*class="[^"]*\b(?:td-block-span|td_module|post-item|article-card|news-item)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    if (articleBlock) {
      const text = this.stripHtml(articleBlock[1]).slice(0, 2000);
      if (text.length > 50) return text;
    }
    return undefined;
  }

  private extractDate(html: string): Date | undefined {
    const meta = this.extract(html, /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i);
    if (meta) {
      const d = new Date(meta);
      if (!isNaN(d.getTime())) return d;
    }
    const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
    if (timeMatch) {
      const d = new Date(timeMatch[1]);
      if (!isNaN(d.getTime())) return d;
    }
    const ldMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
    if (ldMatch) {
      const d = new Date(ldMatch[1]);
      if (!isNaN(d.getTime())) return d;
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
