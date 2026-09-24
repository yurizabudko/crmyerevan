import { describe, expect, it } from 'vitest';
import { dayEnd, dayStart, toSearch } from './useTableQuery';

describe('table query helpers', () => {
  it('drops empty params', () => {
    expect(toSearch({ q: '', page: 2, stageIds: '1,3', priceMin: undefined })).toBe(
      'page=2&stageIds=1%2C3',
    );
  });

  it('builds Yerevan day boundaries', () => {
    expect(dayStart('2026-09-24')).toBe('2026-09-23T20:00:00.000Z');
    expect(dayEnd('2026-09-24')).toBe('2026-09-24T20:00:00.000Z');
    expect(dayEnd('2026-12-31')).toBe('2026-12-31T20:00:00.000Z');
    expect(dayStart('')).toBeUndefined();
  });
});
