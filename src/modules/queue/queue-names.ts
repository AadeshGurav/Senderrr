// Queue names used across the application
// Extracted to separate file to avoid circular dependency with processors
export const QUEUE_NAMES = {
  MESSAGE: 'message-queue',
  WEBHOOK: 'webhook-queue',
} as const;
