import { Injectable } from '@nestjs/common';

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
  /** Replace {news.*} placeholders with actual values */
  render(template: string, data: NewsPlaceholders): string {
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
    // Substitute dynamic variables
    result = this.substituteVariables(result);

    return result;
  }

  /** Apply WhatsApp Markdown formatting */
  private formatMarkdown(text: string): string {
    return text
      // Bold: *text*
      .replace(/\*([^*]+)\*/g, '*$1*')
      // Italic: _text_
      .replace(/_([^_]+)_/g, '_$1_')
      // Strikethrough: ~text~
      .replace(/~([^~]+)~/g, '~$1~')
      // Code: `text`
      .replace(/`([^`]+)`/g, '`$1`')
      // Preserve newlines (WhatsApp preserves single newlines)
      .replace(/\n/g, '\n');
  }

  /** Substitute dynamic variables */
  private substituteVariables(text: string): string {
    const now = new Date();
    return text
      // Current date: {{current_date}}
      .replace(/\{\{current_date\}\}/g, now.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }))
      // Current time: {{current_time}}
      .replace(/\{\{current_time\}\}/g, now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }))
      // Current datetime: {{current_datetime}}
      .replace(/\{\{current_datetime\}\}/g, now.toISOString())
      // Current timestamp: {{current_timestamp}}
      .replace(/\{\{current_timestamp\}\}/g, now.getTime().toString());
  }
}
