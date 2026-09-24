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
  LISTING_FIELD_LABELS,
  PARTNER_EDITABLE_LISTING_FIELDS,
  can,
  checkListingTransition,
  normalizePhone,
  type Actor,
  type ListingPatch,
  type ListingStageChange,
  type NewComment,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { isListingVisible } from './access.js';
import { CommentsService, type FieldChange } from './comments.service.js';
import type { ListingRow } from './listing.mapper.js';
import { StagesService } from './stages.service.js';

type ListingColumns = Partial<Row<'listings'>>;
type PatchField = Exclude<keyof ListingPatch, 'version'>;

/** Поле API → колонка NocoDB. */
const COLUMNS: Record<PatchField, keyof Row<'listings'>> = {
  title: 'title',
  description: 'description',
  price: 'price',
  currency: 'currency',
  districtId: 'district_id',
  propertyTypeId: 'property_type_id',
  rooms: 'rooms',
  floor: 'floor',
  floorsTotal: 'floors_total',
  area: 'area',
  address: 'address',
  ownerName: 'owner_name',
  phone: 'phone',
  contactsExtra: 'contacts_extra',
  sourceUrl: 'source_url',
  commissionPercent: 'commission_percent',
  meetingAt: 'meeting_at',
  responsibleId: 'responsible_id',
  partnerSourceId: 'partner_source_id',
};

const OUTCOME_LABEL = { success: 'сделка', lost: 'объект потерян' } as const;

/**
 * Работа с карточкой объявления: смена этапа, правка полей, комментарии.
 * Каждая операция выполняется под блокировкой карточки и проверяет версию,
 * которую видел пользователь, — в NocoDB нет условного UPDATE (НФТ-2).
 */
