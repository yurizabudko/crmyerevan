import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS } from '../infra/infra.module.js';

/** Срок сессии — 7 дней с момента входа, без продления (БТ-2.4.5). */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_COOKIE = 'crm_sid';

export interface Session {
  userId: number;
  createdAt: string;
}

const sessionKey = (hash: string) => `sess:${hash}`;
const userSessionsKey = (userId: number) => `user_sess:${userId}`;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Сессии в Redis. В cookie — случайный токен, в Redis — только его хеш,
 * чтобы утечка дампа Redis не давала готовых токенов.
 */
@Injectable()
export class SessionStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async create(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const hash = digest(token);
    const session: Session = { userId, createdAt: new Date().toISOString() };
    await this.redis
      .multi()
      .set(sessionKey(hash), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
      .sadd(userSessionsKey(userId), hash)
      .expire(userSessionsKey(userId), SESSION_TTL_SECONDS)
      .exec();
    return token;
  }

  async get(token: string): Promise<Session | null> {
    const raw = await this.redis.get(sessionKey(digest(token)));
    return raw ? (JSON.parse(raw) as Session) : null;
  }

  async destroy(token: string): Promise<void> {
    const hash = digest(token);
    const session = await this.get(token);
    const tx = this.redis.multi().del(sessionKey(hash));
    if (session) tx.srem(userSessionsKey(session.userId), hash);
    await tx.exec();
  }

  /** Завершает все сессии пользователя: блокировка, сброс или смена пароля. */
  async destroyAllForUser(userId: number, exceptToken?: string): Promise<void> {
    const keep = exceptToken ? digest(exceptToken) : undefined;
    const hashes = await this.redis.smembers(userSessionsKey(userId));
    const toDrop = hashes.filter((h) => h !== keep);
    if (toDrop.length === 0) return;
    await this.redis
      .multi()
      .del(...toDrop.map(sessionKey))
      .srem(userSessionsKey(userId), ...toDrop)
      .exec();
  }
}
