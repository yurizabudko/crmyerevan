import type { ListingDto, ListingPatch } from '@crm/shared';
import { isoToYerevanInput, yerevanInputToIso } from '../../lib/format';

/** Значения формы объявления: строки и '' вместо null, как ожидают поля Mantine. */
export interface ListingFormValues {
  title: string;
  description: string;
  price: number | string;
  currency: string;
  districtId: string | null;
  propertyTypeId: string | null;
  rooms: number | string;
  floor: number | string;
  floorsTotal: number | string;
  area: number | string;
  address: string;
  ownerName: string;
  phone: string;
  contactsExtra: string;
  sourceUrl: string;
  commissionPercent: string | null;
  meetingAt: string;
  responsibleId: string | null;
  partnerSourceId: string | null;
}

export const EMPTY_LISTING: ListingFormValues = {
  title: '',
  description: '',
  price: '',
  currency: 'USD',
  districtId: null,
  propertyTypeId: null,
  rooms: '',
  floor: '',
  floorsTotal: '',
  area: '',
  address: '',
  ownerName: '',
  phone: '',
  contactsExtra: '',
  sourceUrl: '',
  commissionPercent: null,
  meetingAt: '',
  responsibleId: null,
  partnerSourceId: null,
};

const idStr = (v: number | null) => (v === null ? null : String(v));
const num = (v: number | null) => (v === null ? '' : v);

export function fromDto(l: ListingDto): ListingFormValues {
  return {
    title: l.title,
    description: l.description ?? '',
    price: num(l.price),
    currency: l.currency ?? 'USD',
    districtId: idStr(l.districtId),
    propertyTypeId: idStr(l.propertyTypeId),
    rooms: num(l.rooms),
    floor: num(l.floor),
    floorsTotal: num(l.floorsTotal),
    area: num(l.area),
    address: l.address ?? '',
    ownerName: l.ownerName ?? '',
    phone: l.phone ?? '',
    contactsExtra: l.contactsExtra ?? '',
    sourceUrl: l.sourceUrl ?? '',
    commissionPercent: idStr(l.commissionPercent),
    meetingAt: isoToYerevanInput(l.meetingAt),
    responsibleId: idStr(l.responsibleId),
    partnerSourceId: idStr(l.partnerSourceId),
  };
}

/** Поля, которые пишутся в форму создания (без служебных). */
const DRAFT_KEYS = [
  'title',
  'description',
  'price',
  'currency',
  'districtId',
  'propertyTypeId',
  'rooms',
  'floor',
  'floorsTotal',
  'area',
  'address',
  'ownerName',
  'phone',
  'contactsExtra',
  'sourceUrl',
] as const;

/** Для создания: пустые поля убираем, чтобы zod видел их как незаполненные. */
export function toDraftInput(values: ListingFormValues): Record<string, unknown> {
  return Object.fromEntries(
    DRAFT_KEYS.map((k) => [k, values[k]]).filter(([, v]) => v !== '' && v !== null),
  );
}

/** Для правки: только изменённые поля; очищенное поле → null. */
export function toPatch(
  initial: ListingFormValues,
  values: ListingFormValues,
  version: number,
): Record<string, unknown> & Pick<ListingPatch, 'version'> {
  const patch: Record<string, unknown> & { version: number } = { version };
  for (const key of Object.keys(values) as (keyof ListingFormValues)[]) {
    if (values[key] === initial[key]) continue;
    const value = values[key];
    if (key === 'meetingAt') {
      patch.meetingAt = value ? yerevanInputToIso(String(value)) : null;
    } else {
      patch[key] = value === '' ? null : value;
    }
  }
  return patch;
}
