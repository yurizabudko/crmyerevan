import { describe, expect, it } from 'vitest';
import { toClientDto, type ClientRow } from './client.mapper.js';

const now = new Date('2026-09-24T12:00:00Z');
const row = (patch: Partial<ClientRow>) =>
  ({ Id: 1, CreatedAt: '2026-09-01 10:00:00+00:00', stage_id: 1, ...patch }) as ClientRow;

describe('toClientDto overdue flag', () => {
  const early = new Set([1, 2, 3]);

  it('marks early-stage clients idle for more than 48 hours', () => {
    expect(
      toClientDto(row({ last_activity_at: '2026-09-22 11:59:00+00:00' }), early, now).isOverdue,
    ).toBe(true);
    expect(
      toClientDto(row({ last_activity_at: '2026-09-22 12:01:00+00:00' }), early, now).isOverdue,
    ).toBe(false);
  });

  it('ignores later stages', () => {
    expect(
      toClientDto(row({ stage_id: 5, last_activity_at: '2026-09-01 10:00:00+00:00' }), early, now)
        .isOverdue,
    ).toBe(false);
  });

  it('falls back to creation time without activity', () => {
    expect(toClientDto(row({ last_activity_at: null }), early, now).isOverdue).toBe(true);
  });
});
