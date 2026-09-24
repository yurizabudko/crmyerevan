import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/**
 * Короткая распределённая блокировка на Redis. В NocoDB нет транзакций и
 * уникальных ограничений, поэтому проверка «нет ли уже такой записи» и создание
 * выполняются под блокировкой по ключу (НФТ-2).
 */
export async function withLock<T>(
  redis: Redis,
  key: string,
  fn: () => Promise<T>,
  { ttlMs = 10_000, waitMs = 3_000 } = {},
): Promise<T> {
  const token = randomUUID();
  const lockKey = `lock:${key}`;
  const deadline = Date.now() + waitMs;
  while ((await redis.set(lockKey, token, 'PX', ttlMs, 'NX')) !== 'OK') {
    if (Date.now() > deadline) {
      throw new ConflictException('Запись сейчас изменяет другой пользователь, повторите попытку');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
  }
}
