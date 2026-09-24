const CURRENCY_SIGN: Record<string, string> = { USD: '$', AMD: '֏', RUB: '₽', EUR: '€' };

export function formatPrice(price: number | null, currency: string | null): string {
  if (price === null) return '—';
  const amount = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(price);
  return `${amount} ${CURRENCY_SIGN[currency ?? ''] ?? currency ?? ''}`.trim();
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Yerevan',
  }).format(new Date(value.replace(' ', 'T')));
}

/**
 * Встречи и показы проходят в Ереване, поэтому дата вводится и показывается по Еревану,
 * где бы ни находился пользователь (удалённые партнёры). В Армении нет перехода на летнее время.
 */
const YEREVAN_OFFSET = '+04:00';

/** Значение <input type="datetime-local"> (время Еревана) → ISO UTC. */
export function yerevanInputToIso(value: string): string {
  return new Date(`${value}:00${YEREVAN_OFFSET}`).toISOString();
}

/** Дата из API → значение для <input type="datetime-local"> по времени Еревана. */
export function isoToYerevanInput(value: string | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value.replace(' ', 'T')));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
