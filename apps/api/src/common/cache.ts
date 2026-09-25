import type { Redis } from 'ioredis';

/**
 * Кэш тяжёлых выборок в Redis на несколько секунд. Если Redis недоступен,
 * значение просто считается заново — кэш не должен ломать ответ.
 */
export async function cached<T>(
  redis: Pick<Redis, 'get' | 'set'>,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  if (ttlSeconds <= 0) return compute();
  const hit = await redis.get(key).catch(() => null);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await compute();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch(() => undefined);
  return value;
}
