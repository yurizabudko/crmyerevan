import type { ClientDto } from '@crm/shared';
import { isoToYerevanInput, yerevanInputToIso } from '../../lib/format';

/** Значения формы клиента: строки и '' вместо null, как ожидают поля Mantine. */
export interface ClientFormValues {
  name: string;
  phone: string;
  messenger: string;
  sourceId: string | null;
  budgetMin: number | string;
  budgetMax: number | string;
  currency: string;
  districtIds: string[];
  propertyTypeId: string | null;
  roomsMin: number | string;
  roomsMax: number | string;
  floorPreference: string;
  timeframe: string;
  notes: string;
  agreedPrice: number | string;
  finalPrice: number | string;
  commissionFact: number | string;
  nextShowingAt: string;
  responsibleId: string | null;
  partnerSourceId: string | null;
}

export const EMPTY_CLIENT: ClientFormValues = {
  name: '',
  phone: '',
  messenger: '',
  sourceId: null,
  budgetMin: '',
  budgetMax: '',
  currency: 'USD',
  districtIds: [],
  propertyTypeId: null,
  roomsMin: '',
  roomsMax: '',
  floorPreference: '',
  timeframe: '',
  notes: '',
  agreedPrice: '',
  finalPrice: '',
  commissionFact: '',
  nextShowingAt: '',
  responsibleId: null,
  partnerSourceId: null,
};

const idStr = (v: number | null) => (v === null ? null : String(v));
const num = (v: number | null) => (v === null ? '' : v);

export function fromClient(c: ClientDto): ClientFormValues {
  return {
    name: c.name,
    phone: c.phone ?? '',
    messenger: c.messenger ?? '',
    sourceId: idStr(c.sourceId),
    budgetMin: num(c.budgetMin),
    budgetMax: num(c.budgetMax),
    currency: c.currency ?? 'USD',
    districtIds: c.districtIds.map(String),
    propertyTypeId: idStr(c.propertyTypeId),
    roomsMin: num(c.roomsMin),
    roomsMax: num(c.roomsMax),
    floorPreference: c.floorPreference ?? '',
    timeframe: c.timeframe ?? '',
    notes: c.notes ?? '',
    agreedPrice: num(c.agreedPrice),
    finalPrice: num(c.finalPrice),
    commissionFact: num(c.commissionFact),
    nextShowingAt: isoToYerevanInput(c.nextShowingAt),
    responsibleId: idStr(c.responsibleId),
    partnerSourceId: idStr(c.partnerSourceId),
  };
}

const DRAFT_KEYS = [
  'name',
  'phone',
  'messenger',
  'sourceId',
  'budgetMin',
  'budgetMax',
  'currency',
  'districtIds',
  'propertyTypeId',
  'roomsMin',
  'roomsMax',
  'floorPreference',
  'timeframe',
  'notes',
] as const;

/** Для создания: пустые поля убираем, чтобы zod видел их как незаполненные. */
export function toClientDraftInput(v: ClientFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DRAFT_KEYS) {
    const value = v[key];
    if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) continue;
    out[key] = key === 'districtIds' ? (value as string[]).map(Number) : value;
  }
  return out;
}

/** Для правки: только изменённые поля; очищенное — null. */
export function toClientPatch(
  initial: ClientFormValues,
  values: ClientFormValues,
  version: number,
): Record<string, unknown> & { version: number } {
  const patch: Record<string, unknown> & { version: number } = { version };
  for (const key of Object.keys(values) as (keyof ClientFormValues)[]) {
    const value = values[key];
    if (JSON.stringify(value) === JSON.stringify(initial[key])) continue;
    if (key === 'districtIds') {
      patch.districtIds = (value as string[]).length ? (value as string[]).map(Number) : null;
    } else if (key === 'nextShowingAt') {
      patch.nextShowingAt = value ? yerevanInputToIso(String(value)) : null;
    } else if (['sourceId', 'propertyTypeId', 'responsibleId', 'partnerSourceId'].includes(key)) {
      patch[key] = value === null ? null : Number(value);
    } else {
      patch[key] = value === '' ? null : value;
    }
  }
  return patch;
}
