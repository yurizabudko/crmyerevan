import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersRepository, publicUser } from '../users/users.repository.js';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, type AuthedRequest } from './decorators.js';
import { SESSION_COOKIE, SessionStore } from './session.store.js';

/** Глобальная проверка сессии. Каждый запрос перечитывает пользователя: блокировка действует сразу. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(UsersRepository) private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException('Требуется вход');

    const session = await this.sessions.get(token);
    const user = session ? await this.users.findById(session.userId) : null;
    if (!session || !user || user.status !== 'active') {
      if (session) await this.sessions.destroy(token);
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)
    ) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Смените временный пароль',
      });
    }

    req.user = publicUser(user);
    req.sessionToken = token;
    return true;
  }
}
