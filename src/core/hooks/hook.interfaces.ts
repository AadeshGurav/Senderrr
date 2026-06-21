/**
 * Hook System Interfaces
 * Central event bus for plugin integration
 */

export type HookEvent =
  // Session lifecycle
  | 'session:created'
  | 'session:starting'
  | 'session:ready'
  | 'session:qr'
  | 'session:disconnected'
  | 'session:deleted'
  // Message lifecycle
  | 'message:received'
  | 'message:sending'
  | 'message:sent'
  | 'message:failed'
  | 'message:ack'
  // Webhook lifecycle
  | 'webhook:before'
  | 'webhook:queued' // After webhook job added to queue (queue mode only)
  | 'webhook:delivered' // After webhook successfully delivered (direct or queue)
  | 'webhook:after' // After webhook attempt (direct mode only, deprecated for queue)
  | 'webhook:error'; // After webhook delivery failed (all retries exhausted)

export interface HookContext<T = unknown> {
  event: HookEvent;
  data: T;
  sessionId?: string;
  timestamp: Date;
  source: string; // Which service emitted this
}

export interface HookResult<T = unknown> {
  continue: boolean; // false = stop processing chain
  data?: T; // Modified data (optional)
  error?: Error; // Error to propagate
}

export type HookHandler<T = unknown> = (ctx: HookContext<T>) => Promise<HookResult<T>>;

export interface HookRegistration {
  id: string;
  pluginId: string;
  event: HookEvent;
  handler: HookHandler;
  priority: number; // Lower = runs first
}
