import { Injectable, Logger } from '@nestjs/common';
import { EngineFactory } from '@whatsapp-engine/engine.factory';

/**
 * Syncs WhatsApp groups from the engine.
 * Session IDs are passed by the caller (SchedulerService) to avoid circular deps.
 */
@Injectable()
export class GroupSyncService {
  private readonly logger = new Logger('GroupSyncService');

  constructor(private readonly engineFactory: EngineFactory) {}

  async syncSessionGroups(sessionId: string): Promise<{ groups: any[]; error?: string }> {
    try {
      const engine = this.engineFactory.create({ sessionId });
      const groups = await engine.getGroups();
      return { groups: groups || [] };
    } catch (err) {
      this.logger.warn(`Group sync failed for session ${sessionId}: ${(err as Error).message}`);
      return { groups: [], error: (err as Error).message };
    }
  }
}
