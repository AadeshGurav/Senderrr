import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import type { Status, StatusResult, TextStatusOptions } from '../../engine/interfaces/whatsapp-engine.interface';

@Injectable()
export class StatusService {
  constructor(private readonly sessionService: SessionService) {}

  async getStatuses(sessionId: string): Promise<Status[]> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} not found or not connected`);
    }
    return engine.getContactStatuses();
  }

  async getContactStatus(sessionId: string, contactId: string): Promise<Status[]> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} not found or not connected`);
    }
    return engine.getContactStatus(contactId);
  }

  async postTextStatus(sessionId: string, text: string, options?: TextStatusOptions): Promise<StatusResult> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} not found or not connected`);
    }
    return engine.postTextStatus(text, options);
  }

  async postImageStatus(
    sessionId: string,
    media: { url?: string; base64?: string },
    caption?: string,
  ): Promise<StatusResult> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} not found or not connected`);
    }
    return engine.postImageStatus(
      {
        mimetype: 'image/jpeg',
        data: media.url || media.base64 || '',
      },
      caption,
    );
  }

  async postVideoStatus(
    sessionId: string,
    media: { url?: string; base64?: string },
    caption?: string,
  ): Promise<StatusResult> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} not found or not connected`);
    }
    return engine.postVideoStatus(
      {
        mimetype: 'video/mp4',
        data: media.url || media.base64 || '',
      },
      caption,
    );
  }

  async deleteStatus(sessionId: string, statusId: string): Promise<void> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} not found or not connected`);
    }
    return engine.deleteStatus(statusId);
  }
}
