import { Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

export class BrowserFetchUtil {
  private static browser: puppeteer.Browser | null = null;
  private static readonly logger = new Logger('BrowserFetchUtil');

  private static async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.logger.log('Launching shared browser instance for fallback fetch...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      // Cleanup on exit
      process.on('exit', () => {
        if (this.browser) {
          this.browser.close().catch(() => {});
        }
      });
    }
    return this.browser;
  }

  static async fetchPageContent(url: string, timeout = 45_000): Promise<string> {
    this.logger.log(`Fetching via browser (Hostinger WAF bypass): ${url}`);
    const browser = await this.getBrowser();
    let page: puppeteer.Page | null = null;
    try {
      page = await browser.newPage();
      
      // Mimic a real browser strongly
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      });
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      
      // Optional: wait a moment for CF/WAF challenge to clear if any
      await new Promise(r => setTimeout(r, 2000));
      
      const content = await page.content();
      return content;
    } catch (err) {
      throw new Error(`Browser fetch failed for ${url}: ${(err as Error).message}`);
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Helper method that attempts raw fetch first, and falls back to browser fetch
   * on common WAF blocks or network failures.
   */
  static async fetchWithFallback(url: string, timeout = 30_000): Promise<string> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'close',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
        },
      });
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 503 || response.status === 406) {
          this.logger.warn(`HTTP ${response.status} from ${url}, attempting browser fallback...`);
          return this.fetchPageContent(url, timeout + 15000);
        }
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }
      return await response.text();
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'ECONNRESET' || (err.message && err.message.includes('fetch failed'))) {
        this.logger.warn(`Network error fetching ${url}, attempting browser fallback... (${err.message})`);
        return this.fetchPageContent(url, timeout + 15000);
      }
      throw err;
    }
  }

  static async fetchArrayBufferWithFallback(url: string, timeout = 30_000): Promise<ArrayBuffer> {
    // For images, we can try to fetch them natively. If WAF blocks, we could use page.goto() + page.evaluate()
    // or just page.goto() and then get the response buffer.
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 503 || response.status === 406) {
          this.logger.warn(`HTTP ${response.status} fetching image ${url}, attempting browser fallback...`);
          return this.fetchArrayBufferViaBrowser(url, timeout + 15000);
        }
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }
      return await response.arrayBuffer();
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'ECONNRESET' || (err.message && err.message.includes('fetch failed'))) {
        this.logger.warn(`Network error fetching image ${url}, attempting browser fallback... (${err.message})`);
        return this.fetchArrayBufferViaBrowser(url, timeout + 15000);
      }
      throw err;
    }
  }

  private static async fetchArrayBufferViaBrowser(url: string, timeout = 45_000): Promise<ArrayBuffer> {
    this.logger.log(`Fetching image via browser (Hostinger WAF bypass): ${url}`);
    const browser = await this.getBrowser();
    let page: puppeteer.Page | null = null;
    try {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout });
      if (!response) {
        throw new Error('No response from browser for image fetch');
      }
      const buffer = await response.buffer();
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    } catch (err) {
      throw new Error(`Browser image fetch failed for ${url}: ${(err as Error).message}`);
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Fetches an image via a blank Puppeteer page (bypassing CSP/CORS constraints),
   * resizes it to a max boundary (default 100x100) using Canvas, and returns
   * a highly compressed JPEG as a base64 string. WhatsApp requires the thumbnail
   * to be under ~5KB.
   */
  static async fetchAndResizeImageBase64(imageUrl: string, maxSize = 100): Promise<string | undefined> {
    this.logger.log(`Fetching and resizing thumbnail via browser: ${imageUrl}`);
    const browser = await this.getBrowser();
    let page: puppeteer.Page | null = null;
    try {
      page = await browser.newPage();
      
      // Navigate directly to the image URL. The browser will natively render it
      // as an <img> tag, bypassing all CORS and CSP fetch restrictions.
      const response = await page.goto(imageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      if (!response || !response.ok()) {
        throw new Error(`Failed to load image page: ${response?.statusText()}`);
      }
      
      const base64 = await page.evaluate(async (size: number) => {
        try {
          const img = document.querySelector('img');
          if (!img) return undefined;

          // Wait for the image to be fully decoded by the browser
          await img.decode();

          const ratio = Math.min(size / img.naturalWidth, size / img.naturalHeight);
          const w = Math.round(img.naturalWidth * ratio);
          const h = Math.round(img.naturalHeight * ratio);

          const canvas = new OffscreenCanvas(w, h);
          const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
          ctx.drawImage(img, 0, 0, w, h);

          const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
          const arrBuf = await outBlob.arrayBuffer();
          const bytes = new Uint8Array(arrBuf);
          
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        } catch (e) {
          return undefined;
        }
      }, maxSize);
      
      return base64;
    } catch (err) {
      this.logger.warn(`Thumbnail resize failed for ${imageUrl}: ${(err as Error).message}`);
      return undefined;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }
}