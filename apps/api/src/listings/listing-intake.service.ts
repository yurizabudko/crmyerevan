import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import { normalizePhone, type Actor, type ListingDraft } from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { CommentsService } from './comments.service.js';
import { StagesService } from './stages.service.js';

/**
 * Откуда пришло объявление (поле «Источник», п. 3.2).
 * Сейчас используется только 'manual'; 'parser' зарезервирован для автоимпорта.
 */
export type IntakeSource = 'manual' | 'parser';

export interface IntakeResult {
  id: number;
  created: boolean;
}

/**
 * Единая точка создания карточек объявлений — и для ручного ввода, и для автоимпорта.
 * Здесь живут общие правила: дедупликация по URL (решение В-4), этап «Новое объявление»,
 * атрибуция партнёра (БТ-8.2.1), системная запись и аудит.
 */
@Injectable()
export class ListingIntakeService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Ручное добавление из формы (п. 3.2, «Ручной ввод»). */
  async createManual(actor: Actor, draft: ListingDraft): Promise<IntakeResult> {
    const result = await this.intake(draft, 'manual', actor);
    if (!result.created) {
      throw new ConflictException({
        code: 'DUPLICATE_LISTING',
        message: 'Объявление с такой ссылкой уже есть в CRM',
        // Партнёру не раскрываем карточку, которая ему может быть не видна.
        existingId: actor.role === 'partner' ? undefined : result.id,
      });
    }
    return result;
  }

  // TODO(auto-import): точка входа для автоматического сбора объявлений с list.am.
  // Когда будет выбран источник (parse.bot, официальный API list.am или расширение браузера),
  // его адаптер (см. listing-source.ts) должен приводить объявление к ListingDraft
  // и вызывать intake(draft, 'parser', null). Дубли по URL уже отсекаются здесь.
  // Что ещё понадобится для автоимпорта:
  //   - загрузка и обрезка фото на 5% сверху (БТ-3.2.3) → таблица listing_photos;
  //   - поле external_id (ID объявления на list.am);
  //   - поведение при дубле: сейчас просто пропуск (created: false);
  //   - запись статистики запуска в parser_runs и алерт Владельцу в Telegram (БТ-3.2.6).
  async intake(
    draft: ListingDraft,
    source: IntakeSource,
    actor: Actor | null,
  ): Promise<IntakeResult> {
    const create = () => this.insert(draft, source, actor);
    if (!draft.sourceUrl) return create();

    const url = draft.sourceUrl;
    return withLock(this.redis, `listing-url:${url}`, async () => {
      const existing = await this.db
        .table('listings')
        .findOne(w.and(w.eq('source_url', url), w.blank('deleted_at')));
      if (existing) return { id: existing.Id, created: false };
      return create();
    });
  }

  private async insert(
    draft: ListingDraft,
    source: IntakeSource,
    actor: Actor | null,
  ): Promise<IntakeResult> {
    const newStage = await this.stages.byCode('listings', 'new');
    const now = new Date().toISOString();
    const isPartner = actor?.role === 'partner';

    const id = await this.db.table('listings').create({
      title: draft.title,
      description: draft.description ?? null,
      price: draft.price ?? null,
      currency: draft.currency,
      district_id: draft.districtId ?? null,
      property_type_id: draft.propertyTypeId ?? null,
      rooms: draft.rooms ?? null,
      floor: draft.floor ?? null,
      floors_total: draft.floorsTotal ?? null,
      area: draft.area ?? null,
      address: draft.address ?? null,
      owner_name: draft.ownerName ?? null,
      phone: draft.phone ?? null,
      phone_normalized: normalizePhone(draft.phone),
      contacts_extra: draft.contactsExtra ?? null,
      source,
      source_url: draft.sourceUrl ?? null,
      stage_id: newStage.id,
      created_by_id: actor?.id ?? null,
      // Карточка партнёра сразу закреплена за ним и атрибутирована ему (БТ-8.2.1, В-5).
      // Карточки сотрудников и автоимпорта попадают в общий пул «Новое объявление».
      responsible_id: isPartner ? actor.id : null,
      partner_source_id: isPartner ? actor.id : null,
      claimed_at: isPartner ? now : null,
      last_activity_at: now,
      version: 1,
    });

    const how = source === 'manual' ? 'вручную' : 'автоимпортом';
    await this.comments.system(
      { type: 'listing', id },
      actor?.id ?? null,
      `Карточка создана ${how}`,
    );
    await this.audit.record({
      type: 'listing.created',
      userId: actor?.id ?? null,
      entityType: 'listing',
      entityId: id,
      payload: { source },
    });
    return { id, created: true };
  }
}
