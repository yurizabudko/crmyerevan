import { w, type Condition } from '@crm/nocodb';
import type { Actor } from '@crm/shared';
import type { ClientRow } from './client.mapper.js';

/** Видимость клиентов (2.2): партнёр видит созданных им и назначенных ему, остальные — всех. */
export function visibleClients(actor: Actor): Condition {
  const notDeleted = w.blank('deleted_at');
  if (actor.role !== 'partner') return notDeleted;
  return w.and(notDeleted, w.or(w.eq('created_by_id', actor.id), w.eq('responsible_id', actor.id)));
}

export function isClientVisible(actor: Actor, row: ClientRow): boolean {
  if (row.deleted_at) return false;
  if (actor.role !== 'partner') return true;
  return row.created_by_id === actor.id || row.responsible_id === actor.id;
}
