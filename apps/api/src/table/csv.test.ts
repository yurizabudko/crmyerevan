import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('writes a BOM, semicolons and CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('﻿a;b\r\n1;\r\n');
  });

  it('quotes separators, quotes and new lines', () => {
    expect(toCsv(['x'], [['2 комн.; центр'], ['он сказал "да"'], ['две\nстроки']])).toBe(
      '﻿x\r\n"2 комн.; центр"\r\n"он сказал ""да"""\r\n"две\nстроки"\r\n',
    );
  });

  it('neutralises formula injection in text cells', () => {
    expect(toCsv(['x'], [['=HYPERLINK("evil")'], ['+374 91 000000'], [-5]])).toBe(
      '﻿x\r\n"\'=HYPERLINK(""evil"")"\r\n\'+374 91 000000\r\n-5\r\n',
    );
  });
});
