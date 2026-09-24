/**
 * CSV для Excel в русской локали: разделитель «;», UTF-8 с BOM,
 * кавычки по RFC 4180. Значения, начинающиеся с =,+,-,@, экранируются апострофом,
 * чтобы Excel не выполнил их как формулу (CSV-инъекция).
 */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}
