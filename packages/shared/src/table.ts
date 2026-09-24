import { z } from 'zod';

const ids = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
      : undefined,
  );
const optionalNumber = z.coerce.number().nonnegative().optional();
const optionalDate = z.iso.datetime({ offset: true }).optional();

/** Общие параметры таблицы (раздел 5): страница, сортировка, поиск, фильтры. */
const BaseTableQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
  /** Поле сортировки, `-поле` — по убыванию (БТ-5.5). */
  sort: z.string().max(40).optional(),
  /** Поиск по названию/имени, телефону, описанию (БТ-5.4). */
  q: z.string().trim().max(100).optional(),
  stageIds: ids,
  responsibleId: z.coerce.number().int().positive().optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  updatedFrom: optionalDate,
  updatedTo: optionalDate,
  /** Колонки для CSV — в порядке, который видит пользователь. */
  columns: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined)),
});

export const ListingTableQuery = BaseTableQuery.extend({
  source: z.enum(['manual', 'parser']).optional(),
  priceMin: optionalNumber,
  priceMax: optionalNumber,
});
export type ListingTableQuery = z.infer<typeof ListingTableQuery>;

export const ClientTableQuery = BaseTableQuery.extend({
  sourceId: z.coerce.number().int().positive().optional(),
  budgetMin: optionalNumber,
  budgetMax: optionalNumber,
});
export type ClientTableQuery = z.infer<typeof ClientTableQuery>;

export interface TablePage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Колонки таблицы объявлений: ключ → подпись. Порядок — порядок по умолчанию. */
export const LISTING_COLUMNS = {
  title: 'Название',
  stage: 'Этап',
  price: 'Цена',
  district: 'Район',
  propertyType: 'Тип',
  rooms: 'Комнат',
  area: 'Площадь',
  phone: 'Телефон',
  ownerName: 'Собственник',
  responsible: 'Ответственный',
  partnerSource: 'Партнёр-источник',
  source: 'Источник',
  commissionPercent: 'Комиссия, %',
  meetingAt: 'Встреча',
  createdAt: 'Создано',
  lastActivityAt: 'Изменено',
  sourceUrl: 'Ссылка',
} as const;
export type ListingColumn = keyof typeof LISTING_COLUMNS;

export const CLIENT_COLUMNS = {
  name: 'Имя',
  stage: 'Этап',
  phone: 'Телефон',
  messenger: 'Мессенджер',
  budgetMin: 'Бюджет от',
  budgetMax: 'Бюджет до',
  districts: 'Районы',
  propertyType: 'Тип',
  timeframe: 'Сроки',
  source: 'Источник',
  responsible: 'Ответственный',
  partnerSource: 'Партнёр-источник',
  showingsCount: 'Показов',
  agreedPrice: 'Согласованная цена',
  finalPrice: 'Финальная цена',
  commissionFact: 'Комиссия (факт)',
  createdAt: 'Создан',
  lastActivityAt: 'Изменён',
} as const;
export type ClientColumn = keyof typeof CLIENT_COLUMNS;

/** Колонки, по которым сортирует NocoDB; остальные (вычисляемые) не сортируются. */
export const LISTING_SORT_FIELDS: Partial<Record<ListingColumn, string>> = {
  title: 'title',
  stage: 'stage_id',
  price: 'price',
  district: 'district_id',
  propertyType: 'property_type_id',
  rooms: 'rooms',
  area: 'area',
  phone: 'phone',
  ownerName: 'owner_name',
  responsible: 'responsible_id',
  source: 'source',
  commissionPercent: 'commission_percent',
  meetingAt: 'meeting_at',
  createdAt: 'CreatedAt',
  lastActivityAt: 'last_activity_at',
};

export const CLIENT_SORT_FIELDS: Partial<Record<ClientColumn, string>> = {
  name: 'name',
  stage: 'stage_id',
  phone: 'phone',
  budgetMin: 'budget_min',
  budgetMax: 'budget_max',
  propertyType: 'property_type_id',
  timeframe: 'timeframe',
  source: 'source_id',
  responsible: 'responsible_id',
  showingsCount: 'showings_count',
  agreedPrice: 'agreed_price',
  finalPrice: 'final_price',
  commissionFact: 'commission_fact',
  createdAt: 'CreatedAt',
  lastActivityAt: 'last_activity_at',
};
