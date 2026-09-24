import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { w, type Condition, type NocoDb, type TableName } from '@crm/nocodb';
import {
  CLIENT_COLUMNS,
  CLIENT_SORT_FIELDS,
  LISTING_COLUMNS,
  LISTING_SORT_FIELDS,
  OVERDUE_CLIENT_STAGES,
  type Actor,
  type ClientColumn,
  type ClientDto,
  type ClientTableQuery,
  type ListingColumn,
  type ListingDto,
  type ListingTableQuery,
  type TablePage,
} from '@crm/shared';
import { AuditService } from '../audit/audit.service.js';
import { formatMoment } from '../common/card-utils.js';
import { NOCODB } from '../infra/infra.module.js';
import { toClientDto } from '../clients/client.mapper.js';
import { toListingDto } from '../listings/listing.mapper.js';
import { StagesService } from '../listings/stages.service.js';
import { toCsv } from './csv.js';

const CSV_LIMIT = 10_000;

type Query = ListingTableQuery | ClientTableQuery;

/**
 * Табличное представление (раздел 5). Фильтрация, поиск, сортировка и постраничность —
 * на стороне NocoDB; партнёр видит только созданные им и назначенные ему записи (БТ-5.9).
 */
@Injectable()
export class TableService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listings(actor: Actor, q: ListingTableQuery): Promise<TablePage<ListingDto>> {
    const where = this.listingWhere(actor, q);
    const page = await this.db.table('listings').list({
      where,
      sort: sortOf(q.sort, LISTING_SORT_FIELDS),
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
    });
    return {
      rows: page.list.map(toListingDto),
      total: page.pageInfo.totalRows,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async clients(actor: Actor, q: ClientTableQuery): Promise<TablePage<ClientDto>> {
    const [where, overdue] = await Promise.all([this.clientWhere(actor, q), this.overdueStages()]);
    const page = await this.db.table('clients').list({
      where,
      sort: sortOf(q.sort, CLIENT_SORT_FIELDS),
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
    });
    return {
      rows: page.list.map((r) => toClientDto(r, overdue)),
      total: page.pageInfo.totalRows,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** CSV отфильтрованной выборки (БТ-5.8) в колонках, которые видит пользователь. */
  async listingsCsv(actor: Actor, q: ListingTableQuery): Promise<string> {
    const rows = await this.db.table('listings').list({
      where: this.listingWhere(actor, q),
      sort: sortOf(q.sort, LISTING_SORT_FIELDS),
      limit: CSV_LIMIT,
    });
    const columns = pickColumns(q.columns, LISTING_COLUMNS);
    const names = await this.names('listings');
    const value = (l: ListingDto, c: ListingColumn) => {
      switch (c) {
        case 'stage':
          return names.stage(l.stageId);
        case 'district':
          return names.dict(l.districtId);
        case 'propertyType':
          return names.dict(l.propertyTypeId);
        case 'responsible':
          return names.user(l.responsibleId);
        case 'partnerSource':
          return names.user(l.partnerSourceId);
        case 'source':
          return l.source === 'parser' ? 'автоимпорт' : 'вручную';
        case 'meetingAt':
        case 'createdAt':
        case 'lastActivityAt':
          return formatMoment(l[c]);
        case 'price':
          return l.price;
        default:
          return l[c];
      }
    };
    const dtos = rows.list.map(toListingDto);
    await this.logExport(actor, 'listings', dtos.length);
    return toCsv(
      columns.map((c) => LISTING_COLUMNS[c]),
      dtos.map((l) => columns.map((c) => value(l, c))),
    );
  }

  async clientsCsv(actor: Actor, q: ClientTableQuery): Promise<string> {
    const [where, overdue] = await Promise.all([this.clientWhere(actor, q), this.overdueStages()]);
    const rows = await this.db.table('clients').list({
      where,
      sort: sortOf(q.sort, CLIENT_SORT_FIELDS),
      limit: CSV_LIMIT,
    });
    const columns = pickColumns(q.columns, CLIENT_COLUMNS);
    const names = await this.names('clients');
    const value = (c: ClientDto, col: ClientColumn) => {
      switch (col) {
        case 'stage':
          return names.stage(c.stageId);
        case 'districts':
          return c.districtIds.map((id) => names.dict(id)).join(', ');
        case 'propertyType':
          return names.dict(c.propertyTypeId);
        case 'source':
          return names.dict(c.sourceId);
        case 'responsible':
          return names.user(c.responsibleId);
        case 'partnerSource':
          return names.user(c.partnerSourceId);
        case 'createdAt':
        case 'lastActivityAt':
          return formatMoment(c[col]);
        default:
          return c[col];
      }
    };
    const dtos = rows.list.map((r) => toClientDto(r, overdue));
    await this.logExport(actor, 'clients', dtos.length);
    return toCsv(
      columns.map((c) => CLIENT_COLUMNS[c]),
      dtos.map((c) => columns.map((col) => value(c, col))),
    );
  }

  private listingWhere(actor: Actor, q: ListingTableQuery): Condition {
    const conditions = [...this.common(actor, q)];
    if (q.source) conditions.push(w.eq('source', q.source));
    if (q.priceMin !== undefined) conditions.push(w.gte('price', q.priceMin));
    if (q.priceMax !== undefined) conditions.push(w.lte('price', q.priceMax));
    if (q.q) {
      conditions.push(
        w.or(w.like('title', `%${q.q}%`), w.like('description', `%${q.q}%`), ...phoneSearch(q.q)),
      );
    }
    return w.and(...conditions);
  }

  private async clientWhere(actor: Actor, q: ClientTableQuery): Promise<Condition> {
    const conditions = [...this.common(actor, q)];
    if (q.sourceId) conditions.push(w.eq('source_id', q.sourceId));
    // Бюджет клиента пересекается с диапазоном фильтра.
    if (q.budgetMin !== undefined) {
      conditions.push(w.or(w.gte('budget_max', q.budgetMin), w.gte('budget_min', q.budgetMin)));
    }
    if (q.budgetMax !== undefined) {
      conditions.push(w.or(w.lte('budget_min', q.budgetMax), w.lte('budget_max', q.budgetMax)));
    }
    if (q.q) {
      conditions.push(
        w.or(w.like('name', `%${q.q}%`), w.like('notes', `%${q.q}%`), ...phoneSearch(q.q)),
      );
    }
    return w.and(...conditions);
  }

  /** Видимость, этап, ответственный и диапазоны дат — общие для обеих таблиц. */
  private common(actor: Actor, q: Query): Condition[] {
    const conditions: Condition[] = [w.blank('deleted_at')];
    if (actor.role === 'partner') {
      conditions.push(w.or(w.eq('created_by_id', actor.id), w.eq('responsible_id', actor.id)));
    }
    if (q.stageIds?.length) conditions.push(w.in('stage_id', q.stageIds));
    if (q.responsibleId) conditions.push(w.eq('responsible_id', q.responsibleId));
    if (q.createdFrom) conditions.push(w.onOrAfter('CreatedAt', new Date(q.createdFrom)));
    if (q.createdTo) conditions.push(w.before('CreatedAt', new Date(q.createdTo)));
    if (q.updatedFrom) conditions.push(w.onOrAfter('last_activity_at', new Date(q.updatedFrom)));
    if (q.updatedTo) conditions.push(w.before('last_activity_at', new Date(q.updatedTo)));
    return conditions;
  }

  private async overdueStages(): Promise<Set<number>> {
    const stages = await this.stages.list('clients');
    return new Set(
      stages
        .filter((s) => (OVERDUE_CLIENT_STAGES as readonly string[]).includes(s.code))
        .map((s) => s.id),
    );
  }

  /** Названия этапов, справочников и пользователей для CSV. */
  private async names(pipeline: 'listings' | 'clients') {
    const [stages, dict, users] = await Promise.all([
      this.stages.list(pipeline),
      this.db.table('dictionary_items').listAll({ fields: ['Id', 'name'] }),
      this.db.table('users').listAll({ fields: ['Id', 'display_name'] }),
    ]);
    const find = <T extends { Id: number }>(list: T[], id: number | null) =>
      id === null ? undefined : list.find((x) => x.Id === id);
    return {
      stage: (id: number | null) => stages.find((s) => s.id === id)?.name ?? '',
      dict: (id: number | null) => find(dict, id)?.name ?? '',
      user: (id: number | null) => find(users, id)?.display_name ?? '',
    };
  }

  private async logExport(actor: Actor, table: TableName, rows: number): Promise<void> {
    await this.audit.record({
      type: 'export.csv',
      userId: actor.id,
      entityType: table,
      payload: { rows },
    });
  }
}

/** Телефон ищем и как введён, и по цифрам — в нормализованном виде (+374…). */
function phoneSearch(q: string): Condition[] {
  const digits = q.replace(/\D/g, '');
  const conditions = [w.like('phone', `%${q}%`)];
  if (digits.length >= 4) {
    // Внутренний формат 0XX… хранится как +374XX…: ведущий ноль отбрасываем.
    conditions.push(w.like('phone_normalized', `%${digits.replace(/^0/, '')}%`));
  }
  return conditions;
}

function sortOf(sort: string | undefined, fields: Record<string, string | undefined>): string[] {
  if (!sort) return ['-last_activity_at', '-Id'];
  const desc = sort.startsWith('-');
  const field = fields[desc ? sort.slice(1) : sort];
  if (!field) throw new BadRequestException(`Нельзя сортировать по «${sort}»`);
  return [`${desc ? '-' : ''}${field}`, '-Id'];
}

function pickColumns<K extends string>(
  requested: string[] | undefined,
  all: Record<K, string>,
): K[] {
  const keys = Object.keys(all) as K[];
  if (!requested?.length) return keys;
  return requested.filter((c): c is K => keys.includes(c as K));
}
