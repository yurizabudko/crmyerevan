import { describe, expect, it } from 'vitest';
import { ClientTableQuery, ListingTableQuery } from './table.js';

describe('table queries', () => {
  it('parses query strings with defaults', () => {
    expect(ListingTableQuery.parse({ stageIds: '3,x,5', priceMax: '100000' })).toEqual({
      page: 1,
      pageSize: 50,
      stageIds: [3, 5],
      priceMax: 100000,
    });
  });

  it('rejects oversized pages and bad dates', () => {
    expect(ListingTableQuery.safeParse({ pageSize: '5000' }).success).toBe(false);
    expect(ClientTableQuery.safeParse({ createdFrom: 'вчера' }).success).toBe(false);
    expect(ClientTableQuery.parse({ columns: 'name,phone' }).columns).toEqual(['name', 'phone']);
  });
});
