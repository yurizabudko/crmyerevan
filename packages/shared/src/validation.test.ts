import { describe, expect, it } from 'vitest';
import { ListingDraft, passwordSchema } from './validation.js';

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
