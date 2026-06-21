/**
 * Human-readable error messages for non-technical users.
 * No stack traces or technical details are exposed outside debug mode.
 */

const isDebug = import.meta.env.DEV || localStorage.getItem('openwa_debug') === 'true';

const ERROR_MAP: Record<string, string> = {
  '401': 'Please sign in again. Your session has expired.',
  '403': "You don't have permission to do that.",
  '404': 'This page or resource was not found.',
  '409': 'This already exists. Try a different name.',
  '429': 'Too many requests. Please wait a moment and try again.',
  '500': 'Something went wrong on the server. Please try again.',
  '502': 'The server is temporarily unavailable. Please wait.',
  '503': 'The server is busy. Please try again in a moment.',
  'FETCH_ERROR': 'Unable to reach the server. Check your connection.',
  'TIMEOUT': 'The request took too long. Please try again.',
  'NETWORK_ERROR': 'Network connection lost. Check your internet.',
  'ABORTED': 'The request was cancelled.',
};

function matchHttpStatus(message: string): string | null {
  const match = message.match(/HTTP (\d+)/);
  if (match) return ERROR_MAP[match[1]] || null;
  return null;
}

function matchKnownPhrase(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('session') && (lower.includes('expired') || lower.includes('invalid'))) {
    return 'Please sign in again. Your session has expired.';
  }
  if (lower.includes('not found')) return 'Not found. It may have been deleted.';
  if (lower.includes('already exists')) return 'This already exists. Try a different name.';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'The request took too long. Please try again.';
  if (lower.includes('network') || lower.includes('fetch')) return 'Unable to reach the server. Check your connection.';
  if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('denied')) {
    return "You don't have permission to do that.";
  }
  return null;
}

/**
 * Convert a technical error to a human-readable message.
 * In debug mode, the original message is appended.
 */
export function toUserMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  const httpMsg = matchHttpStatus(message);
  if (httpMsg) return isDebug ? `${httpMsg} (${message})` : httpMsg;

  const knownMsg = matchKnownPhrase(message);
  if (knownMsg) return isDebug ? `${knownMsg} (${message})` : knownMsg;

  // Fallback: generic friendly message
  const fallback = 'Something unexpected happened. Please try again.';
  return isDebug ? `${fallback} (${message})` : fallback;
}
