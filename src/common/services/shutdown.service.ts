import { Injectable } from '@nestjs/common';
import { createLogger } from './logger.service';

@Injectable()
export class ShutdownService {
  private readonly logger = createLogger('ShutdownService');
  private destroyCallback: (() => Promise<void>) | null = null;

  /**
   * Set the shutdown callback (called from main.ts after app creation)
   */
  setShutdownCallback(callback: () => Promise<void>): void {
    this.destroyCallback = callback;
  }

  /**
   * Trigger graceful shutdown with optional delay
   */
  shutdown(delayMs = 3000): void {
    this.logger.log('Graceful shutdown requested', { delayMs });

    setTimeout(() => {
      this.logger.log('Initiating shutdown...');
      const doShutdown = async () => {
        try {
          if (this.destroyCallback) {
            await this.destroyCallback();
          }
        } catch (error) {
          this.logger.error('Error during shutdown', error instanceof Error ? error.message : String(error));
        } finally {
          process.exit(0);
        }
      };
      void doShutdown();
    }, delayMs);
  }
}
