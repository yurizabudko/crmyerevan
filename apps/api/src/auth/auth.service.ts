import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ChangePasswordRequest, LoginRequest } from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { REDIS } from '../infra/infra.module.js';
import { UsersRepository, publicUser, type User } from '../users/users.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { SessionStore } from './session.store.js';

/** Не более 10 неудачных попыток входа на логин за 15 минут. */
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async login(input: LoginRequest, ip?: string): Promise<{ token: string; user: User }> {
    const failKey = `login_fail:${input.login}`;
    const failures = Number(await this.redis.get(failKey)) || 0;
    if (failures >= MAX_FAILED_LOGINS) {
      throw new HttpException(
        'Слишком много попыток входа, попробуйте через 15 минут',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users.findByLogin(input.login);
    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      await this.redis.multi().incr(failKey).expire(failKey, FAILED_LOGIN_WINDOW_SECONDS).exec();
      await this.audit.record({
        type: 'auth.login_failed',
        userId: user?.id ?? null,
        payload: { login: input.login },
        ip,
      });
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    // О блокировке сообщаем только после проверки пароля, чтобы не раскрывать статус чужих учёток.
    if (user.status !== 'active') {
      throw new ForbiddenException('Учётная запись заблокирована');
    }

    await this.redis.del(failKey);
    const token = await this.sessions.create(user.id);
    await this.users.touchLogin(user.id);
    await this.audit.record({ type: 'auth.login', userId: user.id, ip });
    return { token, user: publicUser(user) };
  }

  async logout(user: User, token: string, ip?: string): Promise<void> {
    await this.sessions.destroy(token);
    await this.audit.record({ type: 'auth.logout', userId: user.id, ip });
  }

  async changePassword(
    actor: User,
    token: string,
    input: ChangePasswordRequest,
    ip?: string,
  ): Promise<User> {
    const user = await this.users.findById(actor.id);
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }
    await this.users.setPassword(user.id, await hashPassword(input.newPassword), false);
    // Остальные сессии завершаем: пароль мог быть скомпрометирован.
    await this.sessions.destroyAllForUser(user.id, token);
    await this.audit.record({ type: 'auth.password_changed', userId: user.id, ip });
    return { ...publicUser(user), mustChangePassword: false };
  }
}
