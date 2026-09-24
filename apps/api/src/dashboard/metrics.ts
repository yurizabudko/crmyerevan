import type { Conversion, MoneyByCurrency, StageCount, StageDto } from '@crm/shared';

/** Пользователи среза: null — вся команда. */
export type Scope = Set<number> | null;

export const inScope = (scope: Scope, userId: number | null | undefined): boolean =>
  scope === null || (userId !== null && userId !== undefined && scope.has(userId));

export function countByStage(
  stages: StageDto[],
  rows: { stage_id: number | null }[],
): StageCount[] {
  return stages.map((s) => ({
    stageId: s.id,
    name: s.name,
    count: rows.filter((r) => r.stage_id === s.id).length,
  }));
}

export function sumByCurrency(
  rows: { amount: number | null; currency: string | null }[],
): MoneyByCurrency[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.amount === null) continue;
    const currency = r.currency ?? 'USD';
    totals.set(currency, (totals.get(currency) ?? 0) + r.amount);
  }
  return [...totals]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface TransitionRow {
  entity_id: number | null;
  to_stage_id: number | null;
  at: string | null;
}

const CONVERSIONS: { key: Conversion['key']; label: string; from: string; to: string[] }[] = [
  {
    key: 'contact_qualified',
    label: 'Контакт → квалификация',
    from: 'call',
    to: ['qualified', 'selection', 'showings', 'negotiation', 'deal_closed'],
  },
  {
    key: 'qualified_showing',
    label: 'Квалификация → показ',
    from: 'qualified',
    to: ['showings', 'negotiation', 'deal_closed'],
  },
  { key: 'showing_deal', label: 'Показ → сделка', from: 'showings', to: ['deal_closed'] },
];

/**
 * Конверсии по когортам (виджет 3): из клиентов, впервые дошедших до этапа A за период,
 * сколько к сегодняшнему дню дошли до B или дальше. Перескок этапа тоже засчитывается.
 * Нужна вся история переходов, а не только за период — иначе не узнать «впервые».
 */
export function conversions(
  stages: StageDto[],
  transitions: TransitionRow[],
  from: Date,
  to: Date,
  clientIds: Set<number> | null,
): Conversion[] {
  const idOf = (code: string) => stages.find((s) => s.code === code)?.id;
  const relevant = transitions.filter(
    (t) => t.entity_id !== null && (clientIds === null || clientIds.has(t.entity_id)),
  );

  return CONVERSIONS.map(({ key, label, from: fromCode, to: toCodes }) => {
    const fromId = idOf(fromCode);
    const toIds = new Set(toCodes.map(idOf).filter((id): id is number => id !== undefined));
    // Когорта: клиент впервые дошёл до A (или сразу дальше, перескочив A) внутри периода.
    const firstArrival = new Map<number, number>();
    for (const t of relevant) {
      if (!t.at || (t.to_stage_id !== fromId && !toIds.has(t.to_stage_id ?? -1))) continue;
      const time = new Date(t.at.replace(' ', 'T')).getTime();
      const prev = firstArrival.get(t.entity_id!);
      if (prev === undefined || time < prev) firstArrival.set(t.entity_id!, time);
    }
    const entered = new Set(
      [...firstArrival]
        .filter(([, time]) => time >= from.getTime() && time < to.getTime())
        .map(([entity]) => entity),
    );
    const reached = new Set(
      relevant.filter((t) => toIds.has(t.to_stage_id ?? -1)).map((t) => t.entity_id!),
    );
    const converted = [...entered].filter((id) => reached.has(id)).length;
    return { key, label, converted, total: entered.size };
  });
}
