import { Injectable, Logger } from '@nestjs/common';
import { EngineFactory } from '@whatsapp-engine/engine.factory';

@Injectable()
export class SessionHealthService {
  private readonly logger = new Logger('SessionHealthService');

  constructor(private readonly engineFactory: EngineFactory) {}

  checkSession(sessionId: string): string {
    try {
      const engine = this.engineFactory.create({ sessionId });
      return engine.getStatus();
    } catch (err) {
      this.logger.warn(`Session health check failed for ${sessionId}: ${(err as Error).message}`);
      return 'error';
    }
  }

  getSessionQR(sessionId: string): string | null {
    try {
      const engine = this.engineFactory.create({ sessionId });
      return engine.getQRCode();
    } catch {
      return null;
    }
  }

  isSessionReady(sessionId: string): boolean {
    const status = this.checkSession(sessionId);
    return status === 'ready';
  }
}
