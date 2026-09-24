import { describe, expect, it } from 'vitest';
import { w } from './where.js';

describe('where builder', () => {
  it('renders simple conditions', () => {
    expect(w.eq('source_url', 'https://www.list.am/item/1')).toBe(
      '(source_url,eq,https://www.list.am/item/1)',
    );
    expect(w.in('stage_id', [1, 2])).toBe('(stage_id,in,1,2)');
    expect(w.blank('deleted_at')).toBe('(deleted_at,blank)');
  });

  it('keeps commas and brackets inside values', () => {
    expect(w.eq('title', '2 комн., Кентрон (центр)')).toBe('(title,eq,2 комн., Кентрон (центр))');
  });

  it('rejects values that would break the parser', () => {
    expect(() => w.eq('title', 'a)~or(b')).toThrow();
  });

  it('renders dates as exactDate in UTC', () => {
    expect(w.before('last_activity_at', new Date('2026-09-24T10:00:00.123Z'))).toBe(
      '(last_activity_at,lt,exactDate,2026-09-24 10:00:00)',
    );
  });

  it('combines conditions', () => {
    expect(w.and(w.eq('a', 1), w.or(w.eq('b', 2), w.eq('c', 3)))).toBe(
      '((a,eq,1)~and((b,eq,2)~or(c,eq,3)))',
    );
    expect(w.and(w.eq('a', 1))).toBe('(a,eq,1)');
  });

  it('rejects empty lists', () => {
    expect(() => w.in('a', [])).toThrow();
  });
});
