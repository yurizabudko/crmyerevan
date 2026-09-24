import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { w, type NocoDb, type Row, type WithId } from '@crm/nocodb';
import { PARTNER_REWARD_RATE } from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { CommentsService } from '../listings/comments.service.js';
import { StagesService } from '../listings/stages.service.js';

export const DEAL_CLOSED = 'deal.closed';
const MAX_ATTEMPTS = 10;
const RECONCILE_EVERY_MS = 60_000;

export interface DealClosedPayload {
  clientId: number;
  listingId: number;
  finalPrice: number;
  commissionFact: number;
  currency: string | null;
  actorId: number;
  closedAt: string;
}

type EventRow = WithId<Row<'domain_events'>>;

/**
 * Последствия закрытия сделки (БТ-3.1.2, 4.4.3, 8.2.4): сделка, авто-закрытие объекта,
 * статусы подборки и вознаграждения партнёров.
 *
 * В NocoDB нет транзакций, поэтому это сага: сначала пишется доменное событие, затем шаги.
 * Каждый шаг идемпотентен, упавшее событие дообрабатывает сверка раз в минуту.
 */
@Injectable()
export class DealClosingService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DealClosingService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Записывает событие и сразу пытается его обработать. Ошибка обработки не ломает переход клиента. */
  async dealClosed(payload: DealClosedPayload): Promise<void> {
    const key = `${DEAL_CLOSED}:client:${payload.clientId}:${payload.closedAt}`;
    const id = await this.db.table('domain_events').create({
      type: DEAL_CLOSED,
      idempotency_key: key,
      payload,
      status: 'pending',
      attempts: 0,
    });
    await this.process(id);
  }

  /** Дообработка зависших событий. */
  async reconcile(): Promise<number> {
    const pending = await this.db.table('domain_events').listAll({
      where: w.and(w.eq('status', 'pending'), w.lt('attempts', MAX_ATTEMPTS)),
      fields: ['Id'],
    });
    for (const event of pending) await this.process(event.Id);
    return pending.length;
  }

  async process(eventId: number): Promise<void> {
    try {
      await withLock(
        this.redis,
        `event:${eventId}`,
        async () => {
          const event = await this.db.table('domain_events').get(eventId);
          if (!event || event.status !== 'pending') return;
          try {
            await this.handle(event);
            await this.db.table('domain_events').update(eventId, {
              status: 'done',
              attempts: (event.attempts ?? 0) + 1,
              processed_at: new Date().toISOString(),
              last_error: null,
            });
          } catch (error) {
            const attempts = (event.attempts ?? 0) + 1;
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Событие ${eventId} (${event.type}), попытка ${attempts}: ${message}`,
            );
            await this.db.table('domain_events').update(eventId, {
              status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              attempts,
              last_error: message,
            });
          }
        },
        { waitMs: 0 },
      );
    } catch {
      // Событие обрабатывает другой процесс — сверка вернётся к нему позже.
    }
  }

  private async handle(event: EventRow): Promise<void> {
    if (event.type !== DEAL_CLOSED) throw new Error(`Неизвестное событие ${event.type}`);
    const p = event.payload as DealClosedPayload;
    const key = event.idempotency_key ?? `event:${event.Id}`;

    const client = await this.db.table('clients').get(p.clientId);
    const listing = await this.db.table('listings').get(p.listingId);
    if (!client || !listing) throw new Error('Клиент или объект сделки не найден');

    // 1. Сделка — одна на событие.
    const deal =
      (await this.db.table('deals').findOne(w.eq('idempotency_key', key))) ??
      (await this.db.table('deals').get(
        await this.db.table('deals').create({
          idempotency_key: key,
          client_id: p.clientId,
          listing_id: p.listingId,
          final_price: p.finalPrice,
          commission_fact: p.commissionFact,
          currency: p.currency,
          closed_by_id: p.actorId,
          closed_at: p.closedAt,
        }),
      ));
    if (!deal) throw new Error('Не удалось создать сделку');
    const dealRef = `сделка №${deal.Id}`;

    // 2. Объект закрывается автоматически с исходом «успех» (БТ-3.1.2).
    await this.closeListing(
      p,
      listing.Id,
      `Объект закрыт автоматически: ${dealRef} с клиентом ${client.name ?? ''}`,
    );

    // 3. Подборка: объект сделки — «выбрано», остальные — «отказ клиента» (Д-7).
    const links = await this.db
      .table('client_listing_links')
      .listAll({ where: w.eq('client_id', p.clientId) });
    await this.db.table('client_listing_links').updateMany(
      links
        .map((l) => ({
          Id: l.Id,
          status: l.listing_id === p.listingId ? 'chosen' : 'client_rejected',
          prev: l.status,
        }))
        .filter((l) => l.status !== l.prev)
        .map(({ Id, status }) => ({ Id, status })),
    );

    // 4. Вознаграждения: 10% комиссии каждому партнёру с атрибуцией клиента или объекта (Д-10).
    const partners = new Map<number, string[]>();
    if (client.partner_source_id) partners.set(client.partner_source_id, ['клиент']);
    if (listing.partner_source_id) {
      partners.set(listing.partner_source_id, [
        ...(partners.get(listing.partner_source_id) ?? []),
        'объект',
      ]);
    }
    const amount = Math.round(p.commissionFact * PARTNER_REWARD_RATE * 100) / 100;
    const accrued: string[] = [];
    for (const [partnerId, basis] of partners) {
      const exists = await this.db
        .table('partner_rewards')
        .findOne(w.and(w.eq('deal_id', deal.Id), w.eq('partner_id', partnerId)));
      if (!exists) {
        const rewardId = await this.db.table('partner_rewards').create({
          deal_id: deal.Id,
          partner_id: partnerId,
          basis: basis.join('+'),
          amount,
          status: 'accrued',
        });
        await this.audit.record({
          type: 'reward.accrued',
          userId: p.actorId,
          entityType: 'partner_reward',
          entityId: rewardId,
          payload: { dealId: deal.Id, partnerId, amount },
        });
      }
      const partner = await this.db.table('users').get(partnerId);
      accrued.push(`${partner?.display_name ?? `#${partnerId}`} — ${amount}`);
    }

    // 5. Запись в карточке клиента и аудит — последним шагом.
    const note = [
      `Закрыта ${dealRef}: объект «${listing.title ?? ''}», финальная цена ${p.finalPrice}, комиссия ${p.commissionFact}`,
      accrued.length ? `Начислено партнёрам: ${accrued.join('; ')}` : null,
    ]
      .filter(Boolean)
      .join('. ');
    await this.comments.system({ type: 'client', id: p.clientId }, p.actorId, note);
    await this.audit.record({
      type: 'deal.closed',
      userId: p.actorId,
      entityType: 'deal',
      entityId: deal.Id,
      payload: { clientId: p.clientId, listingId: p.listingId, commission: p.commissionFact },
    });
  }

  private async closeListing(p: DealClosedPayload, listingId: number, note: string): Promise<void> {
    const closed = await this.stages.byCode('listings', 'closed');
    await withLock(this.redis, `listing:${listingId}`, async () => {
      const listing = await this.db.table('listings').get(listingId);
      if (!listing) return;
      if (listing.stage_id === closed.id && listing.close_outcome === 'success') return;
      const now = new Date().toISOString();
      await this.db.table('listings').update(listingId, {
        stage_id: closed.id,
        close_outcome: 'success',
        last_activity_at: now,
        version: (listing.version ?? 1) + 1,
      });
      await this.db.table('stage_transitions').create({
        entity_type: 'listing',
        entity_id: listingId,
        pipeline: 'listings',
        from_stage_id: listing.stage_id,
        to_stage_id: closed.id,
        user_id: p.actorId,
        at: now,
      });
      await this.comments.system({ type: 'listing', id: listingId }, p.actorId, note);
    });
  }
}
