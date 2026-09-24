import type { StageDto } from '@crm/shared';
import { describe, expect, it } from 'vitest';
import { conversions, countByStage, inScope, sumByCurrency } from './metrics.js';

const codes = [
  'new',
  'call',
  'qualified',
  'selection',
  'showings',
  'negotiation',
  'deal_closed',
  'rejected',
];
const stages: StageDto[] = codes.map((code, i) => ({
  id: i + 1,
  code,
  name: code,
  position: i,
  isSystem: true,
  isTerminal: false,
}));
const id = (code: string) => codes.indexOf(code) + 1;
const t = (entity: number, code: string, at: string) => ({
  entity_id: entity,
  to_stage_id: id(code),
  at,
});

const from = new Date('2026-09-01T00:00:00Z');
const to = new Date('2026-10-01T00:00:00Z');

describe('conversions', () => {
  it('counts cohorts that entered a stage in the period', () => {
    const rows = [
      t(1, 'call', '2026-09-02 10:00:00+00:00'),
      t(1, 'qualified', '2026-09-03 10:00:00+00:00'),
      t(2, 'call', '2026-09-05 10:00:00+00:00'),
      // Вошёл в «Звонок» до периода — не в когорте контакта, но в когорте квалификации.
      t(3, 'call', '2026-08-20 10:00:00+00:00'),
      t(3, 'qualified', '2026-09-10 10:00:00+00:00'),
      // Перескок: сразу в «Показы» — засчитан и в контакт→квалификацию, и в квалификацию→показ.
      t(4, 'showings', '2026-09-12 10:00:00+00:00'),
      t(4, 'deal_closed', '2026-10-02 10:00:00+00:00'),
    ];
    const result = conversions(stages, rows, from, to, null);
    expect(result.map((c) => [c.key, c.converted, c.total])).toEqual([
      ['contact_qualified', 2, 3],
      ['qualified_showing', 1, 3],
      ['showing_deal', 1, 1],
    ]);
  });

  it('limits to the given clients', () => {
    const rows = [
      t(1, 'call', '2026-09-02 10:00:00+00:00'),
      t(2, 'call', '2026-09-02 10:00:00+00:00'),
    ];
    expect(conversions(stages, rows, from, to, new Set([2]))[0]).toMatchObject({ total: 1 });
  });
});

describe('helpers', () => {
  it('counts rows per stage in stage order', () => {
    expect(
      countByStage(stages.slice(0, 2), [{ stage_id: 2 }, { stage_id: 2 }, { stage_id: 9 }]),
    ).toEqual([
      { stageId: 1, name: 'new', count: 0 },
      { stageId: 2, name: 'call', count: 2 },
    ]);
  });

  it('sums money per currency, largest first', () => {
    expect(
      sumByCurrency([
        { amount: 100.005, currency: 'USD' },
        { amount: 50000, currency: 'AMD' },
        { amount: 200, currency: null },
        { amount: null, currency: 'USD' },
      ]),
    ).toEqual([
      { currency: 'AMD', amount: 50000 },
      { currency: 'USD', amount: 300.01 },
    ]);
  });

  it('checks scope membership', () => {
    expect(inScope(null, null)).toBe(true);
    expect(inScope(new Set([1]), 1)).toBe(true);
    expect(inScope(new Set([1]), null)).toBe(false);
  });
});
