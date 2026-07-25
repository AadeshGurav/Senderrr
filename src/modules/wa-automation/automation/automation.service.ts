/* eslint-disable */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EngineFactory } from '@whatsapp-engine/engine.factory';
import { RateLimiterService } from './rate-limiter.service';
import { JitterService } from './anti-ban/jitter.service';
import { QuietHoursService } from './anti-ban/quiet-hours.service';
import { WorkerTrackerService } from './worker-tracker.service';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../../session/session.service';
import { AdminAccount } from '@database/entities/wa-automation/admin-account.entity';

export enum ErrorCategory {
  RATE_LIMITED = 'rate_limited',
  SESSION_EXPIRED = 'session_expired',
  GROUP_NOT_FOUND = 'group_not_found',
  TIMEOUT = 'timeout',
  SEND_FAILED = 'send_failed',
  BOT_DETECTED = 'bot_detected',
  GROUP_FULL = 'group_full',
  UNKNOWN = 'unknown',
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  responseTime?: number;
}

export function isMediaMime(mime: string): boolean {
  return (
    mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/pdf'
  );
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger('AutomationService');
  private readonly maxRetries: number;
  private readonly FAILED_RETRY_TTL_MS = 3_600_000;
  private readonly rateLimitRetryDelay: number;

  constructor(
    private readonly engineFactory: EngineFactory,
    private readonly rateLimiter: RateLimiterService,
    private readonly jitterService: JitterService,
    private readonly quietHours: QuietHoursService,
    private readonly sessionService: SessionService,
    configService: ConfigService,
    @InjectRepository(AdminAccount, 'data')
    private readonly adminRepo: Repository<AdminAccount>,
  ) {
    this.maxRetries = configService.get<number>('automation.maxRetryAttempts', 3);
    this.rateLimitRetryDelay = configService.get<number>('automation.rateLimitRetryDelay', 3600);
  }

  /**
   * Deliver a message to a WhatsApp group via the engine.
   * Called directly — no HTTP round-trip.
   */
  async deliverMessage(
    sessionId: string,
    chatId: string,
    text: string,
    adminId: number,
    workerId: string,
    imageUrls: string[] = [],
  ): Promise<DeliveryResult> {
    const startTime = Date.now();

    // 1. Check quiet hours (reads from DB settings with timezone awareness)
    const inQuietHours = await this.quietHours.isQuietHours();
    if (inQuietHours) {
      const mins = await this.quietHours.minutesUntilEnd();
      return {
        success: false,
        errorCategory: ErrorCategory.RATE_LIMITED,
        errorMessage: `Quiet hours (${mins}min until end)`,
      };
    }

    // 2. Check rate limits
    const rateCheck = this.rateLimiter.check(adminId);
    if (!rateCheck.allowed) {
      return {
        success: false,
        errorCategory: ErrorCategory.RATE_LIMITED,
        errorMessage: rateCheck.reason,
      };
    }

    // 3. Attempt delivery — use the existing running engine from SessionService
    //    rather than creating a new one via engineFactory (which returns a fresh
    //    uninitialized adapter).
    try {
      const engine = this.sessionService.getEngine(sessionId);
      if (!engine) {
        return {
          success: false,
          errorCategory: ErrorCategory.SESSION_EXPIRED,
          errorMessage: `Session ${sessionId} is not running`,
        };
      }

      let result: any;

      if (imageUrls.length > 0) {
        // Send first media with text as caption, then remaining media standalone.
        // WhatsApp auto-groups quick-successive images into a gallery on the receiver.
        let isFirst = true;
        for (const imageUrl of imageUrls) {
          let mediaData = imageUrl;
          let mediaMime = 'image/jpeg';
          let mediaFilename = `attachment.${this.mimeToExt(mediaMime)}`;
          if (imageUrl.startsWith('data:')) {
            const commaIdx = imageUrl.indexOf(',');
            if (commaIdx !== -1) {
              const header = imageUrl.substring(5, commaIdx);
              mediaData = imageUrl.substring(commaIdx + 1);
              const semiIdx = header.indexOf(';');
              if (semiIdx !== -1) {
                mediaMime = header.substring(0, semiIdx);
                mediaFilename = `attachment.${this.mimeToExt(mediaMime)}`;
              }
            }
          }

          const opts: any = { mimetype: mediaMime, data: mediaData, filename: mediaFilename };
          if (isFirst && text) {
            opts.caption = text;
            isFirst = false;
          }

          const mimeType = mediaMime.toLowerCase();
          if (mimeType.startsWith('image/')) {
            result = await engine.sendImageMessage(chatId, opts);
          } else if (mimeType.startsWith('video/')) {
            result = await engine.sendVideoMessage(chatId, opts);
          } else if (mimeType.startsWith('audio/')) {
            result = await engine.sendAudioMessage(chatId, opts);
          } else {
            result = await engine.sendDocumentMessage(chatId, opts);
          }

          // Brief pause to avoid rate issues between media
          await new Promise(r => setTimeout(r, 1500));
        }
      } else {
        // Article broadcasts: send as plain text. WhatsApp's native link preview
        // is guaranteed by preWarmLinkPreview() having already called the engine's
        // warmUpLinkPreview(), which primes WA's server-side crawl cache so that
        // linkPreview:true resolves instantly for every subsequent sendMessage call.
        result = await engine.sendTextMessage(chatId, text);
      }

      // 4. Increment rate limit counters and admin stats on success
      this.rateLimiter.increment(adminId);
      await this.adminRepo.increment({ id: adminId }, 'totalSent', 1);
      await this.adminRepo.update(adminId, { lastSentAt: new Date() });

      return {
        success: true,
        messageId: result?.id,
        responseTime: Date.now() - startTime,
      };
    } catch (err) {
      const errorMessage = (err as Error).message;
      const category = this.classifyError(errorMessage);
      await this.adminRepo.increment({ id: adminId }, 'totalFailed', 1);

      return {
        success: false,
        errorCategory: category,
        errorMessage,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Schedule a message delivery with jitter delay.
   * Returns a promise that resolves after the delay + delivery.
   */
  async scheduleDelayedDelivery(
    sessionId: string,
    chatId: string,
    text: string,
    adminId: number,
    workerId: string,
    batchIndex: number,
    imageUrls: string[] = [],
  ): Promise<DeliveryResult> {
    const delay = this.jitterService.calculateDelay(batchIndex);
    this.logger.debug(`Scheduling delivery to ${chatId} with ${Math.round(delay / 1000)}s jitter`);

    return new Promise(resolve => {
      setTimeout(async () => {
        const result = await this.deliverMessage(sessionId, chatId, text, adminId, workerId, imageUrls);
        resolve(result);
      }, delay);
    });
  }

  /**
   * Pre-warm WhatsApp's server-side link preview cache for a URL in a given session.
   *
   * Delegates to the engine adapter's warmUpLinkPreview(), which runs
   * WAWebLinkPreviewChatAction.getLinkPreview() inside the Puppeteer page,
   * polling until Meta's crawler completes and caches the result server-side.
   * After this resolves, every subsequent sendMessage(..., { linkPreview: true })
   * call in the same browser session will show a rich preview instantly.
   */
  async preWarmLinkPreview(sessionId: string, text: string): Promise<void> {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) return;
    const url = urlMatch[0];

    const engine = this.sessionService.getEngine(sessionId);
    if (!engine || !engine.warmUpLinkPreview) return;

    try {
      await engine.warmUpLinkPreview(url);
      this.logger.log(`Link preview warmed for: ${url}`);
    } catch {
      // Best-effort: dispatch continues without preview guarantee
    }
  }

  /**
   * Edit a previously sent WhatsApp message in a given group.
   */
  async editMessage(sessionId: string, chatId: string, messageId: string, newText: string): Promise<DeliveryResult> {
    const startTime = Date.now();
    try {
      const engine = this.sessionService.getEngine(sessionId);
      if (!engine) {
        return {
          success: false,
          errorCategory: ErrorCategory.SESSION_EXPIRED,
          errorMessage: `Session ${sessionId} is not running`,
        };
      }
      await engine.editMessage(chatId, messageId, newText);
      return { success: true, responseTime: Date.now() - startTime };
    } catch (err) {
      return {
        success: false,
        errorCategory: this.classifyError((err as Error).message),
        errorMessage: (err as Error).message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Delete a previously sent WhatsApp message in a given group.
   */
  async deleteMessage(sessionId: string, chatId: string, messageId: string): Promise<DeliveryResult> {
    const startTime = Date.now();
    try {
      const engine = this.sessionService.getEngine(sessionId);
      if (!engine) {
        return {
          success: false,
          errorCategory: ErrorCategory.SESSION_EXPIRED,
          errorMessage: `Session ${sessionId} is not running`,
        };
      }
      await engine.deleteMessage(chatId, messageId, true);
      return { success: true, responseTime: Date.now() - startTime };
    } catch (err) {
      return {
        success: false,
        errorCategory: this.classifyError((err as Error).message),
        errorMessage: (err as Error).message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private classifyError(message: string): ErrorCategory {
    const lower = message.toLowerCase();
    if (lower.includes('rate') || lower.includes('limit') || lower.includes('too many')) {
      return ErrorCategory.RATE_LIMITED;
    }
    if (lower.includes('session') || lower.includes('disconnected') || lower.includes('qr') || lower.includes('auth')) {
      return ErrorCategory.SESSION_EXPIRED;
    }
    if (lower.includes('group') || lower.includes('chat') || lower.includes('not found')) {
      return ErrorCategory.GROUP_NOT_FOUND;
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return ErrorCategory.TIMEOUT;
    }
    if (lower.includes('ban') || lower.includes('blocked') || lower.includes('spam')) {
      return ErrorCategory.BOT_DETECTED;
    }
    if (lower.includes('full') || lower.includes('capacity')) {
      return ErrorCategory.GROUP_FULL;
    }
    if (lower.includes('send') || lower.includes('failed') || lower.includes('error')) {
      return ErrorCategory.SEND_FAILED;
    }
    return ErrorCategory.UNKNOWN;
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt',
    };
    return map[mime] || 'bin';
  }
}
