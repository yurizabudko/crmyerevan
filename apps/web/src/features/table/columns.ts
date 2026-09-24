import {
  COMMISSION_PERCENTS,
  PARTNER_EDITABLE_LISTING_FIELDS,
  PARTNER_LOCKED_CLIENT_FIELDS,
  type ClientDto,
  type DictionariesDto,
  type ListingDto,
  type StageDto,
  type UserBriefDto,
  type UserDto,
} from '@crm/shared';
import { formatDateTime, formatPrice } from '../../lib/format';

export type EditKind =
  | { type: 'text' }
  | { type: 'number' }
  | { type: 'select'; options: { value: string; label: string }[]; clearable?: boolean };

/** Описание колонки таблицы: отображение и (если можно) редактирование в ячейке (БТ-5.6). */
export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable: boolean;
  render: (row: T) => string | number | null;
  /** Поле PATCH и способ редактирования; нет — колонка только для чтения. */
  edit?: { field: string; kind: EditKind; value: (row: T) => string | number | null };
  width?: number;
}

export interface TableContext {
  me: UserDto;
  stages: StageDto[];
  dicts: DictionariesDto | undefined;
  users: UserBriefDto[];
}

const dictOptions = (ctx: TableContext, kind: keyof DictionariesDto) =>
  (ctx.dicts?.[kind] ?? []).map((d) => ({ value: String(d.id), label: d.name }));
const dictName = (ctx: TableContext, kind: keyof DictionariesDto, id: number | null) =>
  id === null ? null : (ctx.dicts?.[kind].find((d) => d.id === id)?.name ?? null);
const userName = (ctx: TableContext, id: number | null) => {
  if (id === null) return null;
  if (id === ctx.me.id) return ctx.me.displayName;
  return ctx.users.find((u) => u.id === id)?.displayName ?? `#${id}`;
};
const staffOptions = (ctx: TableContext) =>
  ctx.users
    .filter((u) => u.status === 'active')
    .map((u) => ({ value: String(u.id), label: u.displayName }));
const stageName = (ctx: TableContext, id: number | null) =>
  ctx.stages.find((s) => s.id === id)?.name ?? null;

