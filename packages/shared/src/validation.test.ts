import { describe, expect, it } from 'vitest';
import { ListingDraft, ListingPatch, passwordSchema } from './validation.js';

describe('passwordSchema', () => {
  it.each(['abcdefg1', 'Пароль123', 'long password 2026'])('accepts %s', (pwd) => {
    expect(passwordSchema.safeParse(pwd).success).toBe(true);
  });

  it.each(['abc1', 'abcdefgh', '12345678'])('rejects %s', (pwd) => {
    expect(passwordSchema.safeParse(pwd).success).toBe(false);
  });
});

describe('ListingDraft', () => {
  it('drops empty optional strings and coerces numbers', () => {
    const draft = ListingDraft.parse({
      title: ' 2 комн. Кентрон ',
      description: '',
      price: '85000',
      rooms: '2',
      sourceUrl: '',
    });
    expect(draft).toEqual({ title: '2 комн. Кентрон', currency: 'USD', price: 85000, rooms: 2 });
  });
});

describe('ListingPatch', () => {
  it('keeps null for clearing and rejects odd commissions', () => {
    const patch = ListingPatch.parse({ version: 3, price: null, rooms: '4', ownerName: '  ' });
    expect(patch).toEqual({ version: 3, price: null, rooms: 4, ownerName: null });
    expect(ListingPatch.safeParse({ version: 1, commissionPercent: 35 }).success).toBe(false);
    expect(ListingPatch.parse({ version: 1, commissionPercent: '25' }).commissionPercent).toBe(25);
  });

  it('validates meeting dates', () => {
    expect(ListingPatch.safeParse({ version: 1, meetingAt: 'завтра' }).success).toBe(false);
    expect(
      ListingPatch.safeParse({ version: 1, meetingAt: '2026-10-01T10:00:00.000Z' }).success,
    ).toBe(true);
  });
});
