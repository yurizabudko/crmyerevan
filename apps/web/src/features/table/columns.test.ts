import { describe, expect, it } from 'vitest';
import { arrangeColumns, type ColumnDef } from './columns';

const col = (key: string) =>
  ({ key, label: key, sortable: false, render: () => null }) as ColumnDef<unknown>;

describe('arrangeColumns', () => {
  it('applies the saved order and appends new columns', () => {
    const all = [col('a'), col('b'), col('c'), col('d')];
    expect(arrangeColumns(all, { order: ['c', 'x', 'a'], hidden: [] }).map((c) => c.key)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });
});
