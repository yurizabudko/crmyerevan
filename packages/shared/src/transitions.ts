import type { Actor } from './permissions.js';
import { PARTNER_MOVABLE_STAGES, type ListingCloseOutcome } from './pipelines.js';

/** Что нужно указать при переводе карточки объявления (таблица 3.1). */
export interface ListingTransitionRequirements {
  /** Выход из «Звонка»: контакт с собственником состоялся. */
  contactConfirmed: boolean;
  /** Выход из «Доступного объявления»: собственник подтвердил актуальность (Д-2). */
  actualityConfirmed: boolean;
  /** «Назначена встреча»: дата и время встречи. */
  meetingAt: boolean;
  /** «Закрыт объект»: исход — успех или потеря. */
  closeOutcome: boolean;
}

const BEFORE_CONTACT = ['new', 'call'];
const BEFORE_ACTUALITY = ['new', 'call', 'available'];

/**
 * Требования зависят от кодов системных этапов; у этапов, добавленных Владельцем,
 * код не системный и правил нет (решение В-7).
 */
export function listingTransitionRequirements(
  from: string | null,
  to: string | null,
): ListingTransitionRequirements {
  const f = from ?? '';
  const t = to ?? '';
  return {
    contactConfirmed: BEFORE_CONTACT.includes(f) && (t === 'available' || t === 'meeting'),
    actualityConfirmed: BEFORE_ACTUALITY.includes(f) && t === 'meeting',
    meetingAt: t === 'meeting',
    closeOutcome: t === 'closed',
  };
}

export interface ListingTransitionCheck {
  actor: Actor;
  from: { code: string | null; isTerminal: boolean };
  to: { code: string | null };
  /** У карточки уже заполнена дата встречи. */
  hasMeetingAt: boolean;
  input: {
    meetingAt?: string;
    closeOutcome?: ListingCloseOutcome;
    contactConfirmed?: boolean;
    actualityConfirmed?: boolean;
  };
}

/** Проверка перехода (БТ-3.1.1). Пустой список — переход разрешён. */
export function checkListingTransition(c: ListingTransitionCheck): string[] {
  const { actor, from, to, input } = c;
  if (from.code !== null && from.code === to.code) return ['Карточка уже на этом этапе'];

  if (actor.role === 'partner') {
    const allowed = PARTNER_MOVABLE_STAGES.listings;
    if (!allowed.includes(from.code ?? '') || !allowed.includes(to.code ?? '')) {
      return ['Партнёр может перемещать карточки только между первыми тремя этапами'];
    }
  }
  if (from.isTerminal && actor.role !== 'owner') {
    return ['Вернуть закрытый объект в работу может только Владелец'];
  }

  const req = listingTransitionRequirements(from.code, to.code);
  const errors: string[] = [];
  if (req.contactConfirmed && !input.contactConfirmed) {
    errors.push('Подтвердите, что контакт с собственником состоялся');
  }
  if (req.actualityConfirmed && !input.actualityConfirmed) {
    errors.push('Подтвердите, что собственник подтвердил актуальность объекта');
  }
  if (req.meetingAt && !input.meetingAt && !c.hasMeetingAt) {
    errors.push('Укажите дату и время встречи');
  }
  if (req.closeOutcome && !input.closeOutcome) {
    errors.push('Укажите исход: сделка или объект потерян');
  }
  return errors;
}

/** Поля, которые партнёр может менять в объявлении (БТ-2.3.1). */
export const PARTNER_EDITABLE_LISTING_FIELDS = [
  'phone',
  'ownerName',
  'contactsExtra',
  'meetingAt',
  'commissionPercent',
] as const;

/** Подписи полей для системных записей истории (БТ-3.4.2). */
export const LISTING_FIELD_LABELS: Record<string, string> = {
  title: 'Название',
  description: 'Описание',
  price: 'Цена',
  currency: 'Валюта',
  districtId: 'Район',
  propertyTypeId: 'Тип объекта',
  rooms: 'Комнат',
  floor: 'Этаж',
  floorsTotal: 'Этажей в доме',
  area: 'Площадь',
  address: 'Адрес',
  ownerName: 'Собственник',
  phone: 'Телефон',
  contactsExtra: 'Другие контакты',
  sourceUrl: 'Ссылка',
  commissionPercent: 'Комиссия, %',
  meetingAt: 'Встреча',
  responsibleId: 'Ответственный',
  partnerSourceId: 'Партнёр-источник',
  stageId: 'Этап',
  closeOutcome: 'Исход',
};
