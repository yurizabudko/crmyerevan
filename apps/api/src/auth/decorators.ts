import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../users/users.repository.js';

export const IS_PUBLIC = 'auth:isPublic';
export const ALLOW_PENDING_PASSWORD = 'auth:allowPendingPassword';

/** Маршрут доступен без входа. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Маршрут доступен, пока пользователь не сменил временный пароль (БТ-2.4.3). */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export interface AuthedRequest extends Request {
  user: User;
  sessionToken: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
