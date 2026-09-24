import { z } from 'zod';

/** Период и срез дашборда (6.1, 6.2). `to` не включается. */
export const DashboardQuery = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    /** me — свои данные; team — вся команда; число — конкретный сотрудник (только Владелец). */
    scope: z.union([z.enum(['me', 'team']), z.coerce.number().int().positive()]).default('me'),
  })
  .refine((q) => new Date(q.from) < new Date(q.to), { message: 'Начало периода позже конца' });
export type DashboardQuery = z.infer<typeof DashboardQuery>;

export interface StageCount {
  stageId: number;
  name: string;
  count: number;
}

export interface Conversion {
  key: 'contact_qualified' | 'qualified_showing' | 'showing_deal';
  label: string;
  /** Сколько клиентов дошли до второго этапа из тех, кто вошёл в первый за период. */
  converted: number;
  total: number;
}

export interface MoneyByCurrency {
  currency: string;
  amount: number;
}

export interface OverdueClient {
  id: number;
  name: string;
  stageName: string;
  idleHours: number;
  responsibleName: string | null;
}

export interface DashboardDto {
  listings: {
    added: { total: number; parser: number; manual: number };
    byStage: StageCount[];
  };
  clients: { byStage: StageCount[] };
  conversions: Conversion[];
  deals: {
    closed: number;
    /** Комиссия агентства (факт) — не отдаётся партнёру (БТ-6.3). */
    commission: MoneyByCurrency[] | null;
    /** Вознаграждение партнёра по сделкам периода — только для партнёра. */
    reward: { accrued: number; paid: number } | null;
  };
  activity: { calls: number; comments: number; changes: number };
  overdue: OverdueClient[];
}

/** Строка среза по сотрудникам (6.2). */
export interface TeamRow {
  userId: number;
  name: string;
  role: string;
  listingsAdded: number;
  dealsClosed: number;
  commission: MoneyByCurrency[];
  calls: number;
  comments: number;
  changes: number;
  overdue: number;
}
