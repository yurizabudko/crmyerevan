import type { Uidt } from './meta.js';

export interface ColumnSpec<TValue> {
  uidt: Uidt;
  /** Фантомное поле для вывода TS-типа значения. */
  readonly __value?: TValue;
}

const col =
  <TValue>(uidt: Uidt) =>
  (): ColumnSpec<TValue> => ({ uidt });

/** Конструкторы колонок схемы. Все поля nullable: обязательность проверяет приложение. */
export const c = {
  text: col<string>('SingleLineText'),
  longText: col<string>('LongText'),
  int: col<number>('Number'),
  decimal: col<number>('Decimal'),
  bool: col<boolean>('Checkbox'),
  /** Дата-время в UTC, в API приходит как `YYYY-MM-DD HH:mm:ss+00:00`. */
  datetime: col<string>('DateTime'),
  json: <T = unknown>() => col<T>('JSON')(),
};

export type TableSpec = Record<string, ColumnSpec<unknown>>;

/** Тип записи таблицы, выведенный из её спецификации. */
export type RowOf<TSpec extends TableSpec> = {
  [K in keyof TSpec]: TSpec[K] extends ColumnSpec<infer V> ? V | null : never;
} & {
  CreatedAt: string;
  UpdatedAt: string | null;
};
