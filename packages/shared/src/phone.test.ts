import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['+374 91 123456', '+37491123456'],
    ['+374 (91) 12-34-56', '+37491123456'],
    ['091 123 456', '+37491123456'],
    ['091123456', '+37491123456'],
    ['91123456', '+37491123456'],
    ['0037491123456', '+37491123456'],
    ['37491123456', '+37491123456'],
    ['+7 916 123-45-67', '+79161234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', 'нет телефона', '12345'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
