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
