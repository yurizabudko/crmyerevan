import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { w, type NocoDb, type Row, type WithId } from '@crm/nocodb';
import {
  ACCESS_STATUSES,
  GRACE_DAYS,
  NOTIFY_BEFORE_DAYS,
  PERIOD_DAYS,
  RETRY_DAYS,
  SUBSCRIPTION_CURRENCY,
  SUBSCRIPTION_PRICE,
  TRIAL_DAYS,
  type Actor,
  type PaymentDto,
  type SubscriptionDto,
  type SubscriptionStatus,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { toDate } from '../common/card-utils.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { CommentsService } from '../listings/comments.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PAYMENT_PROVIDER, type MockScenario, type PaymentProvider } from './payment-provider.js';

type SubRow = WithId<Row<'subscriptions'>>;

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'Asia/Yerevan' }).format(d);

/**
 * Подписка партнёра (8.1, 8.3): триал с привязкой карты, рекуррентные списания,
 * повторы на 1-й, 3-й и 7-й день, заморозка с возвратом карточек в пул, отмена автопродления.
 * Время передаётся явно (`now`), чтобы планировщик и тесты работали с одинаковой логикой.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ---------- Состояние ----------

  async statusOf(partnerId: number): Promise<SubscriptionStatus> {
    return ((await this.find(partnerId))?.status as SubscriptionStatus | undefined) ?? 'none';
  }

  /** Может ли партнёр работать в CRM (иначе — только страница оплаты, БТ-8.3.5). */
  async hasAccess(partnerId: number): Promise<boolean> {
    return ACCESS_STATUSES.includes(await this.statusOf(partnerId));
  }

  async get(partnerId: number): Promise<SubscriptionDto> {
    const [sub, card, user] = await Promise.all([
      this.find(partnerId),
      this.activeCard(partnerId),
      this.db.table('users').get(partnerId),
    ]);
    return {
      status: (sub?.status as SubscriptionStatus | undefined) ?? 'none',
      autoRenew: Boolean(sub?.auto_renew),
      periodEnd: sub?.period_end ?? null,
      nextChargeAt: sub?.auto_renew ? (sub.next_charge_at ?? null) : null,
      graceUntil: sub?.grace_until ?? null,
      retryAt: sub?.retry_at ?? null,
      failedAttempts: sub?.failed_attempts ?? 0,
      price: SUBSCRIPTION_PRICE,
      currency: SUBSCRIPTION_CURRENCY,
      card: card ? { mask: card.card_mask ?? '' } : null,
      telegramLinked: Boolean(user?.telegram_chat_id),
      provider: this.provider.name,
    };
  }

  async payments(partnerId: number): Promise<PaymentDto[]> {
    const rows = await this.db
      .table('payments')
      .listAll({ where: w.eq('partner_id', partnerId), sort: ['-at', '-Id'] });
    return rows.map((p) => ({
      id: p.Id,
      at: p.at,
      amount: p.amount ?? 0,
      currency: p.currency ?? SUBSCRIPTION_CURRENCY,
      status: (p.status ?? 'pending') as PaymentDto['status'],
      error: p.error,
    }));
  }

  // ---------- Действия партнёра ----------

  /** Триал 30 дней; привязка карты обязательна (БТ-8.3.2). */
  async startTrial(
    actor: Actor,
    scenario: MockScenario,
    now = new Date(),
  ): Promise<SubscriptionDto> {
    this.assertPartner(actor);
    await withLock(this.redis, `subscription:${actor.id}`, async () => {
      if (await this.find(actor.id)) throw new BadRequestException('Подписка уже оформлена');
      await this.bindCard(actor.id, scenario);
      const end = addDays(now, TRIAL_DAYS);
      await this.db.table('subscriptions').create({
        partner_id: actor.id,
        status: 'trial',
        auto_renew: true,
        period_start: iso(now),
        period_end: iso(end),
        next_charge_at: iso(end),
        failed_attempts: 0,
        version: 1,
      });
      await this.audit.record({ type: 'subscription.trial_started', userId: actor.id });
      await this.notifications.notify(
        actor.id,
        `Бесплатный период начат. Первое списание ${SUBSCRIPTION_PRICE} ₽ — ${fmtDate(end)}.`,
      );
    });
    return this.get(actor.id);
  }

  async replaceCard(actor: Actor, scenario: MockScenario): Promise<SubscriptionDto> {
    this.assertPartner(actor);
    await withLock(this.redis, `subscription:${actor.id}`, () => this.bindCard(actor.id, scenario));
    return this.get(actor.id);
  }

  /** Отмена/возобновление автопродления в один клик (БТ-8.3.6). */
  async setAutoRenew(actor: Actor, enabled: boolean): Promise<SubscriptionDto> {
    this.assertPartner(actor);
    await withLock(this.redis, `subscription:${actor.id}`, async () => {
      const sub = await this.find(actor.id);
      if (!sub || !['trial', 'active', 'grace'].includes(sub.status ?? '')) {
        throw new BadRequestException('Нет действующей подписки');
      }
      await this.db.table('subscriptions').update(sub.Id, {
        auto_renew: enabled,
        canceled_at: enabled ? null : new Date().toISOString(),
      });
      await this.audit.record({
        type: enabled ? 'subscription.resumed' : 'subscription.canceled',
        userId: actor.id,
      });
    });
    return this.get(actor.id);
  }

  /** Ручная оплата: погасить долг в grace или разморозить подписку. */
  async payNow(actor: Actor, now = new Date()): Promise<SubscriptionDto> {
    this.assertPartner(actor);
    const result = await withLock(this.redis, `subscription:${actor.id}`, async () => {
      const sub = await this.find(actor.id);
      if (!sub || !['grace', 'frozen', 'canceled'].includes(sub.status ?? '')) {
        throw new BadRequestException('Оплата сейчас не требуется');
      }
      const key = `manual:${sub.Id}:${now.getTime()}`;
      const ok = await this.charge(sub, key, (sub.failed_attempts ?? 0) + 1, now);
      if (ok) await this.activate(sub, now, now);
      return ok;
    });
    if (!result)
      throw new BadRequestException('Платёж не прошёл — проверьте карту или привяжите другую');
    return this.get(actor.id);
  }

  // ---------- Планировщик ----------

  /** Один проход планировщика: предупреждения, списания, повторы, заморозки. */
  async tick(now = new Date()): Promise<void> {
    const subs = await this.db
      .table('subscriptions')
      .listAll({ where: w.in('status', ['trial', 'active', 'grace']) });
    for (const sub of subs) {
      try {
        await withLock(this.redis, `subscription:${sub.partner_id}`, async () => {
          const fresh = await this.db.table('subscriptions').get(sub.Id);
          if (fresh) await this.process(fresh, now);
        });
      } catch (error) {
        this.logger.error(`Подписка ${sub.Id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async process(sub: SubRow, now: Date): Promise<void> {
    const due = sub.next_charge_at ? toDate(sub.next_charge_at) : null;
    const partnerId = sub.partner_id!;

    if (sub.status === 'grace') {
      const retryAt = sub.retry_at ? toDate(sub.retry_at) : null;
      if (!retryAt || retryAt > now || !due) return;
      const attempt = (sub.failed_attempts ?? 1) + 1;
      if (
        await this.charge(sub, `charge:${sub.Id}:${sub.next_charge_at}:${attempt}`, attempt, now)
      ) {
        await this.activate(sub, due, now);
        return;
      }
      const retriesDone = attempt - 1;
      if (retriesDone >= RETRY_DAYS.length) {
        await this.freeze(sub, now);
      } else {
        await this.db.table('subscriptions').update(sub.Id, {
          failed_attempts: attempt,
          retry_at: iso(addDays(due, RETRY_DAYS[retriesDone]!)),
        });
      }
      return;
    }

    if (!due) return;
    // Предупреждение за 3 дня до конца триала и до каждого списания (БТ-8.3.3).
    if (sub.auto_renew && due.getTime() - now.getTime() <= NOTIFY_BEFORE_DAYS * DAY && due > now) {
      const text =
        sub.status === 'trial'
          ? `Бесплатный период заканчивается ${fmtDate(due)}. Затем спишется ${SUBSCRIPTION_PRICE} ₽.`
          : `${fmtDate(due)} спишется ${SUBSCRIPTION_PRICE} ₽ за подписку CRM.`;
      await this.notifications.notify(partnerId, text, `precharge:${sub.Id}:${sub.next_charge_at}`);
    }
    if (due > now) return;

    if (!sub.auto_renew) {
      // Автопродление отменено: период закончился — доступ закрывается, как при заморозке.
      await this.db.table('subscriptions').update(sub.Id, { status: 'canceled' });
      await this.releaseCards(partnerId, 'подписка отменена');
      await this.notifications.notify(
        partnerId,
        'Подписка закончилась. Возобновить её можно в личном кабинете CRM.',
      );
      return;
    }

    if (await this.charge(sub, `charge:${sub.Id}:${sub.next_charge_at}:1`, 1, now)) {
      await this.activate(sub, due, now);
      return;
    }
    // Первая неудача: grace на 7 дней с доступом, повтор через день (БТ-8.3.4).
    await this.db.table('subscriptions').update(sub.Id, {
      status: 'grace',
      failed_attempts: 1,
      grace_until: iso(addDays(due, GRACE_DAYS)),
      retry_at: iso(addDays(due, RETRY_DAYS[0])),
    });
  }

  /**
   * Списание с записью платежа. Ключ идемпотентности: если попытка уже была
   * (повтор задачи, перезапуск), деньги второй раз не списываются.
   */
  private async charge(sub: SubRow, key: string, attempt: number, now: Date): Promise<boolean> {
    const previous = await this.db.table('payments').findOne(w.eq('idempotency_key', key));
    if (previous) return previous.status === 'succeeded';

    const partnerId = sub.partner_id!;
    const card = await this.activeCard(partnerId);
    const result = card?.provider_token
      ? await this.provider.charge({
          token: card.provider_token,
          amount: SUBSCRIPTION_PRICE,
          currency: SUBSCRIPTION_CURRENCY,
          idempotencyKey: key,
          description: 'Подписка партнёра CRM, 30 дней',
        })
      : ({ ok: false, error: 'Карта не привязана' } as const);

    await this.db.table('payments').create({
      subscription_id: sub.Id,
      partner_id: partnerId,
      amount: SUBSCRIPTION_PRICE,
      currency: SUBSCRIPTION_CURRENCY,
      status: result.ok ? 'succeeded' : 'failed',
      provider: this.provider.name,
      provider_payment_id: result.ok ? result.providerPaymentId : null,
      attempt,
      error: result.ok ? null : result.error,
      at: iso(now),
      idempotency_key: key,
    });
    await this.audit.record({
      type: result.ok ? 'subscription.charged' : 'subscription.charge_failed',
      userId: partnerId,
      entityType: 'subscription',
      entityId: sub.Id,
      payload: { attempt, ...(result.ok ? {} : { error: result.error }) },
    });
    if (!result.ok) {
      await this.notifications.notify(
        partnerId,
        `Не удалось списать ${SUBSCRIPTION_PRICE} ₽ за подписку (попытка ${attempt}): ${result.error}. ` +
          'Проверьте карту в личном кабинете.',
        `charge-failed:${key}`,
      );
    }
    return result.ok;
  }

  /** Успешная оплата: новый период; если был заморожен — разморозка и отложенные вознаграждения. */
  private async activate(sub: SubRow, periodStart: Date, _now: Date): Promise<void> {
    const end = addDays(periodStart, PERIOD_DAYS);
    const wasFrozen = sub.status === 'frozen' || sub.status === 'canceled';
    await this.db.table('subscriptions').update(sub.Id, {
      status: 'active',
      auto_renew: true,
      period_start: iso(periodStart),
      period_end: iso(end),
      next_charge_at: iso(end),
      failed_attempts: 0,
      grace_until: null,
      retry_at: null,
      frozen_at: null,
      canceled_at: null,
    });
    if (wasFrozen) {
      // Д-11: вознаграждения по сделкам периода заморозки начисляются после разморозки.
      const held = await this.db
        .table('partner_rewards')
        .listAll({ where: w.and(w.eq('partner_id', sub.partner_id!), w.eq('status', 'on_hold')) });
      await this.db
        .table('partner_rewards')
        .updateMany(held.map((r) => ({ Id: r.Id, status: 'accrued' })));
      await this.audit.record({
        type: 'subscription.unfrozen',
        userId: sub.partner_id,
        entityType: 'subscription',
        entityId: sub.Id,
        payload: { releasedRewards: held.length },
      });
    }
    await this.notifications.notify(
      sub.partner_id!,
      `Оплата ${SUBSCRIPTION_PRICE} ₽ прошла. Подписка активна до ${fmtDate(end)}.`,
    );
  }

  /** Заморозка после grace (БТ-8.3.5): доступ только к оплате, назначенные карточки — в пул. */
  private async freeze(sub: SubRow, now: Date): Promise<void> {
    await this.db.table('subscriptions').update(sub.Id, {
      status: 'frozen',
      frozen_at: iso(now),
      retry_at: null,
      failed_attempts: RETRY_DAYS.length + 1,
    });
    const released = await this.releaseCards(sub.partner_id!, 'подписка заморожена');
    await this.audit.record({
      type: 'subscription.frozen',
      userId: sub.partner_id,
      entityType: 'subscription',
      entityId: sub.Id,
      payload: released,
    });
    await this.notifications.notify(
      sub.partner_id!,
      'Подписка заморожена: оплата не прошла за 7 дней. Карточки возвращены в общий пул. ' +
        'Оплатите подписку в личном кабинете, чтобы продолжить работу.',
    );
  }

  /** Снять партнёра ответственным со всех карточек. Атрибуция «партнёр-источник» сохраняется. */
  private async releaseCards(partnerId: number, reason: string) {
    const listings = await this.db.table('listings').listAll({
      where: w.and(w.eq('responsible_id', partnerId), w.blank('deleted_at')),
      fields: ['Id', 'version'],
    });
    const clients = await this.db.table('clients').listAll({
      where: w.and(w.eq('responsible_id', partnerId), w.blank('deleted_at')),
      fields: ['Id', 'version'],
    });
    const now = new Date().toISOString();
    for (const [table, rows, type] of [
      ['listings', listings, 'listing'],
      ['clients', clients, 'client'],
    ] as const) {
      if (rows.length === 0) continue;
      await this.db.table(table).updateMany(
        rows.map((r) => ({
          Id: r.Id,
          responsible_id: null,
          version: (r.version ?? 1) + 1,
          last_activity_at: now,
        })),
      );
      for (const r of rows) {
        await this.comments.system(
          { type, id: r.Id },
          null,
          `Ответственный снят: ${reason}. Карточка возвращена в общий пул.`,
          { field: 'responsibleId', oldValue: partnerId, newValue: null },
        );
      }
    }
    return { listings: listings.length, clients: clients.length };
  }

  // ---------- Вспомогательное ----------

  private async bindCard(partnerId: number, scenario: MockScenario): Promise<void> {
    const card = await this.provider.bindCard({ partnerId, scenario });
    const old = await this.db.table('payment_methods').listAll({
      where: w.and(w.eq('partner_id', partnerId), w.eq('is_active', true)),
      fields: ['Id'],
    });
    await this.db
      .table('payment_methods')
      .updateMany(old.map((m) => ({ Id: m.Id, is_active: false })));
    await this.db.table('payment_methods').create({
      partner_id: partnerId,
      provider: this.provider.name,
      provider_token: card.token,
      card_mask: card.mask,
      is_active: true,
    });
  }

  private find(partnerId: number) {
    return this.db.table('subscriptions').findOne(w.eq('partner_id', partnerId));
  }

  private activeCard(partnerId: number) {
    return this.db
      .table('payment_methods')
      .findOne(w.and(w.eq('partner_id', partnerId), w.eq('is_active', true)));
  }

  private assertPartner(actor: Actor): void {
    if (actor.role !== 'partner')
      throw new ForbiddenException('Подписка оформляется только партнёрам');
  }
}
