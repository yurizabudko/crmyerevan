import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { w, type Condition, type NocoDb } from '@crm/nocodb';
import {
  NOTIFY_BEFORE_DAYS,
  SUBSCRIPTION_PRICE,
  can,
  type Actor,
  type PartnerDealDto,
  type PartnerOverviewDto,
  type PartnersQuery,
  type PayoutInput,
  type RewardDto,
  type RewardsQuery,
  type SubscriptionStatus,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { toDate } from '../common/card-utils.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { toCsv } from '../table/csv.js';

const DAY = 86_400_000;
const REWARD_STATUS = {
  accrued: 'начислено',
  paid: 'выплачено',
  on_hold: 'ожидает разморозки',
} as const;

/** Партнёрская программа со стороны Владельца (8.2.5, 8.5) и «Мои сделки» партнёра (8.4). */
@Injectable()
export class PartnersService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** Сделки с атрибуцией партнёра: финальная цена видна, комиссия агентства — нет (Д-12). */
  async myDeals(actor: Actor): Promise<PartnerDealDto[]> {
    const rewards = await this.rewards({ partnerId: actor.id });
    const deals = await this.dealsById(rewards.map((r) => r.dealId));
    return rewards.map((r) => ({
      dealId: r.dealId ?? 0,
      closedAt: r.closedAt,
      listingTitle: r.listingTitle,
      clientName: r.clientName,
      finalPrice: r.dealId ? (deals.get(r.dealId)?.final_price ?? null) : null,
      currency: r.dealId ? (deals.get(r.dealId)?.currency ?? null) : null,
      basis: r.basis,
      reward: r.amount,
      rewardStatus: r.status,
      paidAt: r.paidAt,
    }));
  }

  async overview(actor: Actor, q: PartnersQuery, now = new Date()): Promise<PartnerOverviewDto> {
    this.assertOwner(actor);
    const [partners, subs, rewards, payments, listings, clients, deals] = await Promise.all([
      this.db.table('users').listAll({ where: w.eq('role', 'partner'), sort: ['display_name'] }),
      this.db.table('subscriptions').listAll(),
      this.db.table('partner_rewards').listAll(),
      this.db.table('payments').listAll({ sort: ['-at'] }),
      this.db
        .table('listings')
        .listAll({ where: this.inPeriod('CreatedAt', q), fields: ['created_by_id'] }),
      this.db
        .table('clients')
        .listAll({ where: this.inPeriod('CreatedAt', q), fields: ['created_by_id'] }),
      this.db.table('deals').listAll({ where: this.inPeriod('closed_at', q), fields: ['Id'] }),
    ]);
    const periodDeals = new Set(deals.map((d) => d.Id));
    const subOf = (id: number) => subs.find((s) => s.partner_id === id);
    const statusOf = (id: number) => (subOf(id)?.status ?? 'none') as SubscriptionStatus;
    const sum = (list: { amount: number | null }[]) =>
      Math.round(list.reduce((s, r) => s + (r.amount ?? 0), 0) * 100) / 100;

    const rows = partners
      .filter((p) => !q.subscription || statusOf(p.Id) === q.subscription)
      .map((p) => {
        const mine = rewards.filter(
          (r) => r.partner_id === p.Id && r.deal_id !== null && periodDeals.has(r.deal_id),
        );
        const cardsCreated =
          listings.filter((l) => l.created_by_id === p.Id).length +
          clients.filter((c) => c.created_by_id === p.Id).length;
        const dealsClosed = new Set(mine.map((r) => r.deal_id)).size;
        const sub = subOf(p.Id);
        return {
          partnerId: p.Id,
          name: p.display_name ?? p.login ?? '',
          userStatus: p.status ?? 'active',
          subscription: statusOf(p.Id),
          nextChargeAt: sub?.auto_renew ? (sub.next_charge_at ?? null) : null,
          cardsCreated,
          dealsClosed,
          conversion: cardsCreated ? Math.round((dealsClosed / cardsCreated) * 1000) / 10 : null,
          accrued: sum(mine.filter((r) => r.status === 'accrued')),
          paid: sum(mine.filter((r) => r.status === 'paid')),
          onHold: sum(mine.filter((r) => r.status === 'on_hold')),
          ltv: sum(payments.filter((x) => x.partner_id === p.Id && x.status === 'succeeded')),
        };
      });

    const name = (id: number | null) => partners.find((p) => p.Id === id)?.display_name ?? `#${id}`;
    const horizon = now.getTime() + NOTIFY_BEFORE_DAYS * DAY;
    const upcoming = subs
      .filter(
        (s) => ['trial', 'active'].includes(s.status ?? '') && s.auto_renew && s.next_charge_at,
      )
      .filter((s) => {
        const t = toDate(s.next_charge_at!).getTime();
        return t >= now.getTime() && t <= horizon;
      })
      .map((s) => ({
        partnerId: s.partner_id!,
        name: name(s.partner_id),
        at: s.next_charge_at!,
        amount: SUBSCRIPTION_PRICE,
      }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const problems = subs
      .filter((s) => s.status === 'grace' || s.status === 'frozen')
      .map((s) => {
        const lastFail = payments.find((x) => x.subscription_id === s.Id && x.status === 'failed');
        return {
          partnerId: s.partner_id!,
          name: name(s.partner_id),
          status: s.status as SubscriptionStatus,
          at: lastFail?.at ?? null,
          error: lastFail?.error ?? null,
          graceUntil: s.grace_until,
        };
      });
    return { partners: rows, upcoming, problems };
  }

  async rewards(q: RewardsQuery): Promise<RewardDto[]> {
    const conditions: Condition[] = [w.notBlank('partner_id')];
    if (q.status) conditions.push(w.eq('status', q.status));
    if (q.partnerId) conditions.push(w.eq('partner_id', q.partnerId));
    const rows = await this.db
      .table('partner_rewards')
      .listAll({ where: w.and(...conditions), sort: ['-Id'] });
    const deals = await this.dealsById(rows.map((r) => r.deal_id));
    const [listings, clients, users] = await Promise.all([
      this.byIds(
        'listings',
        [...deals.values()].map((d) => d.listing_id),
      ),
      this.byIds(
        'clients',
        [...deals.values()].map((d) => d.client_id),
      ),
      this.db.table('users').listAll({ fields: ['Id', 'display_name'] }),
    ]);
    const from = q.from ? new Date(q.from).getTime() : null;
    const to = q.to ? new Date(q.to).getTime() : null;
    return rows
      .map((r) => {
        const deal = r.deal_id ? deals.get(r.deal_id) : undefined;
        return {
          id: r.Id,
          partnerId: r.partner_id!,
          partnerName: users.find((u) => u.Id === r.partner_id)?.display_name ?? '',
          dealId: r.deal_id,
          closedAt: deal?.closed_at ?? null,
          listingTitle: listings.get(deal?.listing_id ?? -1)?.title ?? null,
          clientName: clients.get(deal?.client_id ?? -1)?.name ?? null,
          basis: r.basis,
          amount: r.amount ?? 0,
          currency: deal?.currency ?? null,
          status: (r.status ?? 'accrued') as RewardDto['status'],
          paidAt: r.paid_at,
          paidMethod: r.paid_method,
        };
      })
      .filter((r) => {
        if (from === null && to === null) return true;
        const t = r.closedAt ? toDate(r.closedAt).getTime() : null;
        return t !== null && (from === null || t >= from) && (to === null || t < to);
      });
  }

  async ownerRewards(actor: Actor, q: RewardsQuery): Promise<RewardDto[]> {
    this.assertOwner(actor);
    return this.rewards(q);
  }

  /** Выплата подтверждается Владельцем вручную, с датой и способом (БТ-8.2.5). */
  async confirmPayout(actor: Actor, id: number, input: PayoutInput): Promise<RewardDto> {
    if (!can.confirmPayout(actor)) throw new ForbiddenException('Выплату подтверждает Владелец');
    await withLock(this.redis, `reward:${id}`, async () => {
      const reward = await this.db.table('partner_rewards').get(id);
      if (!reward) throw new NotFoundException('Вознаграждение не найдено');
      if (reward.status !== 'accrued') {
        throw new BadRequestException(
          reward.status === 'paid'
            ? 'Уже выплачено'
            : 'Партнёр заморожен — выплата после разморозки',
        );
      }
      const paidAt = input.paidAt ? new Date(`${input.paidAt}T12:00:00+04:00`) : new Date();
      await this.db.table('partner_rewards').update(id, {
        status: 'paid',
        paid_at: paidAt.toISOString(),
        paid_method: input.method,
        paid_by_id: actor.id,
      });
      await this.audit.record({
        type: 'reward.paid',
        userId: actor.id,
        entityType: 'partner_reward',
        entityId: id,
        payload: { partnerId: reward.partner_id, amount: reward.amount, method: input.method },
      });
      const currency = reward.deal_id
        ? (await this.db.table('deals').get(reward.deal_id))?.currency
        : null;
      await this.notifications.notify(
        reward.partner_id!,
        `Выплачено вознаграждение ${reward.amount}${currency ? ` ${currency}` : ''} по сделке №${reward.deal_id} (${input.method}).`,
        `reward-paid:${id}`,
      );
    });
    return (await this.rewards({})).find((r) => r.id === id)!;
  }

  /** Реестр выплат для бухгалтерии (8.5, п. 5). */
  async payoutRegistryCsv(actor: Actor, q: RewardsQuery): Promise<string> {
    this.assertOwner(actor);
    const rows = await this.rewards(q);
    await this.audit.record({
      type: 'export.csv',
      userId: actor.id,
      entityType: 'partner_rewards',
      payload: { rows: rows.length },
    });
    return toCsv(
      [
        'Партнёр',
        'Сделка',
        'Дата сделки',
        'Объект',
        'Клиент',
        'Основание',
        'Сумма',
        'Валюта',
        'Статус',
        'Дата выплаты',
        'Способ',
      ],
      rows.map((r) => [
        r.partnerName,
        r.dealId,
        r.closedAt?.slice(0, 10),
        r.listingTitle,
        r.clientName,
        r.basis,
        r.amount,
        r.currency,
        REWARD_STATUS[r.status],
        r.paidAt?.slice(0, 10),
        r.paidMethod,
      ]),
    );
  }

  private inPeriod(field: string, q: { from?: string; to?: string }): Condition {
    const conditions: Condition[] = [w.notBlank('Id')];
    if (q.from) conditions.push(w.onOrAfter(field, new Date(q.from)));
    if (q.to) conditions.push(w.before(field, new Date(q.to)));
    return w.and(...conditions);
  }

  private async dealsById(ids: (number | null)[]) {
    const unique = [...new Set(ids.filter((id): id is number => id !== null))];
    const rows = unique.length
      ? await this.db.table('deals').listAll({ where: w.in('Id', unique) })
      : [];
    return new Map(rows.map((d) => [d.Id, d]));
  }

  private async byIds<T extends 'listings' | 'clients'>(table: T, ids: (number | null)[]) {
    const unique = [...new Set(ids.filter((id): id is number => id !== null))];
    const rows = unique.length
      ? await this.db.table(table).listAll({ where: w.in('Id', unique) })
      : [];
    return new Map(rows.map((r) => [r.Id, r]));
  }

  private assertOwner(actor: Actor): void {
    if (!can.viewTeamDashboard(actor)) throw new ForbiddenException('Недостаточно прав');
  }
}
