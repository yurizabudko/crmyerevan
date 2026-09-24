import { describe, expect, it } from 'vitest';
import { isoToYerevanInput, yerevanInputToIso } from './format';

describe('Yerevan time inputs', () => {
  it('treats input as Yerevan time regardless of browser zone', () => {
    expect(yerevanInputToIso('2026-10-02T15:30')).toBe('2026-10-02T11:30:00.000Z');
  });

  it('round-trips NocoDB timestamps', () => {
    expect(isoToYerevanInput('2026-10-02 11:30:00+00:00')).toBe('2026-10-02T15:30');
    expect(isoToYerevanInput(yerevanInputToIso('2026-12-31T23:45'))).toBe('2026-12-31T23:45');
    expect(isoToYerevanInput(null)).toBe('');
  });
});
