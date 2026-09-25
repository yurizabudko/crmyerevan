import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEvery } from './background.js';

afterEach(() => vi.useRealTimers());

describe('runEvery', () => {
  it('logs a failed run and keeps running', async () => {
    vi.useFakeTimers();
    const logger = { error: vi.fn() };
    const job = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue();
    const timer = runEvery(1000, logger, 'сверка', job);

    await vi.advanceTimersByTimeAsync(2000);
    clearInterval(timer);

    expect(job).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('сверка: connect ECONNREFUSED');
  });
});
