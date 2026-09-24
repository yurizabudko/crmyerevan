import { z } from 'zod';
import { AUDIT_EVENTS } from './audit.js';
import { DICTIONARY_KINDS } from './dictionaries.js';
import { PIPELINES } from './pipelines.js';

const name = z.string().trim().min(1, 'Укажите название').max(100);
const id = z.number().int().positive();

/** Этапы воронок (7.2): добавление, переименование, порядок, удаление пустых. */
export const StageCreate = z.object({ pipeline: z.enum(PIPELINES), name });
export type StageCreate = z.infer<typeof StageCreate>;

export const StageRename = z.object({ name });
export type StageRename = z.infer<typeof StageRename>;

export const StageOrder = z.object({
  pipeline: z.enum(PIPELINES),
  ids: z.array(id).min(1).max(50),
});
export type StageOrder = z.infer<typeof StageOrder>;

/** Справочники (7.2): элементы не удаляются, а отключаются — на них ссылаются карточки. */
export const DictionaryItemCreate = z.object({ kind: z.enum(DICTIONARY_KINDS), name });
export type DictionaryItemCreate = z.infer<typeof DictionaryItemCreate>;

export const DictionaryItemUpdate = z
  .object({ name: name.optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, 'Нечего менять');
export type DictionaryItemUpdate = z.infer<typeof DictionaryItemUpdate>;

export const DictionaryOrder = z.object({
  kind: z.enum(DICTIONARY_KINDS),
  ids: z.array(id).min(1).max(200),
});
export type DictionaryOrder = z.infer<typeof DictionaryOrder>;

/** Настройки парсера (7.3). Частота — 2–15 минут (БТ-3.2.4). */
export const ParserSettings = z.object({
  enabled: z.boolean(),
  intervalMinutes: z
    .number()
    .int()
    .min(2, 'Не чаще раза в 2 минуты')
    .max(15, 'Не реже раза в 15 минут'),
  city: z.string().trim().min(1).max(50),
  category: z.string().trim().min(1).max(50),
  ownerOnly: z.boolean(),
});
export type ParserSettings = z.infer<typeof ParserSettings>;

/** Журнал аудита (7.4): фильтры по пользователю, дате и типу события. */
export const AuditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
  userId: z.coerce.number().int().positive().optional(),
  type: z.enum(AUDIT_EVENTS).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export interface AuditEventDto {
  id: number;
  at: string | null;
  type: string;
  userId: number | null;
  userName: string | null;
  entityType: string | null;
  entityId: number | null;
  payload: unknown;
  ip: string | null;
}

export interface AdminDictionaryItemDto {
  id: number;
  kind: string;
  code: string;
  name: string;
  position: number;
  isActive: boolean;
}

export interface ParserRunDto {
  id: number;
  startedAt: string | null;
  finishedAt: string | null;
  status: string | null;
  foundNew: number;
  updated: number;
  errors: string | null;
}

/** Подписи событий журнала для интерфейса. */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  'auth.login': 'Вход',
  'auth.login_failed': 'Неудачный вход',
  'auth.logout': 'Выход',
  'auth.password_changed': 'Смена пароля',
  'user.created': 'Создан пользователь',
  'user.blocked': 'Блокировка',
  'user.unblocked': 'Разблокировка',
  'user.password_reset': 'Сброс пароля',
  'user.permissions_changed': 'Изменение прав',
  'listing.created': 'Создано объявление',
  'listing.deleted': 'Удалено объявление',
  'client.created': 'Создан клиент',
  'client.deleted': 'Удалён клиент',
  'deal.closed': 'Закрыта сделка',
  'reward.accrued': 'Начислено вознаграждение',
  'export.csv': 'Выгрузка CSV',
  'stage.changed': 'Изменены этапы',
  'dictionary.changed': 'Изменён справочник',
  'settings.changed': 'Изменены настройки',
  'subscription.trial_started': 'Подписка: начат триал',
  'subscription.charged': 'Подписка: списание',
  'subscription.charge_failed': 'Подписка: ошибка списания',
  'subscription.frozen': 'Подписка: заморозка',
  'subscription.unfrozen': 'Подписка: разморозка',
  'subscription.canceled': 'Подписка: отмена автопродления',
  'subscription.resumed': 'Подписка: автопродление включено',
  'reward.paid': 'Вознаграждение выплачено',
};

/** Подтверждение выплаты вознаграждения Владельцем (БТ-8.2.5). */
export const PayoutInput = z.object({
  method: z.string().trim().min(2, 'Укажите способ выплаты').max(100),
  paidAt: z.iso.date('Укажите дату').optional(),
});
export type PayoutInput = z.infer<typeof PayoutInput>;

export const RewardsQuery = z.object({
  status: z.enum(['accrued', 'paid', 'on_hold']).optional(),
  partnerId: z.coerce.number().int().positive().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type RewardsQuery = z.infer<typeof RewardsQuery>;

export const PartnersQuery = z.object({
  subscription: z.enum(['none', 'trial', 'active', 'grace', 'frozen', 'canceled']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type PartnersQuery = z.infer<typeof PartnersQuery>;