@Injectable()
export class ListingWorkflowService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Перевод на другой этап с проверкой правил (БТ-3.1.1) и захватом карточки партнёром (В-5). */
  changeStage(actor: Actor, id: number, input: ListingStageChange): Promise<void> {
    return withLock(this.redis, `listing:${id}`, async () => {
      const row = await this.loadForActor(actor, id);
      assertVersion(row, input.version);

      const all = await this.stages.list('listings');
      const from = all.find((s) => s.id === row.stage_id);
      const to = all.find((s) => s.id === input.stageId);
      if (!to) throw new BadRequestException('Этап не найден');

      const errors = checkListingTransition({
        actor,
        from: { code: from?.code ?? null, isTerminal: from?.isTerminal ?? false },
        to: { code: to.code },
        hasMeetingAt: row.meeting_at !== null,
        input,
      });
      if (errors.length > 0) {
        throw new BadRequestException({ message: errors.join('. '), errors });
      }

      const now = new Date().toISOString();
      const patch: ListingColumns = {
        stage_id: to.id,
        last_activity_at: now,
        version: (row.version ?? 1) + 1,
      };
      const history: { body: string; change?: FieldChange }[] = [
        {
          body: `Этап: ${from?.name ?? '—'} → ${to.name}`,
          change: { field: 'stageId', oldValue: from?.name, newValue: to.name },
        },
      ];

      if (input.contactConfirmed) history.push({ body: 'Контакт с собственником состоялся' });
      if (input.actualityConfirmed) {
        history.push({ body: 'Собственник подтвердил актуальность объекта' });
      }
      if (input.meetingAt && !sameInstant(row.meeting_at, input.meetingAt)) {
        patch.meeting_at = input.meetingAt;
        history.push(
          this.fieldEntry('meetingAt', formatMoment(row.meeting_at), formatMoment(input.meetingAt)),
        );
      }
      if (to.code === 'closed' && input.closeOutcome) {
        patch.close_outcome = input.closeOutcome;
        history.push({
          body: `Объект закрыт: ${OUTCOME_LABEL[input.closeOutcome]}`,
          change: { field: 'closeOutcome', oldValue: null, newValue: input.closeOutcome },
        });
      } else if (from?.isTerminal && row.close_outcome) {
        patch.close_outcome = null;
      }

      // Партнёр забирает карточку из общего пула: он ответственный и партнёр-источник (В-5).
      if (actor.role === 'partner' && row.responsible_id === null) {
        patch.responsible_id = actor.id;
        patch.partner_source_id = row.partner_source_id ?? actor.id;
        patch.claimed_at = now;
        history.push({ body: 'Партнёр взял карточку в работу' });
      }

      await this.db.table('listings').update(id, patch);
      await this.db.table('stage_transitions').create({
        entity_type: 'listing',
        entity_id: id,
        pipeline: 'listings',
        from_stage_id: row.stage_id,
        to_stage_id: to.id,
        user_id: actor.id,
        at: now,
      });
      await this.comments.systemMany({ type: 'listing', id }, actor.id, history);
    });
  }

  /** Правка полей с записью каждого изменения в историю (БТ-3.4.2) и ограничениями партнёра (БТ-2.3). */
  update(actor: Actor, id: number, input: ListingPatch): Promise<void> {
    const { version, ...fields } = input;
    const keys = Object.keys(fields) as PatchField[];
    this.assertCanEdit(actor, keys);

    return withLock(this.redis, `listing:${id}`, async () => {
      const row = await this.loadForActor(actor, id);
      assertVersion(row, version);
      await this.validateReferences(fields, row);

      const patch: ListingColumns = {};
      const history: { body: string; change: FieldChange }[] = [];
      for (const key of keys) {
        const column = COLUMNS[key];
        const before = row[column];
        const after = fields[key] ?? null;
        if (equal(key, before, after)) continue;
        (patch as Record<string, unknown>)[column] = after;
        history.push(
          this.fieldEntry(key, await this.display(key, before), await this.display(key, after)),
        );
      }
      if (history.length === 0) return;

      if ('phone' in patch) patch.phone_normalized = normalizePhone(patch.phone);
      patch.last_activity_at = new Date().toISOString();
      patch.version = (row.version ?? 1) + 1;

      const write = () => this.db.table('listings').update(id, patch);
      if (patch.source_url) {
        await withLock(this.redis, `listing-url:${patch.source_url}`, async () => {
          const dup = await this.db
            .table('listings')
            .findOne(
              w.and(w.eq('source_url', patch.source_url!), w.blank('deleted_at'), w.neq('Id', id)),
            );
          if (dup) throw new ConflictException('Объявление с такой ссылкой уже есть в CRM');
          await write();
        });
      } else {
        await write();
      }
      await this.comments.systemMany({ type: 'listing', id }, actor.id, history);
    });
  }

  /** Ручной комментарий или отметка о звонке; считается активностью по карточке. */
  async addComment(actor: Actor, id: number, input: NewComment): Promise<void> {
    await this.loadForActor(actor, id);
    await this.comments.add({ type: 'listing', id }, actor.id, input.kind, input.body);
    await this.db.table('listings').update(id, { last_activity_at: new Date().toISOString() });
  }

  /**
   * Удаление карточки: мягкое (deleted_at), история и фото сохраняются для аудита.
   * Право — у Владельца и сотрудников с «Удалением карточек» (В-2).
   */
  async remove(actor: Actor, id: number): Promise<void> {
    if (!can.deleteCards(actor)) throw new ForbiddenException('Нет права на удаление карточек');
    await withLock(this.redis, `listing:${id}`, async () => {
      const row = await this.loadForActor(actor, id);
      await this.db.table('listings').update(id, {
        deleted_at: new Date().toISOString(),
        deleted_by_id: actor.id,
        version: (row.version ?? 1) + 1,
      });
      await this.comments.system({ type: 'listing', id }, actor.id, 'Карточка удалена');
      await this.audit.record({
        type: 'listing.deleted',
        userId: actor.id,
        entityType: 'listing',
        entityId: id,
        payload: { title: row.title },
      });
    });
  }

  private async loadForActor(actor: Actor, id: number): Promise<ListingRow> {
    const row = await this.db.table('listings').get(id);
    if (!row || row.deleted_at) throw new NotFoundException('Объявление не найдено');
    const newStage = await this.stages.byCode('listings', 'new');
    if (isListingVisible(actor, row, newStage.id)) return row;
    // Карточку из пула уже забрал другой партнёр — сообщаем об этом, а не «не найдено».
    if (actor.role === 'partner' && row.claimed_at !== null && row.responsible_id !== actor.id) {
      throw new ConflictException({
        code: 'ALREADY_CLAIMED',
        message: 'Эту карточку уже взял в работу другой партнёр',
      });
    }
    throw new NotFoundException('Объявление не найдено');
  }

  private assertCanEdit(actor: Actor, keys: PatchField[]): void {
    if (actor.role === 'partner') {
      const allowed = PARTNER_EDITABLE_LISTING_FIELDS as readonly string[];
      const denied = keys.filter((k) => !allowed.includes(k));
      if (denied.length > 0) {
        throw new ForbiddenException(
          `Партнёр не может менять: ${denied.map((k) => LISTING_FIELD_LABELS[k] ?? k).join(', ')}`,
        );
      }
    }
    // Партнёра-источника назначает вручную только Владелец (БТ-8.2.1).
    if (keys.includes('partnerSourceId') && actor.role !== 'owner') {
      throw new ForbiddenException('Партнёра-источника назначает Владелец');
    }
  }

  private async validateReferences(fields: Omit<ListingPatch, 'version'>, row: ListingRow) {
    const meetingStage = await this.stages.byCode('listings', 'meeting');
    if (fields.meetingAt === null && row.stage_id === meetingStage.id) {
      throw new BadRequestException('На этапе «Назначена встреча» дата встречи обязательна');
    }
    for (const [key, kind] of [
      ['districtId', 'district'],
      ['propertyTypeId', 'property_type'],
    ] as const) {
      const value = fields[key];
      if (value == null) continue;
      const item = await this.db.table('dictionary_items').get(value);
      if (!item || item.kind !== kind) {
        throw new BadRequestException(`${LISTING_FIELD_LABELS[key]}: значение не найдено`);
      }
    }
    for (const key of ['responsibleId', 'partnerSourceId'] as const) {
      const value = fields[key];
      if (value == null) continue;
      const user = await this.db.table('users').get(value);
      if (!user || user.status !== 'active') {
        throw new BadRequestException(`${LISTING_FIELD_LABELS[key]}: пользователь не найден`);
      }
      if (key === 'partnerSourceId' && user.role !== 'partner') {
        throw new BadRequestException('Партнёром-источником может быть только партнёр');
      }
    }
  }

  private fieldEntry(field: string, oldValue: string | null, newValue: string | null) {
    const label = LISTING_FIELD_LABELS[field] ?? field;
    return {
      body: `${label}: ${oldValue ?? '—'} → ${newValue ?? '—'}`,
      change: { field, oldValue, newValue },
    };
  }

  /** Человекочитаемое значение для истории: названия вместо ID, даты по Еревану. */
  private async display(field: PatchField, value: unknown): Promise<string | null> {
    if (value === null || value === undefined || value === '') return null;
    switch (field) {
      case 'districtId':
      case 'propertyTypeId':
        return (await this.db.table('dictionary_items').get(Number(value)))?.name ?? String(value);
      case 'responsibleId':
      case 'partnerSourceId':
        return (await this.db.table('users').get(Number(value)))?.display_name ?? String(value);
      case 'meetingAt':
        return formatMoment(String(value));
      case 'commissionPercent':
        return `${String(value)}%`;
      default:
        return String(value);
    }
  }
}

function assertVersion(row: ListingRow, version: number): void {
  if ((row.version ?? 1) !== version) {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Карточку уже изменил другой пользователь — обновите и повторите',
    });
  }
}

function equal(field: PatchField, before: unknown, after: unknown): boolean {
  if (before === null || before === undefined) return after === null;
  if (after === null) return false;
  if (field === 'meetingAt') return sameInstant(String(before), String(after));
  if (typeof after === 'number') return Number(before) === after;
  return before === after;
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return toDate(a).getTime() === toDate(b).getTime();
}

/** NocoDB отдаёт «2026-10-01 10:00:00+00:00» — приводим к формату, понятному Date. */
function toDate(value: string): Date {
  return new Date(value.replace(' ', 'T'));
}

function formatMoment(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Yerevan',
  }).format(toDate(value));
}
