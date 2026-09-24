import { describe, expect, it } from 'vitest';
import { periodOf, yerevanToday } from './period';

// Четверг, 24 сентября 2026, 22:30 по Еревану (18:30 UTC).
const now = new Date('2026-09-24T18:30:00Z');
const none = { from: '', to: '' };

describe('dashboard periods', () => {
  it('uses the Yerevan date even when UTC is still the previous day', () => {
    expect(yerevanToday(new Date('2026-09-24T21:00:00Z'))).toBe('2026-09-25');
  });

  it('builds today, week and month', () => {
    expect(periodOf('today', none, now)).toEqual({
      from: '2026-09-23T20:00:00.000Z',
      to: '2026-09-24T20:00:00.000Z',
    });
    // Неделя — с понедельника 21 сентября.
    expect(periodOf('week', none, now)?.from).toBe('2026-09-20T20:00:00.000Z');
    expect(periodOf('month', none, now)?.from).toBe('2026-08-31T20:00:00.000Z');
  });

  it('includes both ends of a custom range and rejects reversed ones', () => {
    expect(periodOf('custom', { from: '2026-09-01', to: '2026-09-10' }, now)).toEqual({
      from: '2026-08-31T20:00:00.000Z',
      to: '2026-09-10T20:00:00.000Z',
    });
    expect(periodOf('custom', { from: '2026-09-10', to: '2026-09-01' }, now)).toBeNull();
  });
});
