import { c, type RowOf, type TableSpec } from './schema-dsl.js';

/**
 * Схема данных CRM в NocoDB (НФТ-1, НФТ-2).
 *
 * Правила:
 * - ключ объекта = имя таблицы и заголовок в NocoDB; ключи колонок = column_name = title;
 * - связи храним как числовые `*_id` (без Link-колонок NocoDB), многие-ко-многим — junction-таблицы;
 * - миграции только добавляют таблицы и колонки; переименование и удаление — отдельной ручной миграцией;
 * - `version` — счётчик для оптимистичной блокировки при конкурентных правках.
 */
export const schema = {
  users: {
    login: c.text(),
    display_name: c.text(),
    password_hash: c.text(),
    /** owner | employee | partner */
    role: c.text(),
    /** active | blocked */
    status: c.text(),
    must_change_password: c.bool(),
    perm_grant_access: c.bool(),
    perm_delete_cards: c.bool(),
    perm_manage_dictionaries: c.bool(),
    created_by_id: c.int(),
    telegram_chat_id: c.text(),
    telegram_link_token: c.text(),
    last_login_at: c.datetime(),
    version: c.int(),
  },

  pipeline_stages: {
    /** listings | clients */
    pipeline: c.text(),
    /** Код системного этапа; у пользовательских этапов — сгенерированный. */
    code: c.text(),
    name: c.text(),
    position: c.int(),
    is_system: c.bool(),
    is_terminal: c.bool(),
  },

  dictionary_items: {
    /** source | district | property_type | reject_reason */
    kind: c.text(),
    code: c.text(),
    name: c.text(),
    position: c.int(),
    is_active: c.bool(),
  },

  listings: {
    title: c.text(),
    description: c.longText(),
    price: c.decimal(),
    currency: c.text(),
    district_id: c.int(),
    property_type_id: c.int(),
    rooms: c.int(),
    floor: c.int(),
    floors_total: c.int(),
    area: c.decimal(),
    address: c.text(),
    owner_name: c.text(),
    phone: c.text(),
    phone_normalized: c.text(),
    contacts_extra: c.longText(),
    /** parser | manual */
    source: c.text(),
    /** URL на list.am — ключ дедупликации (решение В-4). */
    source_url: c.text(),
    external_id: c.text(),
    stage_id: c.int(),
    responsible_id: c.int(),
    partner_source_id: c.int(),
    created_by_id: c.int(),
    claimed_at: c.datetime(),
    meeting_at: c.datetime(),
    /** success | lost */
    close_outcome: c.text(),
    commission_percent: c.decimal(),
    last_activity_at: c.datetime(),
    /** Первое фото — для превью на доске (денормализовано, чтобы не грузить все фото). */
    cover_photo_id: c.int(),
    deleted_at: c.datetime(),
    deleted_by_id: c.int(),
    version: c.int(),
  },

  listing_photos: {
    listing_id: c.int(),
    /** Ключ в файловом хранилище; превью лежит рядом с суффиксом `.thumb.jpg`. */
    storage_key: c.text(),
    url: c.text(),
    /** Исходная ссылка на фото у источника (для автоимпорта). */
    original_url: c.text(),
    position: c.int(),
    width: c.int(),
    height: c.int(),
    uploaded_by_id: c.int(),
  },

  clients: {
    name: c.text(),
    phone: c.text(),
    phone_normalized: c.text(),
    messenger: c.text(),
    budget_min: c.decimal(),
    budget_max: c.decimal(),
    district_ids: c.json<number[]>(),
    property_type_id: c.int(),
    rooms_min: c.int(),
    rooms_max: c.int(),
    floor_preference: c.text(),
    timeframe: c.text(),
    source_id: c.int(),
    stage_id: c.int(),
    responsible_id: c.int(),
    partner_source_id: c.int(),
    created_by_id: c.int(),
    agreed_price: c.decimal(),
    final_price: c.decimal(),
    commission_percent: c.decimal(),
    commission_fact: c.decimal(),
    reject_reason_id: c.int(),
    showings_count: c.int(),
    last_activity_at: c.datetime(),
    deleted_at: c.datetime(),
    version: c.int(),
  },

  client_listing_links: {
    client_id: c.int(),
    listing_id: c.int(),
    /** proposed | showing_scheduled | shown | client_rejected | chosen */
    status: c.text(),
    showing_at: c.datetime(),
    created_by_id: c.int(),
  },

  showings: {
    client_id: c.int(),
    listing_id: c.int(),
    scheduled_at: c.datetime(),
    created_by_id: c.int(),
  },

  /** Ручные и системные комментарии карточек (БТ-3.4.1, БТ-3.4.2). Системные — только на дописывание. */
  comments: {
    /** listing | client */
    entity_type: c.text(),
    entity_id: c.int(),
    /** manual | call | system */
    kind: c.text(),
    author_id: c.int(),
    body: c.longText(),
    field: c.text(),
    old_value: c.longText(),
    new_value: c.longText(),
  },

  stage_transitions: {
    entity_type: c.text(),
    entity_id: c.int(),
    pipeline: c.text(),
    from_stage_id: c.int(),
    to_stage_id: c.int(),
    user_id: c.int(),
    at: c.datetime(),
  },

  /** Журнал администрирования (раздел 7.4). Только на дописывание. */
  audit_events: {
    event_type: c.text(),
    user_id: c.int(),
    entity_type: c.text(),
    entity_id: c.int(),
    payload: c.json(),
    ip: c.text(),
    at: c.datetime(),
  },

  deals: {
    client_id: c.int(),
    listing_id: c.int(),
    final_price: c.decimal(),
    commission_fact: c.decimal(),
    closed_by_id: c.int(),
    closed_at: c.datetime(),
  },

  partner_rewards: {
    deal_id: c.int(),
    partner_id: c.int(),
    /** listing | client — по какой карточке атрибуция */
    basis: c.text(),
    amount: c.decimal(),
    /** accrued | paid */
    status: c.text(),
    paid_at: c.datetime(),
    paid_method: c.text(),
    paid_by_id: c.int(),
  },

  subscriptions: {
    partner_id: c.int(),
    /** trial | active | grace | frozen | canceled */
    status: c.text(),
    auto_renew: c.bool(),
    period_start: c.datetime(),
    period_end: c.datetime(),
    next_charge_at: c.datetime(),
    grace_until: c.datetime(),
    failed_attempts: c.int(),
    version: c.int(),
  },

  payments: {
    subscription_id: c.int(),
    partner_id: c.int(),
    amount: c.decimal(),
    currency: c.text(),
    /** pending | succeeded | failed */
    status: c.text(),
    provider: c.text(),
    provider_payment_id: c.text(),
    attempt: c.int(),
    error: c.text(),
    at: c.datetime(),
  },

  /** Только токен провайдера и маска карты; сами реквизиты карты не хранятся. */
  payment_methods: {
    partner_id: c.int(),
    provider: c.text(),
    provider_token: c.text(),
    card_mask: c.text(),
    is_active: c.bool(),
  },

  /** Доменные события для саг (закрытие сделки и т.п.): идемпотентность и повторы. */
  domain_events: {
    type: c.text(),
    idempotency_key: c.text(),
    payload: c.json(),
    /** pending | done | failed */
    status: c.text(),
    attempts: c.int(),
    last_error: c.longText(),
    processed_at: c.datetime(),
  },

  notifications_outbox: {
    channel: c.text(),
    user_id: c.int(),
    chat_id: c.text(),
    text: c.longText(),
    dedupe_key: c.text(),
    /** pending | sent | failed */
    status: c.text(),
    attempts: c.int(),
    last_error: c.text(),
    send_after: c.datetime(),
    sent_at: c.datetime(),
  },

  parser_runs: {
    started_at: c.datetime(),
    finished_at: c.datetime(),
    /** running | ok | failed */
    status: c.text(),
    found_new: c.int(),
    updated: c.int(),
    attempts: c.int(),
    errors: c.longText(),
  },

  /** Настройки системы вида ключ → JSON (например, `parser`). */
  settings: {
    key: c.text(),
    value: c.json(),
  },

  /** Пользовательские настройки: колонки таблицы, ручной порядок карточек и т.п. */
  user_prefs: {
    user_id: c.int(),
    key: c.text(),
    value: c.json(),
  },
} satisfies Record<string, TableSpec>;

export type Schema = typeof schema;
export type TableName = keyof Schema;
export type Row<T extends TableName> = RowOf<Schema[T]>;
