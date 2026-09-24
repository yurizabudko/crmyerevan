import { Inject, Injectable } from '@nestjs/common';
import { w, type NocoDb, type Row, type WithId } from '@crm/nocodb';
import type { Actor, Role, UserDto, UserStatus } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';

export type User = UserDto;

export interface UserWithSecret extends User {
  passwordHash: string;
}

type UserRow = WithId<Row<'users'>>;

function toUser(row: UserRow): UserWithSecret {
  return {
    id: row.Id,
    login: row.login ?? '',
    displayName: row.display_name ?? row.login ?? '',
    role: (row.role ?? 'partner') as Role,
    status: (row.status ?? 'blocked') as UserStatus,
    mustChangePassword: Boolean(row.must_change_password),
    perms: {
      grantAccess: Boolean(row.perm_grant_access),
      deleteCards: Boolean(row.perm_delete_cards),
      manageDictionaries: Boolean(row.perm_manage_dictionaries),
    },
    createdById: row.created_by_id,
    createdAt: row.CreatedAt,
    lastLoginAt: row.last_login_at,
    passwordHash: row.password_hash ?? '',
  };
}

/** Убирает хеш пароля перед отдачей наружу (НФТ-6). */
export function publicUser({ passwordHash: _hash, ...user }: UserWithSecret): User {
  return user;
}

export interface NewUser {
  login: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  perms: Actor['perms'];
  createdById: number | null;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(NOCODB) private readonly db: NocoDb) {}

  private get table() {
    return this.db.table('users');
  }

  async findById(id: number): Promise<UserWithSecret | null> {
    const row = await this.table.get(id);
    return row ? toUser(row) : null;
  }

  async findByLogin(login: string): Promise<UserWithSecret | null> {
    const row = await this.table.findOne(w.eq('login', login.toLowerCase()));
    return row ? toUser(row) : null;
  }

  async list(): Promise<User[]> {
    const rows = await this.table.listAll({ sort: ['login'] });
    return rows.map((row) => publicUser(toUser(row)));
  }

  async create(user: NewUser): Promise<number> {
    return this.table.create({
      login: user.login.toLowerCase(),
      display_name: user.displayName,
      role: user.role,
      status: 'active',
      password_hash: user.passwordHash,
      must_change_password: true,
      perm_grant_access: user.perms.grantAccess,
      perm_delete_cards: user.perms.deleteCards,
      perm_manage_dictionaries: user.perms.manageDictionaries,
      created_by_id: user.createdById,
      version: 1,
    });
  }

  async setStatus(id: number, status: UserStatus): Promise<void> {
    await this.table.update(id, { status });
  }

  async setPassword(id: number, passwordHash: string, mustChange: boolean): Promise<void> {
    await this.table.update(id, { password_hash: passwordHash, must_change_password: mustChange });
  }

  async setPermissions(id: number, perms: Actor['perms']): Promise<void> {
    await this.table.update(id, {
      perm_grant_access: perms.grantAccess,
      perm_delete_cards: perms.deleteCards,
      perm_manage_dictionaries: perms.manageDictionaries,
    });
  }

  async touchLogin(id: number): Promise<void> {
    await this.table.update(id, { last_login_at: new Date().toISOString() });
  }
}
