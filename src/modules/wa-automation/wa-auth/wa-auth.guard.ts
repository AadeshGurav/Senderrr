/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { WA_PUBLIC_KEY } from './wa-auth.decorators';
import * as crypto from 'node:crypto';

interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class WaAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(WA_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Please sign in again. Your session has expired.');
    }

    const token = authHeader.slice(7);
    const payload = this.verifyJwt(token);
    if (!payload) {
      throw new UnauthorizedException('Please sign in again. Your session has expired.');
    }

    (request as any).waUser = payload;
    return true;
  }

  private verifyJwt(token: string): JwtPayload | null {
    try {
      const secret = this.configService.get<string>('waAuth.jwtSecret', 'wa-automation-jwt-secret-change-me');
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
      if (header.alg !== 'HS256') return null;

      const signature = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');

      if (signature !== parts[2]) return null;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as JwtPayload;

      // Check expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) return null;

      return payload;
    } catch {
      return null;
    }
  }
}
