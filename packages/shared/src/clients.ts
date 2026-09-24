import { z } from 'zod';
import type { Actor } from './permissions.js';
import { PARTNER_MOVABLE_STAGES } from './pipelines.js';

const CURRENCIES = ['USD', 'AMD', 'RUB', 'EUR'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));
// null проверяется первым: z.coerce.number() превратил бы null в 0.
const clearableNumber = (schema: z.ZodNumber) => z.null().or(z.coerce.number().pipe(schema));
const money = z.number().nonnegative();
const id = z.number().int().positive();
const isoDateTime = z.iso.datetime({ offset: true, message: 'Некорректная дата и время' });

/** Новый клиент (4.1, этап 1): только вручную, телефон и источник обязательны. */
export const ClientDraft = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(150),
  phone: z.string().trim().min(5, 'Укажите телефон').max(40),
  messenger: optionalText(100),
  sourceId: z.coerce.number().pipe(id.refine(Boolean, 'Укажите источник')),
  budgetMin: z.coerce.number().pipe(money).optional(),
  budgetMax: z.coerce.number().pipe(money).optional(),
  currency: z.enum(CURRENCIES).default('USD'),
  districtIds: z.array(z.coerce.number().pipe(id)).max(20).optional(),
  propertyTypeId: z.coerce.number().pipe(id).optional(),
  roomsMin: z.coerce.number().int().min(0).max(50).optional(),
  roomsMax: z.coerce.number().int().min(0).max(50).optional(),
  floorPreference: optionalText(100),
  timeframe: optionalText(100),
  notes: optionalText(5000),
});
export type ClientDraft = z.infer<typeof ClientDraft>;

/** Правка клиента: только изменённые поля, null — очистить; version — защита от одновременных правок. */
export const ClientPatch = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1, 'Укажите имя').max(150).optional(),
  phone: z.string().trim().min(5, 'Укажите телефон').max(40).optional(),
  messenger: clearableText(100).optional(),
  sourceId: id.optional(),
  budgetMin: clearableNumber(money).optional(),
  budgetMax: clearableNumber(money).optional(),
  currency: z.enum(CURRENCIES).optional(),
  districtIds: z.array(id).max(20).nullable().optional(),
  propertyTypeId: clearableNumber(id).optional(),
  roomsMin: clearableNumber(z.number().int().min(0).max(50)).optional(),
  roomsMax: clearableNumber(z.number().int().min(0).max(50)).optional(),
  floorPreference: clearableText(100).optional(),
  timeframe: clearableText(100).optional(),
  notes: clearableText(5000).optional(),
  agreedPrice: clearableNumber(money).optional(),
  finalPrice: clearableNumber(money).optional(),
  commissionFact: clearableNumber(money).optional(),
  nextShowingAt: isoDateTime.nullable().optional(),
  responsibleId: clearableNumber(id).optional(),
  partnerSourceId: clearableNumber(id).optional(),
});
export type ClientPatch = z.infer<typeof ClientPatch>;

/** Перевод клиента на другой этап (4.1): данные, которые требует целевой этап. */
export const ClientStageChange = z.object({
  stageId: id,
  version: z.number().int().positive(),
  conversationConfirmed: z.boolean().optional(),
  showingAt: isoDateTime.optional(),
  agreedPrice: money.optional(),
  finalPrice: money.optional(),
  commissionFact: money.optional(),
  rejectReasonId: id.optional(),
  /** Объект сделки — одно из привязанных объявлений (БТ-4.4.3). */
  dealListingId: id.optional(),
});
export type ClientStageChange = z.infer<typeof ClientStageChange>;

/** Что требует каждый этап воронки клиентов (таблица 4.1). */
export interface ClientTransitionRequirements {
  /** Выход из «Звонка»: зафиксирован первый разговор. */
  conversationConfirmed: boolean;
  /** «Квалифицирован»: бюджет, район, тип объекта, сроки — заполнены в карточке. */
  qualification: boolean;
  /** «Подбор объектов»: привязано хотя бы одно объявление. */
  linkedListing: boolean;
  /** «Показы»: дата и время показа. */
  showingAt: boolean;
  /** «Переговоры / бронь»: согласованная цена. */
  agreedPrice: boolean;
  /** «Сделка закрыта»: финальная цена и комиссия (факт). */
  deal: boolean;
  /** «Отказ»: причина из справочника. */
  rejectReason: boolean;
}

/** Этапы, начиная с которых требование действует («дальше по воронке»). */
const FROM_QUALIFIED = ['qualified', 'selection', 'showings', 'negotiation', 'deal_closed'];
const FROM_SELECTION = ['selection', 'showings', 'negotiation', 'deal_closed'];
const BEFORE_CONVERSATION = ['new', 'call'];

/**
 * Требования зависят от кодов системных этапов; у этапов, добавленных Владельцем,
 * правил нет (решение В-7). Перескок через этапы требует всего, что требуют пропущенные.
 */
export function clientTransitionRequirements(
  from: string | null,
  to: string | null,
): ClientTransitionRequirements {
  const f = from ?? '';
  const t = to ?? '';
  return {
    conversationConfirmed: BEFORE_CONVERSATION.includes(f) && FROM_QUALIFIED.includes(t),
    qualification: FROM_QUALIFIED.includes(t),
    linkedListing: FROM_SELECTION.includes(t),
    showingAt: t === 'showings',
    agreedPrice: t === 'negotiation',
    deal: t === 'deal_closed',
    rejectReason: t === 'rejected',
  };
}

