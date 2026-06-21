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
    return template
      .replace(/\{news\.title\}/g, data.title)
      .replace(/\{news\.description\}/g, data.description)
      .replace(/\{news\.url\}/g, data.url)
      .replace(/\{news\.image_url\}/g, data.imageUrl)
      .replace(/\{news\.source\}/g, data.source)
      .replace(/\{news\.published_at\}/g, data.publishedAt)
      .replace(/\{news\.time\}/g, data.time);
  }
}