export function listingColumns(ctx: TableContext): ColumnDef<ListingDto>[] {
  const partner = ctx.me.role === 'partner';
  const editable = (field: string) =>
    !partner || (PARTNER_EDITABLE_LISTING_FIELDS as readonly string[]).includes(field);
  const withEdit = (
    field: string,
    kind: EditKind,
    value: (l: ListingDto) => string | number | null,
  ) => (editable(field) ? { field, kind, value } : undefined);

  return [
    {
      key: 'title',
      label: 'Название',
      sortable: true,
      width: 240,
      render: (l) => l.title,
      edit: withEdit('title', { type: 'text' }, (l) => l.title),
    },
    { key: 'stage', label: 'Этап', sortable: true, render: (l) => stageName(ctx, l.stageId) },
    {
      key: 'price',
      label: 'Цена',
      sortable: true,
      render: (l) => formatPrice(l.price, l.currency),
      edit: withEdit('price', { type: 'number' }, (l) => l.price),
    },
    {
      key: 'district',
      label: 'Район',
      sortable: true,
      render: (l) => dictName(ctx, 'district', l.districtId),
      edit: withEdit(
        'districtId',
        { type: 'select', options: dictOptions(ctx, 'district'), clearable: true },
        (l) => l.districtId,
      ),
    },
    {
      key: 'propertyType',
      label: 'Тип',
      sortable: true,
      render: (l) => dictName(ctx, 'property_type', l.propertyTypeId),
      edit: withEdit(
        'propertyTypeId',
        { type: 'select', options: dictOptions(ctx, 'property_type'), clearable: true },
        (l) => l.propertyTypeId,
      ),
    },
    {
      key: 'rooms',
      label: 'Комнат',
      sortable: true,
      render: (l) => l.rooms,
      edit: withEdit('rooms', { type: 'number' }, (l) => l.rooms),
    },
    {
      key: 'area',
      label: 'Площадь',
      sortable: true,
      render: (l) => (l.area === null ? null : `${l.area} м²`),
      edit: withEdit('area', { type: 'number' }, (l) => l.area),
    },
    {
      key: 'phone',
      label: 'Телефон',
      sortable: true,
      render: (l) => l.phone,
      edit: withEdit('phone', { type: 'text' }, (l) => l.phone),
    },
    {
      key: 'ownerName',
      label: 'Собственник',
      sortable: true,
      render: (l) => l.ownerName,
      edit: withEdit('ownerName', { type: 'text' }, (l) => l.ownerName),
    },
    {
      key: 'responsible',
      label: 'Ответственный',
      sortable: true,
      render: (l) => userName(ctx, l.responsibleId) ?? 'общий пул',
      edit: partner
        ? undefined
        : {
            field: 'responsibleId',
            kind: { type: 'select', options: staffOptions(ctx), clearable: true },
            value: (l) => l.responsibleId,
          },
    },
    {
      key: 'partnerSource',
      label: 'Партнёр-источник',
      sortable: false,
      render: (l) => userName(ctx, l.partnerSourceId),
    },
    {
      key: 'source',
      label: 'Источник',
      sortable: true,
      render: (l) => (l.source === 'parser' ? 'автоимпорт' : 'вручную'),
    },
    {
      key: 'commissionPercent',
      label: 'Комиссия',
      sortable: true,
      render: (l) => (l.commissionPercent === null ? null : `${l.commissionPercent}%`),
      edit: withEdit(
        'commissionPercent',
        {
          type: 'select',
          options: COMMISSION_PERCENTS.map((p) => ({ value: String(p), label: `${p}%` })),
          clearable: true,
        },
        (l) => l.commissionPercent,
      ),
    },
    {
      key: 'meetingAt',
      label: 'Встреча',
      sortable: true,
      render: (l) => (l.meetingAt ? formatDateTime(l.meetingAt) : null),
    },
    {
      key: 'createdAt',
      label: 'Создано',
      sortable: true,
      render: (l) => formatDateTime(l.createdAt),
    },
    {
      key: 'lastActivityAt',
      label: 'Изменено',
      sortable: true,
      render: (l) => formatDateTime(l.lastActivityAt),
    },
    { key: 'sourceUrl', label: 'Ссылка', sortable: false, render: (l) => l.sourceUrl },
  ];
}

