import type { ListingDraft } from '@crm/shared';

// TODO(auto-import): контракт адаптера внешнего источника объявлений.
//
// Сейчас объявления добавляются только вручную. Автоматический сбор с list.am отложен:
// сайт закрыт Cloudflare, а его robots.txt запрещает доступ ИИ-агентам (см. docs/PLAN.md, риски).
// Кандидаты: parse.bot (List.am API), официальный доступ от list.am, расширение для браузера.
//
// Как подключить источник:
//   1. Реализовать ListingSource для выбранного провайдера (отдельный процесс apps/parser, НФТ-7).
//   2. Для каждого объявления вызывать ListingIntakeService.intake(draft, 'parser', null) —
//      вынести его в общий пакет, чтобы парсер не зависел от HTTP-слоя API.
//   3. Настройки (вкл/выкл, частота 2–15 мин, фильтры) уже лежат в таблице settings под ключом
//      'parser' (см. DEFAULT_PARSER_SETTINGS в @crm/nocodb), лог запусков — в parser_runs.

/** Объявление из внешнего источника, приведённое к полям CRM. */
export interface SourcedListing extends ListingDraft {
  /** ID объявления у источника (например, item_id на list.am). */
  externalId: string;
  /** Ссылки на оригинальные фото — до обрезки водяного знака. */
  photoUrls: string[];
}

export interface ListingSourceFilter {
  city: string;
  category: string;
  ownerOnly: boolean;
}

export interface ListingSource {
  readonly name: string;
  /** Свежие объявления, начиная с самых новых; источник сам решает, где остановиться. */
  fetchLatest(filter: ListingSourceFilter): AsyncIterable<SourcedListing>;
}
