import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const WA_PUBLIC_KEY = 'wa_is_public';

export const WaPublic = () => SetMetadata(WA_PUBLIC_KEY, true);

export const CurrentWaUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { waUser?: any }>();
  const user = request.waUser;
  return data ? user?.[data] : user;
});