export function clientColumns(ctx: TableContext): ColumnDef<ClientDto>[] {
  const partner = ctx.me.role === 'partner';
  const editable = (field: string) =>
    !partner || !(PARTNER_LOCKED_CLIENT_FIELDS as readonly string[]).includes(field);
  const withEdit = (
    field: string,
    kind: EditKind,
    value: (c: ClientDto) => string | number | null,
  ) => (editable(field) ? { field, kind, value } : undefined);
  const money = (c: ClientDto, v: number | null) =>
    v === null ? null : formatPrice(v, c.currency);

  return [
    {
      key: 'name',
      label: 'Имя',
      sortable: true,
      width: 200,
      render: (c) => c.name,
      edit: withEdit('name', { type: 'text' }, (c) => c.name),
    },
    { key: 'stage', label: 'Этап', sortable: true, render: (c) => stageName(ctx, c.stageId) },
    {
      key: 'phone',
      label: 'Телефон',
      sortable: true,
      render: (c) => c.phone,
      edit: withEdit('phone', { type: 'text' }, (c) => c.phone),
    },
    {
      key: 'messenger',
      label: 'Мессенджер',
      sortable: false,
      render: (c) => c.messenger,
      edit: withEdit('messenger', { type: 'text' }, (c) => c.messenger),
    },
    {
      key: 'budgetMin',
      label: 'Бюджет от',
      sortable: true,
      render: (c) => money(c, c.budgetMin),
      edit: withEdit('budgetMin', { type: 'number' }, (c) => c.budgetMin),
    },
    {
      key: 'budgetMax',
      label: 'Бюджет до',
      sortable: true,
      render: (c) => money(c, c.budgetMax),
      edit: withEdit('budgetMax', { type: 'number' }, (c) => c.budgetMax),
    },
    {
      key: 'districts',
      label: 'Районы',
      sortable: false,
      render: (c) =>
        c.districtIds
          .map((id) => dictName(ctx, 'district', id))
          .filter(Boolean)
          .join(', ') || null,
    },
    {
      key: 'propertyType',
      label: 'Тип',
      sortable: true,
      render: (c) => dictName(ctx, 'property_type', c.propertyTypeId),
      edit: withEdit(
        'propertyTypeId',
        { type: 'select', options: dictOptions(ctx, 'property_type'), clearable: true },
        (c) => c.propertyTypeId,
      ),
    },
    {
      key: 'timeframe',
      label: 'Сроки',
      sortable: true,
      render: (c) => c.timeframe,
      edit: withEdit('timeframe', { type: 'text' }, (c) => c.timeframe),
    },
    {
      key: 'source',
      label: 'Источник',
      sortable: true,
      render: (c) => dictName(ctx, 'source', c.sourceId),
      edit: withEdit(
        'sourceId',
        { type: 'select', options: dictOptions(ctx, 'source') },
        (c) => c.sourceId,
      ),
    },
    {
      key: 'responsible',
      label: 'Ответственный',
      sortable: true,
      render: (c) => userName(ctx, c.responsibleId),
      edit: partner
        ? undefined
        : {
            field: 'responsibleId',
            kind: { type: 'select', options: staffOptions(ctx), clearable: true },
            value: (c) => c.responsibleId,
          },
    },
    {
      key: 'partnerSource',
      label: 'Партнёр-источник',
      sortable: false,
      render: (c) => userName(ctx, c.partnerSourceId),
    },
    { key: 'showingsCount', label: 'Показов', sortable: true, render: (c) => c.showingsCount },
    {
      key: 'agreedPrice',
      label: 'Согласованная цена',
      sortable: true,
      render: (c) => money(c, c.agreedPrice),
      edit: withEdit('agreedPrice', { type: 'number' }, (c) => c.agreedPrice),
    },
    {
      key: 'finalPrice',
      label: 'Финальная цена',
      sortable: true,
      render: (c) => money(c, c.finalPrice),
      edit: withEdit('finalPrice', { type: 'number' }, (c) => c.finalPrice),
    },
    {
      key: 'commissionFact',
      label: 'Комиссия (факт)',
      sortable: true,
      render: (c) => money(c, c.commissionFact),
      edit: withEdit('commissionFact', { type: 'number' }, (c) => c.commissionFact),
    },
    {
      key: 'createdAt',
      label: 'Создан',
      sortable: true,
      render: (c) => formatDateTime(c.createdAt),
    },
    {
      key: 'lastActivityAt',
      label: 'Изменён',
      sortable: true,
      render: (c) => formatDateTime(c.lastActivityAt),
    },
  ];
}

/** Настройка колонок пользователя (БТ-5.2): порядок и скрытые. */
export interface ColumnPrefs {
  order: string[];
  hidden: string[];
}

export const DEFAULT_HIDDEN: Record<'listings' | 'clients', string[]> = {
  listings: [
    'propertyType',
    'area',
    'ownerName',
    'partnerSource',
    'source',
    'commissionPercent',
    'meetingAt',
    'createdAt',
    'sourceUrl',
  ],
  clients: [
    'messenger',
    'budgetMin',
    'propertyType',
    'partnerSource',
    'agreedPrice',
    'finalPrice',
    'commissionFact',
    'createdAt',
  ],
};

/** Колонки в порядке пользователя; новые (которых нет в настройке) — в конце. */
export function arrangeColumns<T>(all: ColumnDef<T>[], prefs: ColumnPrefs): ColumnDef<T>[] {
  const byKey = new Map(all.map((c) => [c.key, c]));
  const ordered = prefs.order.map((k) => byKey.get(k)).filter((c): c is ColumnDef<T> => !!c);
  const rest = all.filter((c) => !prefs.order.includes(c.key));
  return [...ordered, ...rest];
}
