import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Security middleware for request tracking and security headers
 * Phase 3 Security Audit
 */
@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Generate or use existing request ID for tracing
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Add additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Remove server header to avoid fingerprinting
    res.removeHeader('X-Powered-By');

    next();
  }
}

/**
 * Sanitize input strings to prevent XSS and injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/\\/g, '&#x5C;')
    .replace(/`/g, '&#x60;');
}

/**
 * Validate that a string matches safe patterns
 */
export function isValidSessionName(name: string): boolean {
  // Only allow alphanumeric, hyphens, underscores, 3-50 chars
  return /^[a-zA-Z0-9_-]{3,50}$/.test(name);
}

/**
 * Validate WhatsApp chat ID format
 */
export function isValidChatId(chatId: string): boolean {
  // Format: <phone>@c.us (individual) or <id>@g.us (group)
  return /^\d+@(c\.us|g\.us)$/.test(chatId);
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  // 10-15 digits
  return /^\d{10,15}$/.test(phone);
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (!data || data.length <= visibleChars) return '***';
  return data.substring(0, visibleChars) + '*'.repeat(Math.min(data.length - visibleChars, 8));
}

/**
 * Security configuration constants
 */
export const SecurityConfig = {
  // Rate limiting defaults
  rateLimit: {
    short: { ttl: 1000, limit: 10 },
    medium: { ttl: 60000, limit: 100 },
    long: { ttl: 3600000, limit: 1000 },
  },

  // Input validation limits
  inputLimits: {
    maxTextLength: 65536,
    maxSessionNameLength: 50,
    maxUrlLength: 2048,
    maxArrayItems: 100,
  },

  // Session limits
  sessionLimits: {
    maxSessionsPerInstance: 100,
    sessionIdleTimeout: 86400000, // 24 hours
    qrCodeTimeout: 120000, // 2 minutes
  },

  // API key configuration
  apiKey: {
    prefix: 'owa_k1_',
    hashAlgorithm: 'sha256',
    randomBytes: 32,
    prefixLength: 12,
  },
} as const;
