export type PeriodPreset = 'today' | 'week' | 'month' | 'custom';

export interface Period {
  from: string;
  to: string;
}

const OFFSET = '+04:00';

/** Сегодняшняя дата в Ереване (YYYY-MM-DD) — от неё считаются периоды дашборда. */
export function yerevanToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan' }).format(now);
}

const start = (day: string) => new Date(`${day}T00:00:00${OFFSET}`);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/**
 * Периоды 6.1 в ереванских сутках: сегодня, неделя с понедельника, месяц с первого числа,
 * произвольный диапазон (обе даты включительно). Конец периода не включается.
 */
export function periodOf(
  preset: PeriodPreset,
  custom: { from: string; to: string },
  now = new Date(),
): Period | null {
  const today = yerevanToday(now);
  const tomorrow = addDays(start(today), 1);
  switch (preset) {
    case 'today':
      return { from: start(today).toISOString(), to: tomorrow.toISOString() };
    case 'week': {
      // День недели ереванской даты; понедельник — 0.
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: addDays(start(today), -weekday).toISOString(), to: tomorrow.toISOString() };
    }
    case 'month':
      return { from: start(`${today.slice(0, 8)}01`).toISOString(), to: tomorrow.toISOString() };
    case 'custom':
      if (!custom.from || !custom.to || custom.from > custom.to) return null;
      return {
        from: start(custom.from).toISOString(),
        to: addDays(start(custom.to), 1).toISOString(),
      };
  }
}
