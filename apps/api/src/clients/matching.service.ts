import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { w, type Condition, type NocoDb } from '@crm/nocodb';
import type { Actor, MatchDto } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';
import { isListingVisible } from '../listings/access.js';
import { toListingDto } from '../listings/listing.mapper.js';
import { StagesService } from '../listings/stages.service.js';
import { toClientDto } from './client.mapper.js';
import { isClientVisible } from './access.js';

const LIMIT = 50;

/**
 * Автоподбор по параметрам (БТ-3.2.2): бюджет, район, тип объекта, комнаты.
 * Бюджет и цена сравниваются только в одной валюте — пересчёта курсов нет.
 */
@Injectable()
export class MatchingService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(StagesService) private readonly stages: StagesService,
  ) {}

  /** Объявления для клиента; с `q` — поиск по названию вместо критериев. */
  async listingsForClient(actor: Actor, clientId: number, q?: string): Promise<MatchDto[]> {
    const client = await this.db.table('clients').get(clientId);
    if (!client || !isClientVisible(actor, client)) throw new NotFoundException('Клиент не найден');

    const [closed, newStage] = await Promise.all([
      this.stages.byCode('listings', 'closed'),
      this.stages.byCode('listings', 'new'),
    ]);
    const linked = await this.db
      .table('client_listing_links')
      .listAll({ where: w.eq('client_id', clientId), fields: ['listing_id'] });
    const exclude = linked.map((l) => l.listing_id).filter((id): id is number => id !== null);

    const conditions: Condition[] = [w.blank('deleted_at'), w.neq('stage_id', closed.id)];
    if (exclude.length > 0) conditions.push(notIn('Id', exclude));
    const reasons: string[] = [];
    const search = q?.trim();
    if (search) {
      conditions.push(w.like('title', `%${search}%`));
    } else {
      const districts = Array.isArray(client.district_ids) ? client.district_ids : [];
      if (client.budget_max !== null || client.budget_min !== null) {
        conditions.push(w.notBlank('price'), w.eq('currency', client.currency ?? 'USD'));
        if (client.budget_max !== null) conditions.push(w.lte('price', client.budget_max));
        if (client.budget_min !== null) conditions.push(w.gte('price', client.budget_min));
        reasons.push('бюджет');
      }
      if (districts.length > 0) {
        conditions.push(w.in('district_id', districts));
        reasons.push('район');
      }
      if (client.property_type_id !== null) {
        conditions.push(w.eq('property_type_id', client.property_type_id));
        reasons.push('тип');
      }
      if (client.rooms_min !== null) conditions.push(w.gte('rooms', client.rooms_min));
      if (client.rooms_max !== null) conditions.push(w.lte('rooms', client.rooms_max));
      if (client.rooms_min !== null || client.rooms_max !== null) reasons.push('комнаты');
      // Без критериев подбор бессмыслен — сначала квалификация.
      if (reasons.length === 0) return [];
    }

    const rows = await this.db
      .table('listings')
      .list({ where: w.and(...conditions), sort: ['-last_activity_at'], limit: LIMIT * 2 });
    return rows.list
      .filter((row) => isListingVisible(actor, row, newStage.id))
      .slice(0, LIMIT)
      .map((row) => ({ listing: toListingDto(row), reasons: search ? ['поиск'] : reasons }));
  }

  /** Клиенты под объявление: бюджет покрывает цену, район и тип подходят (БТ-3.2.2). */
  async clientsForListing(actor: Actor, listingId: number): Promise<MatchDto[]> {
    const listing = await this.db.table('listings').get(listingId);
    const newStage = await this.stages.byCode('listings', 'new');
    if (!listing || !isListingVisible(actor, listing, newStage.id)) {
      throw new NotFoundException('Объявление не найдено');
    }
    if (listing.price === null) return [];

    const clientStages = await this.stages.list('clients');
    const terminal = clientStages.filter((s) => s.isTerminal).map((s) => s.id);
    const conditions: Condition[] = [
      w.blank('deleted_at'),
      w.eq('currency', listing.currency ?? 'USD'),
      w.or(w.notBlank('budget_max'), w.notBlank('budget_min')),
      w.or(w.blank('budget_max'), w.gte('budget_max', listing.price)),
      w.or(w.blank('budget_min'), w.lte('budget_min', listing.price)),
    ];
    if (terminal.length > 0) conditions.push(notIn('stage_id', terminal));
    if (listing.property_type_id !== null) {
      conditions.push(
        w.or(w.blank('property_type_id'), w.eq('property_type_id', listing.property_type_id)),
      );
    }
    const linked = await this.db
      .table('client_listing_links')
      .listAll({ where: w.eq('listing_id', listingId), fields: ['client_id'] });
    const linkedIds = new Set(linked.map((l) => l.client_id));

    const rows = await this.db
      .table('clients')
      .listAll({ where: w.and(...conditions), sort: ['-last_activity_at'] });
    const overdue = new Set<number>();
    return rows
      .filter((c) => isClientVisible(actor, c) && !linkedIds.has(c.Id))
      .filter((c) => {
        // JSON-поле районов фильтруем в приложении: NocoDB не умеет искать внутри массива.
        const districts = Array.isArray(c.district_ids) ? c.district_ids : [];
        return (
          districts.length === 0 ||
          listing.district_id === null ||
          districts.includes(listing.district_id)
        );
      })
      .slice(0, LIMIT)
      .map((c) => ({ client: toClientDto(c, overdue), reasons: ['бюджет', 'район', 'тип'] }));
  }
}

/** «Не входит в список» — в NocoDB это цепочка neq. */
function notIn(field: string, ids: number[]): Condition {
  return w.and(...ids.map((id) => w.neq(field, id)));
}
