import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { w, type NocoDb, type Row } from '@crm/nocodb';
import {
  CLIENT_FIELD_LABELS,
  PARTNER_LOCKED_CLIENT_FIELDS,
  can,
  checkClientTransition,
  normalizePhone,
  type Actor,
  type ClientDraft,
  type ClientPatch,
  type ClientStageChange,
  type NewComment,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import {
  assertDictionaryItem,
  assertVersion,
  formatMoment,
  historyEntry,
  sameValue,
} from '../common/card-utils.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { CommentsService, type FieldChange } from '../listings/comments.service.js';
import { StagesService } from '../listings/stages.service.js';
import type { ClientRow } from './client.mapper.js';
import { isClientVisible } from './clients.service.js';

type ClientColumns = Partial<Row<'clients'>>;
type PatchField = Exclude<keyof ClientPatch, 'version'>;

const COLUMNS: Record<PatchField, keyof Row<'clients'>> = {
  name: 'name',
  phone: 'phone',
  messenger: 'messenger',
  sourceId: 'source_id',
  budgetMin: 'budget_min',
  budgetMax: 'budget_max',
  currency: 'currency',
  districtIds: 'district_ids',
  propertyTypeId: 'property_type_id',
  roomsMin: 'rooms_min',
  roomsMax: 'rooms_max',
  floorPreference: 'floor_preference',
  timeframe: 'timeframe',
  notes: 'notes',
  agreedPrice: 'agreed_price',
  finalPrice: 'final_price',
  commissionFact: 'commission_fact',
  nextShowingAt: 'next_showing_at',
  responsibleId: 'responsible_id',
  partnerSourceId: 'partner_source_id',
};

type HistoryItem = { body: string; change?: FieldChange };

/**
 * Воронка клиентов (раздел 4): создание с проверкой уникальности телефона,
 * переходы по правилам 4.1, правка с историей, комментарии, удаление.
 */
@Injectable()
export class ClientWorkflowService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(actor: Actor, draft: ClientDraft): Promise<number> {
    const phone = requirePhone(draft.phone);
    await assertDictionaryItem(this.db, draft.sourceId, 'source', 'Источник');
    await this.assertDistricts(draft.districtIds);
    if (draft.propertyTypeId) {
      await assertDictionaryItem(this.db, draft.propertyTypeId, 'property_type', 'Тип объекта');
    }

    const id = await withLock(this.redis, `client-phone:${phone}`, async () => {
      await this.assertPhoneFree(actor, phone);
      const newStage = await this.stages.byCode('clients', 'new');
      const now = new Date().toISOString();
      return this.db.table('clients').create({
        name: draft.name,
        phone: draft.phone,
        phone_normalized: phone,
        messenger: draft.messenger ?? null,
        source_id: draft.sourceId,
        budget_min: draft.budgetMin ?? null,
        budget_max: draft.budgetMax ?? null,
        currency: draft.currency,
        district_ids: draft.districtIds ?? null,
        property_type_id: draft.propertyTypeId ?? null,
        rooms_min: draft.roomsMin ?? null,
        rooms_max: draft.roomsMax ?? null,
        floor_preference: draft.floorPreference ?? null,
        timeframe: draft.timeframe ?? null,
        notes: draft.notes ?? null,
        stage_id: newStage.id,
        // Создатель ведёт клиента; партнёр ещё и источник (БТ-8.2.1).
        responsible_id: actor.id,
        partner_source_id: actor.role === 'partner' ? actor.id : null,
        created_by_id: actor.id,
        showings_count: 0,
        last_activity_at: now,
        version: 1,
      });
    });

    await this.comments.system({ type: 'client', id }, actor.id, 'Клиент создан');
    await this.audit.record({
      type: 'client.created',
      userId: actor.id,
      entityType: 'client',
      entityId: id,
    });
    return id;
  }

  changeStage(actor: Actor, id: number, input: ClientStageChange): Promise<void> {
    return withLock(this.redis, `client:${id}`, async () => {
      const row = await this.load(actor, id);
      assertVersion(row, input.version);

      const all = await this.stages.list('clients');
      const from = all.find((s) => s.id === row.stage_id);
      const to = all.find((s) => s.id === input.stageId);
      if (!to) throw new BadRequestException('Этап не найден');

      const linkedListings = await this.db
        .table('client_listing_links')
        .count(w.eq('client_id', id));
      const { stageId: _s, version: _v, ...stageInput } = input;
      const errors = checkClientTransition({
        actor,
        from: { code: from?.code ?? null, isTerminal: from?.isTerminal ?? false },
        to: { code: to.code },
        client: {
          budgetMin: row.budget_min,
          budgetMax: row.budget_max,
          districtIds: Array.isArray(row.district_ids) ? row.district_ids : null,
          propertyTypeId: row.property_type_id,
          timeframe: row.timeframe,
          agreedPrice: row.agreed_price,
          linkedListings,
        },
        input: stageInput,
      });
      if (errors.length > 0) throw new BadRequestException({ message: errors.join('. '), errors });

      const now = new Date().toISOString();
      const patch: ClientColumns = {
        stage_id: to.id,
        last_activity_at: now,
        version: (row.version ?? 1) + 1,
      };
      const history: HistoryItem[] = [
        {
          body: `Этап: ${from?.name ?? '—'} → ${to.name}`,
          change: { field: 'stageId', oldValue: from?.name, newValue: to.name },
        },
      ];
      if (input.conversationConfirmed)
        history.push({ body: 'Первый разговор с клиентом состоялся' });

      if (to.code === 'showings' && input.showingAt) {
        await this.db.table('showings').create({
          client_id: id,
          scheduled_at: input.showingAt,
          created_by_id: actor.id,
        });
        patch.showings_count = (row.showings_count ?? 0) + 1;
        patch.next_showing_at = input.showingAt;
        history.push({ body: `Назначен показ: ${formatMoment(input.showingAt)}` });
      }
      if (input.agreedPrice !== undefined && input.agreedPrice !== row.agreed_price) {
        patch.agreed_price = input.agreedPrice;
        history.push(this.entry('agreedPrice', str(row.agreed_price), str(input.agreedPrice)));
      }
      if (to.code === 'deal_closed') {
        patch.final_price = input.finalPrice ?? null;
        patch.commission_fact = input.commissionFact ?? null;
        history.push(this.entry('finalPrice', str(row.final_price), str(input.finalPrice)));
        history.push(
          this.entry('commissionFact', str(row.commission_fact), str(input.commissionFact)),
        );
      }
      if (to.code === 'rejected' && input.rejectReasonId !== undefined) {
        const reason = await assertDictionaryItem(
          this.db,
          input.rejectReasonId,
          'reject_reason',
          'Причина отказа',
        );
        patch.reject_reason_id = input.rejectReasonId;
        history.push({
          body: `Причина отказа: ${reason}`,
          change: { field: 'rejectReasonId', oldValue: null, newValue: reason },
        });
      } else if (from?.code === 'rejected') {
        patch.reject_reason_id = null;
      }

      await this.db.table('clients').update(id, patch);
      await this.db.table('stage_transitions').create({
        entity_type: 'client',
        entity_id: id,
        pipeline: 'clients',
        from_stage_id: row.stage_id,
        to_stage_id: to.id,
        user_id: actor.id,
        at: now,
      });
      await this.comments.systemMany({ type: 'client', id }, actor.id, history);
    });
  }

  update(actor: Actor, id: number, input: ClientPatch): Promise<void> {
    const { version, ...fields } = input;
    const keys = Object.keys(fields) as PatchField[];
    if (actor.role === 'partner') {
      const denied = keys.filter((k) =>
        (PARTNER_LOCKED_CLIENT_FIELDS as readonly string[]).includes(k),
      );
      if (denied.length > 0) {
        throw new ForbiddenException(
          `Партнёр не может менять: ${denied.map((k) => CLIENT_FIELD_LABELS[k]).join(', ')}`,
        );
      }
    }
    if (keys.includes('partnerSourceId') && actor.role !== 'owner') {
      throw new ForbiddenException('Партнёра-источника назначает Владелец');
    }

    return withLock(this.redis, `client:${id}`, async () => {
      const row = await this.load(actor, id);
      assertVersion(row, version);
      await this.validate(fields);

      const patch: ClientColumns = {};
      const history: HistoryItem[] = [];
      for (const key of keys) {
        const column = COLUMNS[key];
        const before = row[column];
        const after = fields[key] ?? null;
        if (sameValue(before, after, key === 'nextShowingAt')) continue;
        (patch as Record<string, unknown>)[column] = after;
        history.push(
          this.entry(key, await this.display(key, before), await this.display(key, after)),
        );
      }
      if (history.length === 0) return;

      const write = async () => {
        patch.last_activity_at = new Date().toISOString();
        patch.version = (row.version ?? 1) + 1;
        await this.db.table('clients').update(id, patch);
      };
      if ('phone' in patch) {
        const phone = requirePhone(String(patch.phone));
        patch.phone_normalized = phone;
        await withLock(this.redis, `client-phone:${phone}`, async () => {
          await this.assertPhoneFree(actor, phone, id);
          await write();
        });
      } else {
        await write();
      }
      await this.comments.systemMany({ type: 'client', id }, actor.id, history);
    });
  }

  async addComment(actor: Actor, id: number, input: NewComment): Promise<void> {
    await this.load(actor, id);
    await this.comments.add({ type: 'client', id }, actor.id, input.kind, input.body);
    // Комментарий — активность (БТ-4.2.2): снимает метку «просрочено».
    await this.db.table('clients').update(id, { last_activity_at: new Date().toISOString() });
  }

  async remove(actor: Actor, id: number): Promise<void> {
    if (!can.deleteCards(actor)) throw new ForbiddenException('Нет права на удаление карточек');
    await withLock(this.redis, `client:${id}`, async () => {
      const row = await this.load(actor, id);
      await this.db.table('clients').update(id, {
        deleted_at: new Date().toISOString(),
        deleted_by_id: actor.id,
        version: (row.version ?? 1) + 1,
      });
      await this.comments.system({ type: 'client', id }, actor.id, 'Карточка удалена');
      await this.audit.record({
        type: 'client.deleted',
        userId: actor.id,
        entityType: 'client',
        entityId: id,
        payload: { name: row.name },
      });
    });
  }

  private async load(actor: Actor, id: number): Promise<ClientRow> {
    const row = await this.db.table('clients').get(id);
    if (!row || !isClientVisible(actor, row)) throw new NotFoundException('Клиент не найден');
    return row;
  }

  /** Телефон клиента уникален (БТ-4.3): при дубле — предупреждение со ссылкой на карточку. */
  private async assertPhoneFree(actor: Actor, phone: string, exceptId?: number): Promise<void> {
    const conditions = [w.eq('phone_normalized', phone), w.blank('deleted_at')];
    if (exceptId !== undefined) conditions.push(w.neq('Id', exceptId));
    const existing = await this.db.table('clients').findOne(w.and(...conditions));
    if (!existing) return;
    throw new ConflictException({
      code: 'DUPLICATE_CLIENT',
      message: `Клиент с этим телефоном уже есть: ${existing.name ?? ''}`.trim(),
      existingId: isClientVisible(actor, existing) ? existing.Id : undefined,
    });
  }

  private async validate(fields: Omit<ClientPatch, 'version'>): Promise<void> {
    if (fields.sourceId) await assertDictionaryItem(this.db, fields.sourceId, 'source', 'Источник');
    if (fields.propertyTypeId) {
      await assertDictionaryItem(this.db, fields.propertyTypeId, 'property_type', 'Тип объекта');
    }
    await this.assertDistricts(fields.districtIds ?? undefined);
    for (const key of ['responsibleId', 'partnerSourceId'] as const) {
      const value = fields[key];
      if (value == null) continue;
      const user = await this.db.table('users').get(value);
      if (!user || user.status !== 'active') {
        throw new BadRequestException(`${CLIENT_FIELD_LABELS[key]}: пользователь не найден`);
      }
      if (key === 'partnerSourceId' && user.role !== 'partner') {
        throw new BadRequestException('Партнёром-источником может быть только партнёр');
      }
    }
  }

  private async assertDistricts(ids: number[] | undefined): Promise<void> {
    for (const districtId of ids ?? []) {
      await assertDictionaryItem(this.db, districtId, 'district', 'Район');
    }
  }

  private entry(field: string, oldValue: string | null, newValue: string | null) {
    return historyEntry(CLIENT_FIELD_LABELS, field, oldValue, newValue);
  }

  private async display(field: PatchField, value: unknown): Promise<string | null> {
    if (value === null || value === undefined || value === '') return null;
    switch (field) {
      case 'sourceId':
      case 'propertyTypeId':
        return (await this.db.table('dictionary_items').get(Number(value)))?.name ?? String(value);
      case 'districtIds': {
        const ids = value as number[];
        if (ids.length === 0) return null;
        const items = await this.db
          .table('dictionary_items')
          .listAll({ where: w.in('Id', ids), fields: ['Id', 'name'] });
        return ids.map((i) => items.find((d) => d.Id === i)?.name ?? String(i)).join(', ');
      }
      case 'responsibleId':
      case 'partnerSourceId':
        return (await this.db.table('users').get(Number(value)))?.display_name ?? String(value);
      case 'nextShowingAt':
        return formatMoment(String(value));
      default:
        return String(value);
    }
  }
}

function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new BadRequestException('Некорректный номер телефона');
  return phone;
}

function str(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}