/** Состояние карточки, от которого зависят проверки перехода. */
export interface ClientSnapshot {
  budgetMax: number | null;
  budgetMin: number | null;
  districtIds: number[] | null;
  propertyTypeId: number | null;
  timeframe: string | null;
  agreedPrice: number | null;
  linkedListings: number;
}

export interface ClientTransitionCheck {
  actor: Actor;
  from: { code: string | null; isTerminal: boolean };
  to: { code: string | null };
  client: ClientSnapshot;
  input: Omit<ClientStageChange, 'stageId' | 'version'>;
}

/** Недостающие поля квалификации (БТ «Квалифицирован»). */
export function missingQualification(c: ClientSnapshot): string[] {
  const missing: string[] = [];
  if (c.budgetMax === null && c.budgetMin === null) missing.push('бюджет');
  if (!c.districtIds || c.districtIds.length === 0) missing.push('район');
  if (c.propertyTypeId === null) missing.push('тип объекта');
  if (!c.timeframe) missing.push('сроки');
  return missing;
}

/** Проверка перехода клиента. Пустой список — переход разрешён. */
export function checkClientTransition(c: ClientTransitionCheck): string[] {
  const { actor, from, to, input, client } = c;
  if (from.code !== null && from.code === to.code) return ['Клиент уже на этом этапе'];
  if (actor.role === 'partner') {
    const allowed = PARTNER_MOVABLE_STAGES.clients;
    if (!allowed.includes(from.code ?? '') || !allowed.includes(to.code ?? '')) {
      return ['Партнёр может перемещать клиентов только между первыми тремя этапами'];
    }
  }
  if (from.isTerminal && actor.role !== 'owner') {
    return ['Вернуть закрытого клиента в работу может только Владелец'];
  }

  const req = clientTransitionRequirements(from.code, to.code);
  const errors: string[] = [];
  if (req.conversationConfirmed && !input.conversationConfirmed) {
    errors.push('Подтвердите, что первый разговор с клиентом состоялся');
  }
  if (req.qualification) {
    const missing = missingQualification(client);
    if (missing.length > 0) errors.push(`Заполните в карточке: ${missing.join(', ')}`);
  }
  if (req.linkedListing && client.linkedListings === 0) {
    errors.push('Привяжите к клиенту хотя бы одно объявление');
  }
  if (req.showingAt && !input.showingAt) errors.push('Укажите дату и время показа');
  if (req.agreedPrice && input.agreedPrice === undefined && client.agreedPrice === null) {
    errors.push('Укажите согласованную цену');
  }
  if (req.deal) {
    if (input.dealListingId === undefined) errors.push('Выберите объект сделки из подборки');
    if (input.finalPrice === undefined) errors.push('Укажите финальную цену сделки');
    if (input.commissionFact === undefined) errors.push('Укажите комиссию (факт)');
  }
  if (req.rejectReason && input.rejectReasonId === undefined) {
    errors.push('Укажите причину отказа');
  }
  return errors;
}

/** Поля, которые партнёр не может менять в карточке клиента (БТ-2.3.2). */
export const PARTNER_LOCKED_CLIENT_FIELDS = [
  'finalPrice',
  'commissionFact',
  'partnerSourceId',
  'responsibleId',
] as const;

export const CLIENT_FIELD_LABELS: Record<string, string> = {
  name: 'Имя',
  phone: 'Телефон',
  messenger: 'Мессенджер',
  sourceId: 'Источник',
  budgetMin: 'Бюджет от',
  budgetMax: 'Бюджет до',
  currency: 'Валюта',
  districtIds: 'Районы',
  propertyTypeId: 'Тип объекта',
  roomsMin: 'Комнат от',
  roomsMax: 'Комнат до',
  floorPreference: 'Этаж',
  timeframe: 'Сроки',
  notes: 'Заметки',
  agreedPrice: 'Согласованная цена',
  finalPrice: 'Финальная цена',
  commissionFact: 'Комиссия (факт)',
  nextShowingAt: 'Показ',
  responsibleId: 'Ответственный',
  partnerSourceId: 'Партнёр-источник',
  rejectReasonId: 'Причина отказа',
  stageId: 'Этап',
};

/** Статусы связи клиент ↔ объявление (БТ-4.4.1). */
export const LINK_STATUS_LABELS: Record<string, string> = {
  proposed: 'предложено',
  showing_scheduled: 'показ назначен',
  shown: 'показан',
  client_rejected: 'отказ клиента',
  chosen: 'выбрано',
};

export const LinkCreate = z.object({ listingId: id });
export type LinkCreate = z.infer<typeof LinkCreate>;

export const LinkUpdate = z.object({
  status: z.enum(['proposed', 'showing_scheduled', 'shown', 'client_rejected', 'chosen']),
  /** Обязательна для «показ назначен» — создаёт запись показа. */
  showingAt: isoDateTime.optional(),
});
export type LinkUpdate = z.infer<typeof LinkUpdate>;

/** Вознаграждение партнёра — 10% от комиссии (факт) по сделке с его атрибуцией (8.1). */
export const PARTNER_REWARD_RATE = 0.1;
