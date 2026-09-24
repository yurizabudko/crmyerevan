import type { Row, WithId } from '@crm/nocodb';
import { OVERDUE_AFTER_HOURS, type ClientDto } from '@crm/shared';
import { toDate } from '../common/card-utils.js';

export type ClientRow = WithId<Row<'clients'>>;

/**
 * @param overdueStageIds этапы 1–3 воронки клиентов, где действует контроль активности (БТ-4.2.1)
 */
export function toClientDto(
  r: ClientRow,
  overdueStageIds: Set<number>,
  now = new Date(),
): ClientDto {
  const lastActivity = r.last_activity_at ?? r.CreatedAt;
  const idleHours = (now.getTime() - toDate(lastActivity).getTime()) / 3_600_000;
  return {
    id: r.Id,
    name: r.name ?? '',
    phone: r.phone,
    messenger: r.messenger,
    sourceId: r.source_id,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    currency: r.currency,
    districtIds: Array.isArray(r.district_ids) ? r.district_ids : [],
    propertyTypeId: r.property_type_id,
    roomsMin: r.rooms_min,
    roomsMax: r.rooms_max,
    floorPreference: r.floor_preference,
    timeframe: r.timeframe,
    notes: r.notes,
    stageId: r.stage_id,
    responsibleId: r.responsible_id,
    partnerSourceId: r.partner_source_id,
    createdById: r.created_by_id,
    agreedPrice: r.agreed_price,
    finalPrice: r.final_price,
    commissionFact: r.commission_fact,
    rejectReasonId: r.reject_reason_id,
    showingsCount: r.showings_count ?? 0,
    nextShowingAt: r.next_showing_at,
    lastActivityAt: r.last_activity_at,
    isOverdue:
      r.stage_id !== null && overdueStageIds.has(r.stage_id) && idleHours > OVERDUE_AFTER_HOURS,
    createdAt: r.CreatedAt,
    version: r.version ?? 1,
  };
}
