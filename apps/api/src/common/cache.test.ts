import { describe, expect, it, vi } from 'vitest';
import { cached } from './cache.js';

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK' as const;
    }),
  };
}

describe('cached', () => {
  it('computes once and serves the cached value', async () => {
    const redis = fakeRedis();
    const compute = vi.fn(async () => ({ total: 3 }));
    expect(await cached(redis as never, 'k', 30, compute)).toEqual({ total: 3 });
    expect(await cached(redis as never, 'k', 30, compute)).toEqual({ total: 3 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('falls back to computing when Redis is down', async () => {
    const down = {
      get: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
      set: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
    };
    expect(await cached(down as never, 'k', 30, async () => 42)).toBe(42);
  });

  it('is disabled with a zero TTL', async () => {
    const redis = fakeRedis();
    await cached(redis as never, 'k', 0, async () => 1);
    expect(redis.get).not.toHaveBeenCalled();
  });
});
