import type { Actor } from '@crm/shared';
import type { ListingRow } from './listing.mapper.js';

/**
 * Видимость одной карточки (2.2, В-5) — то же правило, что и фильтр в ListingsService.visibleTo:
 * партнёр видит созданные им, назначенные ему и незакреплённые карточки «Нового объявления».
 */
export function isListingVisible(actor: Actor, row: ListingRow, newStageId: number): boolean {
  if (row.deleted_at) return false;
  if (actor.role !== 'partner') return true;
  return (
    row.created_by_id === actor.id ||
    row.responsible_id === actor.id ||
    (row.stage_id === newStageId && row.responsible_id === null)
  );
}
