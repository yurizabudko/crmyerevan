/** Партнёрская подписка (8.1, 8.3). */
export const SUBSCRIPTION_PRICE = 1000;
export const SUBSCRIPTION_CURRENCY = 'RUB';
export const PERIOD_DAYS = 30;
export const TRIAL_DAYS = 30;
/** За сколько дней предупреждать о списании/конце триала (БТ-8.3.3). */
export const NOTIFY_BEFORE_DAYS = 3;
/** Повторные попытки после неудачного списания — дни от первой неудачи (БТ-8.3.4). */
export const RETRY_DAYS = [1, 3, 7] as const;
export const GRACE_DAYS = 7;

export const SUBSCRIPTION_STATUSES = [
  'none',
  'trial',
  'active',
  'grace',
  'frozen',
  'canceled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Статусы, при которых партнёр работает в CRM; иначе — только страница оплаты (БТ-8.3.5). */
export const ACCESS_STATUSES: readonly SubscriptionStatus[] = ['trial', 'active', 'grace'];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  none: 'не активирована',
  trial: 'бесплатный период',
  active: 'активна',
  grace: 'ошибка оплаты',
  frozen: 'заморожена',
  canceled: 'отменена',
};

export interface SubscriptionDto {
  status: SubscriptionStatus;
  autoRenew: boolean;
  periodEnd: string | null;
  nextChargeAt: string | null;
  graceUntil: string | null;
  retryAt: string | null;
  failedAttempts: number;
  price: number;
  currency: string;
  card: { mask: string } | null;
  telegramLinked: boolean;
  /** Провайдер платежей: mock — тестовый режим без реальных денег. */
  provider: string;
}

export interface PaymentDto {
  id: number;
  at: string | null;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending';
  error: string | null;
}

export interface PartnerDealDto {
  dealId: number;
  closedAt: string | null;
  listingTitle: string | null;
  clientName: string | null;
  /** Финальная цена видна партнёру, комиссия агентства — нет (Д-12). */
  finalPrice: number | null;
  currency: string | null;
  basis: string | null;
  reward: number;
  rewardStatus: 'accrued' | 'paid' | 'on_hold';
  paidAt: string | null;
}
