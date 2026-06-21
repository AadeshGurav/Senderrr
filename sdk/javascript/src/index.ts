/**
 * OpenWA JavaScript/TypeScript SDK
 *
 * Official client library for the OpenWA WhatsApp API Gateway.
 *
 * @example
 * ```typescript
 * import { OpenWAClient } from '@openwa/sdk';
 *
 * const client = new OpenWAClient({
 *   baseUrl: 'http://localhost:2785',
 *   apiKey: 'your-api-key',
 * });
 *
 * // Send a text message
 * const result = await client.messages.sendText('session-1', {
 *   chatId: '628123456789@c.us',
 *   text: 'Hello from OpenWA SDK!',
 * });
 * ```
 *
 * @packageDocumentation
 */

// ── Client Configuration ──────────────────────────────────────────

export interface OpenWAClientConfig {
  /** Base URL of the OpenWA API (e.g., 'http://localhost:2785') */
  baseUrl: string;

  /** API key for authentication */
  apiKey: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

// ── Response Types ────────────────────────────────────────────────

export interface MessageResponse {
  messageId: string;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  pushName: string | null;
}

// ── Client Class ──────────────────────────────────────────────────

export class OpenWAClient {
  private readonly config: Required<OpenWAClientConfig>;

  constructor(config: OpenWAClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  // Placeholder — will be auto-generated from OpenAPI spec
  get sessions() {
    return {
      list: () => this.request<Session[]>('GET', '/api/sessions'),
      get: (id: string) => this.request<Session>('GET', `/api/sessions/${id}`),
      create: (data: { name: string }) => this.request<Session>('POST', '/api/sessions', data),
      start: (id: string) => this.request<Session>('POST', `/api/sessions/${id}/start`),
      stop: (id: string) => this.request<Session>('POST', `/api/sessions/${id}/stop`),
      delete: (id: string) => this.request<void>('DELETE', `/api/sessions/${id}`),
    };
  }

  get messages() {
    return {
      sendText: (sessionId: string, data: { chatId: string; text: string }) =>
        this.request<MessageResponse>('POST', `/api/sessions/${sessionId}/messages/text`, data),
    };
  }

  // ── Internal HTTP client ──────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`OpenWA API Error (${response.status}): ${(error as { message: string }).message}`);
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

export default OpenWAClient;
