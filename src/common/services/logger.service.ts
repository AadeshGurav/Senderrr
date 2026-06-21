import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

export interface LogContext {
  sessionId?: string;
  messageId?: string;
  webhookId?: string;
  action?: string;
  duration?: number;
  [key: string]: unknown;
}

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private context: string = 'Application';
  private static logLevel: LogLevel = LogLevel.INFO;

  static setLogLevel(level: LogLevel): void {
    LoggerService.logLevel = level;
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.INFO, message, context);
  }

  error(message: string, trace?: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { context } : context;
    this.writeLog(LogLevel.ERROR, message, { ...ctx, trace });
  }

  warn(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.WARN, message, context);
  }

  debug(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  verbose(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.VERBOSE, message, context);
  }

  private writeLog(level: LogLevel, message: string, context?: string | LogContext): void {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const contextName = typeof context === 'string' ? context : this.context;
    const metadata = typeof context === 'object' ? context : {};

    const logEntry = {
      timestamp,
      level,
      context: contextName,
      message,
      ...metadata,
    };

    // Output as JSON for structured logging (easy to parse by log aggregators)
    const output = JSON.stringify(logEntry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG, LogLevel.VERBOSE];
    const currentIndex = levels.indexOf(LoggerService.logLevel);
    const targetIndex = levels.indexOf(level);
    return targetIndex <= currentIndex;
  }
}

// Create a factory for easy instantiation
export function createLogger(context: string): LoggerService {
  const logger = new LoggerService();
  logger.setContext(context);
  return logger;
}
