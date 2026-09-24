import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { w, type Condition, type NocoDb } from '@crm/nocodb';
import {
  OVERDUE_AFTER_HOURS,
  OVERDUE_CLIENT_STAGES,
  can,
  type Actor,
  type DashboardDto,
  type DashboardQuery,
  type OverdueClient,
  type TeamRow,
} from '@crm/shared';
import { toDate } from '../common/card-utils.js';
import { NOCODB } from '../infra/infra.module.js';
import { StagesService } from '../listings/stages.service.js';
import { conversions, countByStage, inScope, sumByCurrency, type Scope } from './metrics.js';

const OVERDUE_TOP = 10;

interface PeriodData {
  listingsCreated: { source: string | null; created_by_id: number | null }[];
  deals: {
    Id: number;
    closed_by_id: number | null;
    commission_fact: number | null;
    currency: string | null;
  }[];
  comments: { kind: string | null; field: string | null; author_id: number | null }[];
  callMoves: { user_id: number | null }[];
}

/**
 * Дашборд (раздел 6): свои данные за период; Владельцу — вся команда и срез по сотрудникам.
 * Все показатели считаются по данным NocoDB на лету; объёмы агентства это позволяют.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(StagesService) private readonly stages: StagesService,
  ) {}

  async get(actor: Actor, q: DashboardQuery): Promise<DashboardDto> {
    const scope = this.resolveScope(actor, q.scope);
    const from = new Date(q.from);
    const to = new Date(q.to);
    const [listingStages, clientStages, period, listings, clients, transitions, users] =
      await Promise.all([
        this.stages.list('listings'),
        this.stages.list('clients'),
        this.period(from, to),
        this.db.table('listings').listAll({
          where: w.blank('deleted_at'),
          fields: ['stage_id', 'responsible_id', 'created_by_id'],
        }),
        this.db.table('clients').listAll({
          where: w.blank('deleted_at'),
          fields: ['Id', 'name', 'stage_id', 'responsible_id', 'last_activity_at', 'CreatedAt'],
        }),
        this.db.table('stage_transitions').listAll({
          where: w.eq('pipeline', 'clients'),
          fields: ['entity_id', 'to_stage_id', 'at'],
        }),
        this.db.table('users').listAll({ fields: ['Id', 'display_name'] }),
      ]);

    // «Свои» объявления: где пользователь ответственный, плюс созданные им и ещё не взятые из пула.
    const myListings = listings.filter(
      (l) =>
        inScope(scope, l.responsible_id) ||
        (l.responsible_id === null && inScope(scope, l.created_by_id)),
    );
    const myClients = clients.filter((c) => inScope(scope, c.responsible_id));
    const created = period.listingsCreated.filter((l) => inScope(scope, l.created_by_id));

    // Партнёр видит сделки со своей атрибуцией и своё вознаграждение, но не комиссию (БТ-6.3).
    let deals: DashboardDto['deals'];
    if (actor.role === 'partner') {
      const rewards = await this.db
        .table('partner_rewards')
        .listAll({ where: w.eq('partner_id', actor.id), fields: ['deal_id', 'amount', 'status'] });
      const periodDealIds = new Set(period.deals.map((d) => d.Id));
      const mine = rewards.filter((r) => r.deal_id !== null && periodDealIds.has(r.deal_id));
      const sum = (status: string) =>
        mine.filter((r) => r.status === status).reduce((s, r) => s + (r.amount ?? 0), 0);
      deals = {
        closed: mine.length,
        commission: null,
        reward: { accrued: sum('accrued') + sum('paid'), paid: sum('paid') },
      };
    } else {
      const closed = period.deals.filter((d) => inScope(scope, d.closed_by_id));
      deals = {
        closed: closed.length,
        commission: sumByCurrency(
          closed.map((d) => ({ amount: d.commission_fact, currency: d.currency })),
        ),
        reward: null,
      };
    }

    const names = new Map(users.map((u) => [u.Id, u.display_name]));
    const now = Date.now();
    const overdueIds = new Set(
      clientStages
        .filter((s) => (OVERDUE_CLIENT_STAGES as readonly string[]).includes(s.code))
        .map((s) => s.id),
    );
    const overdue: OverdueClient[] = myClients
      .map((c) => ({
        c,
        idle: (now - toDate(c.last_activity_at ?? c.CreatedAt).getTime()) / 3_600_000,
      }))
      .filter(
        ({ c, idle }) =>
          c.stage_id !== null && overdueIds.has(c.stage_id) && idle > OVERDUE_AFTER_HOURS,
      )
      .sort((a, b) => b.idle - a.idle)
      .slice(0, OVERDUE_TOP)
      .map(({ c, idle }) => ({
        id: c.Id,
        name: c.name ?? '',
        stageName: clientStages.find((s) => s.id === c.stage_id)?.name ?? '',
        idleHours: Math.floor(idle),
        responsibleName: c.responsible_id === null ? null : (names.get(c.responsible_id) ?? null),
      }));

    const comments = period.comments.filter((c) => inScope(scope, c.author_id));
    return {
      listings: {
        added: {
          total: created.length,
          parser: created.filter((l) => l.source === 'parser').length,
          manual: created.filter((l) => l.source !== 'parser').length,
        },
        byStage: countByStage(listingStages, myListings),
      },
      clients: { byStage: countByStage(clientStages, myClients) },
      conversions: conversions(
        clientStages,
        transitions,
        from,
        to,
        scope === null ? null : new Set(myClients.map((c) => c.Id)),
      ),
      deals,
      activity: {
        calls:
          comments.filter((c) => c.kind === 'call').length +
          period.callMoves.filter((m) => inScope(scope, m.user_id)).length,
        comments: comments.filter((c) => c.kind === 'manual').length,
        changes: comments.filter((c) => c.kind === 'system' && c.field !== null).length,
      },
      overdue,
    };
  }

  /** Срез по сотрудникам (6.2): те же показатели по каждому пользователю. */
  async team(actor: Actor, q: DashboardQuery): Promise<TeamRow[]> {
    if (!can.viewTeamDashboard(actor)) throw new ForbiddenException('Недостаточно прав');
    const from = new Date(q.from);
    const to = new Date(q.to);
    const [period, users, clients, clientStages] = await Promise.all([
      this.period(from, to),
      this.db.table('users').listAll({
        where: w.eq('status', 'active'),
        fields: ['Id', 'display_name', 'role'],
        sort: ['display_name'],
      }),
      this.db.table('clients').listAll({
        where: w.blank('deleted_at'),
        fields: ['stage_id', 'responsible_id', 'last_activity_at', 'CreatedAt'],
      }),
      this.stages.list('clients'),
    ]);
    const overdueIds = new Set(
      clientStages
        .filter((s) => (OVERDUE_CLIENT_STAGES as readonly string[]).includes(s.code))
        .map((s) => s.id),
    );
    const now = Date.now();
    return users.map((u) => {
      const mine = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
        rows.filter((r) => r[key] === u.Id);
      const deals = mine(period.deals, 'closed_by_id');
      const comments = mine(period.comments, 'author_id');
      return {
        userId: u.Id,
        name: u.display_name ?? '',
        role: u.role ?? '',
        listingsAdded: mine(period.listingsCreated, 'created_by_id').length,
        dealsClosed: deals.length,
        commission: sumByCurrency(
          deals.map((d) => ({ amount: d.commission_fact, currency: d.currency })),
        ),
        calls:
          comments.filter((c) => c.kind === 'call').length +
          mine(period.callMoves, 'user_id').length,
        comments: comments.filter((c) => c.kind === 'manual').length,
        changes: comments.filter((c) => c.kind === 'system' && c.field !== null).length,
        overdue: clients.filter(
          (c) =>
            c.responsible_id === u.Id &&
            c.stage_id !== null &&
            overdueIds.has(c.stage_id) &&
            (now - toDate(c.last_activity_at ?? c.CreatedAt).getTime()) / 3_600_000 >
              OVERDUE_AFTER_HOURS,
        ).length,
      };
    });
  }

  private resolveScope(actor: Actor, scope: DashboardQuery['scope']): Scope {
    if (scope === 'me') return new Set([actor.id]);
    if (!can.viewTeamDashboard(actor)) throw new ForbiddenException('Недостаточно прав');
    return scope === 'team' ? null : new Set([scope]);
  }

  /** Данные, привязанные ко времени события, — только за период. */
  private async period(from: Date, to: Date): Promise<PeriodData> {
    const range = (field: string): Condition[] => [w.onOrAfter(field, from), w.before(field, to)];
    const [listingStages, clientStages] = await Promise.all([
      this.stages.list('listings'),
      this.stages.list('clients'),
    ]);
    const callStageIds = [...listingStages, ...clientStages]
      .filter((s) => s.code === 'call')
      .map((s) => s.id);
    const [listingsCreated, deals, comments, callMoves] = await Promise.all([
      this.db.table('listings').listAll({
        where: w.and(...range('CreatedAt')),
        fields: ['source', 'created_by_id'],
      }),
      this.db.table('deals').listAll({
        where: w.and(...range('closed_at')),
        fields: ['Id', 'closed_by_id', 'commission_fact', 'currency'],
      }),
      this.db.table('comments').listAll({
        where: w.and(...range('CreatedAt')),
        fields: ['kind', 'field', 'author_id'],
      }),
      // «Звонок» в активности — переход в этап «Звонок» и отметка о звонке (решение В-8).
      this.db.table('stage_transitions').listAll({
        where: w.and(...range('at'), w.in('to_stage_id', callStageIds)),
        fields: ['user_id'],
      }),
    ]);
    return { listingsCreated, deals, comments, callMoves };
  }
}
