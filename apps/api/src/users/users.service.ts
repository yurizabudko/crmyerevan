import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  can,
  creatableRoles,
  type CreateUserRequest,
  type ResetPasswordRequest,
  type SetPermissionsRequest,
  type UserBriefDto,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';
import { SessionStore } from '../auth/session.store.js';
import { withLock } from '../common/redis-lock.js';
import { REDIS } from '../infra/infra.module.js';
import { UsersRepository, publicUser, type User } from './users.repository.js';

const NO_PERMS = { grantAccess: false, deleteCards: false, manageDictionaries: false };

/** Раздел «Пользователи» (7.1) и правила создания учёток (БТ-2.4.2, 2.4.6, 2.4.7). */
@Injectable()
export class UsersService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  list(actor: User): Promise<User[]> {
    this.assert(can.manageUsers(actor));
    return this.users.list();
  }

  /** Список для выбора ответственного и подписей. Партнёрам не выдаётся (2.2, 8.4). */
  async directory(actor: User): Promise<UserBriefDto[]> {
    this.assert(actor.role !== 'partner');
    const users = await this.users.list();
    return users.map(({ id, displayName, role, status }) => ({ id, displayName, role, status }));
  }

  async create(actor: User, input: CreateUserRequest): Promise<User> {
    this.assert(can.manageUsers(actor));
    if (!creatableRoles(actor).includes(input.role)) {
      throw new ForbiddenException('Нельзя создать пользователя с этой ролью');
    }
    // Права назначает только Владелец и только сотрудникам.
    const perms = can.setPermissions(actor) && input.role === 'employee' ? input.perms : NO_PERMS;

    const id = await withLock(this.redis, `user-login:${input.login}`, async () => {
      if (await this.users.findByLogin(input.login)) {
        throw new ConflictException('Пользователь с таким логином уже есть');
      }
      return this.users.create({
        login: input.login,
        displayName: input.displayName,
        role: input.role,
        passwordHash: await hashPassword(input.temporaryPassword),
        perms,
        createdById: actor.id,
      });
    });

    await this.audit.record({
      type: 'user.created',
      userId: actor.id,
      entityType: 'user',
      entityId: id,
      payload: { login: input.login, role: input.role, perms },
    });
    return this.getPublic(id);
  }

  async setBlocked(actor: User, id: number, blocked: boolean): Promise<User> {
    this.assert(can.manageUsers(actor));
    if (id === actor.id) throw new BadRequestException('Нельзя заблокировать себя');
    const target = await this.getOrThrow(id);
    if (target.role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('Блокировать Владельца может только Владелец');
    }
    await this.users.setStatus(id, blocked ? 'blocked' : 'active');
    // Блокировка без удаления (БТ-2.4.7): данные остаются, активные сессии завершаются.
    if (blocked) await this.sessions.destroyAllForUser(id);
    await this.audit.record({
      type: blocked ? 'user.blocked' : 'user.unblocked',
      userId: actor.id,
      entityType: 'user',
      entityId: id,
    });
    return this.getPublic(id);
  }

  async resetPassword(actor: User, id: number, input: ResetPasswordRequest): Promise<User> {
    this.assert(can.resetPassword(actor));
    await this.getOrThrow(id);
    await this.users.setPassword(id, await hashPassword(input.temporaryPassword), true);
    await this.sessions.destroyAllForUser(id);
    await this.audit.record({
      type: 'user.password_reset',
      userId: actor.id,
      entityType: 'user',
      entityId: id,
    });
    return this.getPublic(id);
  }

  async setPermissions(actor: User, id: number, perms: SetPermissionsRequest): Promise<User> {
    this.assert(can.setPermissions(actor));
    const target = await this.getOrThrow(id);
    if (target.role !== 'employee') {
      throw new BadRequestException('Права назначаются только сотрудникам');
    }
    await this.users.setPermissions(id, perms);
    await this.audit.record({
      type: 'user.permissions_changed',
      userId: actor.id,
      entityType: 'user',
      entityId: id,
      payload: { before: target.perms, after: perms },
    });
    return this.getPublic(id);
  }

  private assert(allowed: boolean): void {
    if (!allowed) throw new ForbiddenException('Недостаточно прав');
  }

  private async getOrThrow(id: number) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  private async getPublic(id: number): Promise<User> {
    return publicUser(await this.getOrThrow(id));
  }
}
