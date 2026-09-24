const ARMENIA_CODE = '374';

/**
 * Приводит телефон к виду E.164 (+374XXXXXXXX для армянских номеров).
 * Возвращает null, если в строке нет правдоподобного номера.
 * Используется для проверки уникальности телефона клиента (БТ-4.3).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (!hasPlus) {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === 9) {
      // Внутренний армянский формат: 0XX XXXXXX
      digits = ARMENIA_CODE + digits.slice(1);
    } else if (digits.length === 8) {
      // Номер без кода страны и без ведущего нуля
      digits = ARMENIA_CODE + digits;
    }
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
