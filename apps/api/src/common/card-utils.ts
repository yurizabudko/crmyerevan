import { BadRequestException, ConflictException } from '@nestjs/common';
import type { NocoDb } from '@crm/nocodb';
import type { DictionaryKind } from '@crm/shared';

/** Проверка версии, которую видел пользователь (оптимистичная блокировка, НФТ-2). */
export function assertVersion(row: { version: number | null }, version: number): void {
  if ((row.version ?? 1) !== version) {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Карточку уже изменил другой пользователь — обновите и повторите',
    });
  }
}

/** NocoDB отдаёт «2026-10-01 10:00:00+00:00» — приводим к формату, понятному Date. */
export function toDate(value: string): Date {
  return new Date(value.replace(' ', 'T'));
}

export function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return toDate(a).getTime() === toDate(b).getTime();
}

/** Дата-время для истории карточки — по Еревану, где проходят встречи и показы. */
export function formatMoment(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Yerevan',
  }).format(toDate(value));
}

/** Сравнение старого и нового значения поля при правке карточки. */
export function sameValue(before: unknown, after: unknown, isDate = false): boolean {
  if (before === null || before === undefined) return after === null;
  if (after === null) return false;
  if (isDate) return sameInstant(String(before), String(after));
  if (Array.isArray(after)) return JSON.stringify(before) === JSON.stringify(after);
  if (typeof after === 'number') return Number(before) === after;
  return before === after;
}

/** Значение справочника существует и относится к нужному справочнику. */
export async function assertDictionaryItem(
  db: NocoDb,
  id: number,
  kind: DictionaryKind,
  label: string,
): Promise<string> {
  const item = await db.table('dictionary_items').get(id);
  if (!item || item.kind !== kind) throw new BadRequestException(`${label}: значение не найдено`);
  return item.name ?? String(id);
}

export function historyEntry(
  labels: Record<string, string>,
  field: string,
  oldValue: string | null,
  newValue: string | null,
) {
  const label = labels[field] ?? field;
  return {
    body: `${label}: ${oldValue ?? '—'} → ${newValue ?? '—'}`,
    change: { field, oldValue, newValue },
  };
}
