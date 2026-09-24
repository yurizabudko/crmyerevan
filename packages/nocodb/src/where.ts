/**
 * Построитель фильтров NocoDB (параметр `where`).
 *
 * Особенности, проверенные на NocoDB 2026.09:
 * - значения передаются как есть, без кавычек и экранирования; запятые и скобки
 *   внутри значения допустимы, но последовательность `)~` сломает разбор;
 * - `(field,is,null)` фильтр игнорирует — для пустых значений нужен `blank`/`notblank`;
 * - две группы подряд на одном уровне — «Invalid filter format»: `(A~or~B)~and(C~or~D)`.
 *   Между ними вставляется нейтральное условие по первичному ключу (см. `join`).
 */
export type Scalar = string | number | boolean;

export type Condition = string & { readonly __brand: 'Condition' };

function assertSafe(value: Scalar): string {
  const str = String(value);
  if (str.includes(')~')) {
    throw new Error(`Значение фильтра содержит недопустимую последовательность ")~": ${str}`);
  }
  return str;
}

function cond(field: string, op: string, value?: Scalar | readonly Scalar[]): Condition {
  if (value === undefined) return `(${field},${op})` as Condition;
  const rendered = Array.isArray(value)
    ? (value as readonly Scalar[]).map(assertSafe).join(',')
    : assertSafe(value as Scalar);
  return `(${field},${op},${rendered})` as Condition;
}

function dateValue(value: Date): string {
  return `exactDate,${value
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '')}`;
}

export const w = {
  eq: (field: string, value: Scalar) => cond(field, 'eq', value),
  neq: (field: string, value: Scalar) => cond(field, 'neq', value),
  gt: (field: string, value: number) => cond(field, 'gt', value),
  gte: (field: string, value: number) => cond(field, 'gte', value),
  lt: (field: string, value: number) => cond(field, 'lt', value),
  lte: (field: string, value: number) => cond(field, 'lte', value),
  like: (field: string, value: string) => cond(field, 'like', value),
  in: (field: string, values: readonly Scalar[]) => {
    if (values.length === 0) throw new Error(`Пустой список значений для ${field}`);
    return cond(field, 'in', values);
  },
  blank: (field: string) => cond(field, 'blank'),
  notBlank: (field: string) => cond(field, 'notblank'),
  after: (field: string, value: Date) => cond(field, 'gt', dateValue(value)),
  onOrAfter: (field: string, value: Date) => cond(field, 'gte', dateValue(value)),
  before: (field: string, value: Date) => cond(field, 'lt', dateValue(value)),
  and: (...conditions: Condition[]) => join('and', conditions),
  or: (...conditions: Condition[]) => join('or', conditions),
};

const isGroup = (c: Condition) => c.startsWith('((');

/** Нейтральные условия: `Id` есть у каждой записи — истина для AND, ложь для OR. */
const NEUTRAL = { and: '(Id,notblank)', or: '(Id,blank)' } as const;

function join(op: 'and' | 'or', conditions: Condition[]): Condition {
  if (conditions.length === 0) throw new Error('Пустой набор условий');
  if (conditions.length === 1) return conditions[0]!;
  const parts: string[] = [];
  conditions.forEach((c, i) => {
    if (i > 0 && isGroup(c) && isGroup(conditions[i - 1]!)) parts.push(NEUTRAL[op]);
    parts.push(c);
  });
  return `(${parts.join(`~${op}`)})` as Condition;
}
