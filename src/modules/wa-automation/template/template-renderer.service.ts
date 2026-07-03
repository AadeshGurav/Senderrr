import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface NewsPlaceholders {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  source: string;
  publishedAt: string;
  time: string;
}

@Injectable()
export class TemplateRendererService {
  constructor(private readonly settingsService: SettingsService) {}

  /** Replace {news.*} placeholders with actual values */
  async render(template: string, data: NewsPlaceholders): Promise<string> {
    const tz = await this.settingsService.get('TIMEZONE', 'UTC');

    let result = template
      .replace(/\{news\.title\}/g, data.title)
      .replace(/\{news\.description\}/g, data.description)
      .replace(/\{news\.url\}/g, data.url)
      .replace(/\{news\.image_url\}/g, data.imageUrl)
      .replace(/\{news\.source\}/g, data.source)
      .replace(/\{news\.published_at\}/g, data.publishedAt)
      .replace(/\{news\.time\}/g, data.time);

    // Apply WhatsApp Markdown formatting
    result = this.formatMarkdown(result);
    // Substitute dynamic variables with timezone
    result = this.substituteVariables(result, tz);

    return result;
  }

  /** Apply WhatsApp Markdown formatting */
  private formatMarkdown(text: string): string {
    return text
      .replace(/\*([^*]+)\*/g, '*$1*')
      .replace(/_([^_]+)_/g, '_$1_')
      .replace(/~([^~]+)~/g, '~$1~')
      .replace(/`([^`]+)`/g, '`$1`');
  }

  /** Substitute dynamic variables with timezone-aware formatting */
  private substituteVariables(text: string, tz: string): string {
    const now = new Date();
    const fmt: Intl.DateTimeFormatOptions = { timeZone: tz, timeZoneName: 'short' };

    return text
      .replace(/\{\{current_date\}\}/g, now.toLocaleDateString('en-IN', {
        ...fmt,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }))
      .replace(/\{\{current_time\}\}/g, now.toLocaleTimeString('en-IN', {
        ...fmt,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }))
      .replace(/\{\{current_datetime\}\}/g, now.toLocaleString('en-IN', {
        ...fmt,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }))
      .replace(/\{\{current_timestamp\}\}/g, now.getTime().toString());
  }
}
