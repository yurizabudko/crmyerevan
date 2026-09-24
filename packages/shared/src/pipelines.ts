/**
 * Коды системных этапов. Правила переходов привязаны к коду, а не к названию:
 * название этапа Владелец может менять, код — нет (решение В-7).
 */
export const LISTING_STAGES = ['new', 'call', 'available', 'meeting', 'closed'] as const;
export type ListingStageCode = (typeof LISTING_STAGES)[number];

export const CLIENT_STAGES = [
  'new',
  'call',
  'qualified',
  'selection',
  'showings',
  'negotiation',
  'deal_closed',
  'rejected',
] as const;
export type ClientStageCode = (typeof CLIENT_STAGES)[number];

export const PIPELINES = ['listings', 'clients'] as const;
export type Pipeline = (typeof PIPELINES)[number];

export interface SystemStage {
  code: string;
  name: string;
  isTerminal: boolean;
}

export const SYSTEM_STAGES: Record<Pipeline, readonly SystemStage[]> = {
  listings: [
    { code: 'new', name: 'Новое объявление', isTerminal: false },
    { code: 'call', name: 'Звонок', isTerminal: false },
    { code: 'available', name: 'Доступное объявление', isTerminal: false },
    { code: 'meeting', name: 'Назначена встреча', isTerminal: false },
    { code: 'closed', name: 'Закрыт объект', isTerminal: true },
  ],
  clients: [
    { code: 'new', name: 'Новый клиент', isTerminal: false },
    { code: 'call', name: 'Звонок', isTerminal: false },
    { code: 'qualified', name: 'Квалифицирован', isTerminal: false },
    { code: 'selection', name: 'Подбор объектов', isTerminal: false },
    { code: 'showings', name: 'Показы', isTerminal: false },
    { code: 'negotiation', name: 'Переговоры / бронь', isTerminal: false },
    { code: 'deal_closed', name: 'Сделка закрыта', isTerminal: true },
    { code: 'rejected', name: 'Отказ', isTerminal: true },
  ],
};

/** Этапы, в пределах которых партнёр может двигать карточки (Д-5, решение В-6). */
export const PARTNER_MOVABLE_STAGES: Record<Pipeline, readonly string[]> = {
  listings: ['new', 'call', 'available'],
  clients: ['new', 'call', 'qualified'],
};

/** Этапы воронки клиентов, на которых карточка может стать просроченной (БТ-4.2.1). */
export const OVERDUE_CLIENT_STAGES: readonly ClientStageCode[] = ['new', 'call', 'qualified'];
export const OVERDUE_AFTER_HOURS = 48;

export const LISTING_CLOSE_OUTCOMES = ['success', 'lost'] as const;
export type ListingCloseOutcome = (typeof LISTING_CLOSE_OUTCOMES)[number];

export const CLIENT_LISTING_LINK_STATUSES = [
  'proposed',
  'showing_scheduled',
  'shown',
  'client_rejected',
  'chosen',
] as const;
export type ClientListingLinkStatus = (typeof CLIENT_LISTING_LINK_STATUSES)[number];

/** Допустимые проценты комиссии агентства (БТ-2.3.1). */
export const COMMISSION_PERCENTS = [20, 25, 30, 40, 45, 50] as const;
