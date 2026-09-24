import type { Row, WithId } from '@crm/nocodb';
import type { ListingDto } from '@crm/shared';

export type { ListingDto };

export type ListingRow = WithId<Row<'listings'>>;

export function toListingDto(r: ListingRow): ListingDto {
  return {
    id: r.Id,
    title: r.title ?? '',
    description: r.description,
    price: r.price,
    currency: r.currency,
    districtId: r.district_id,
    propertyTypeId: r.property_type_id,
    rooms: r.rooms,
    floor: r.floor,
    floorsTotal: r.floors_total,
    area: r.area,
    address: r.address,
    ownerName: r.owner_name,
    phone: r.phone,
    contactsExtra: r.contacts_extra,
    source: r.source === 'parser' ? 'parser' : 'manual',
    sourceUrl: r.source_url,
    stageId: r.stage_id,
    responsibleId: r.responsible_id,
    partnerSourceId: r.partner_source_id,
    createdById: r.created_by_id,
    meetingAt: r.meeting_at,
    closeOutcome: r.close_outcome,
    commissionPercent: r.commission_percent,
    lastActivityAt: r.last_activity_at,
    coverPhotoId: r.cover_photo_id,
    createdAt: r.CreatedAt,
    version: r.version ?? 1,
  };
}
