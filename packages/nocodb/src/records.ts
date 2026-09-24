import { NocoDbError } from './errors.js';
import { type Http } from './http.js';
import type { Condition } from './where.js';

export interface ListParams {
  where?: Condition;
  /** Поля сортировки, `-field` — по убыванию. */
  sort?: string[];
  fields?: string[];
  limit?: number;
  offset?: number;
}

export interface PageInfo {
  totalRows: number;
  page: number;
  pageSize: number;
  isFirstPage: boolean;
  isLastPage: boolean;
}

export interface Page<T> {
  list: T[];
  pageInfo: PageInfo;
}

/** Максимальный размер страницы, который отдаёт NocoDB. */
export const MAX_PAGE_SIZE = 1000;

export type RecordId = number;
export type WithId<T> = T & { Id: RecordId };

/** CRUD по записям одной таблицы через data API NocoDB v2. */
export class TableRecords<T extends object> {
  constructor(
    private readonly http: Http,
    readonly tableId: string,
  ) {}

  async list(params: ListParams = {}): Promise<Page<WithId<T>>> {
    try {
      return await this.http.request('GET', `/api/v2/tables/${this.tableId}/records`, undefined, {
        where: params.where,
        sort: params.sort?.join(','),
        fields: params.fields?.join(','),
        limit: params.limit,
        offset: params.offset,
      });
    } catch (error) {
      // NocoDB отвечает 422 на смещение за концом выборки — для нас это пустая страница.
      if (
        error instanceof NocoDbError &&
        (error.body as { error?: string } | undefined)?.error === 'ERR_INVALID_OFFSET_VALUE'
      ) {
        const totalRows = await this.count(params.where);
        const pageSize = params.limit ?? 25;
        return {
          list: [],
          pageInfo: {
            totalRows,
            page: Math.floor((params.offset ?? 0) / pageSize) + 1,
            pageSize,
            isFirstPage: false,
            isLastPage: true,
          },
        };
      }
      throw error;
    }
  }

  /** Выгружает все подходящие записи постранично. */
  async listAll(params: Omit<ListParams, 'limit' | 'offset'> = {}): Promise<WithId<T>[]> {
    const rows: WithId<T>[] = [];
    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const page = await this.list({ ...params, limit: MAX_PAGE_SIZE, offset });
      rows.push(...page.list);
      if (page.pageInfo.isLastPage || page.list.length === 0) return rows;
    }
  }

  async findOne(where: Condition): Promise<WithId<T> | null> {
    const page = await this.list({ where, limit: 1 });
    return page.list[0] ?? null;
  }

  async get(id: RecordId): Promise<WithId<T> | null> {
    try {
      return await this.http.request('GET', `/api/v2/tables/${this.tableId}/records/${id}`);
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  async count(where?: Condition): Promise<number> {
    const res = await this.http.request<{ count: number }>(
      'GET',
      `/api/v2/tables/${this.tableId}/records/count`,
      undefined,
      { where },
    );
    return res.count;
  }

  async create(row: Partial<T>): Promise<RecordId> {
    const [created] = await this.createMany([row]);
    return created!;
  }

  async createMany(rows: Partial<T>[]): Promise<RecordId[]> {
    if (rows.length === 0) return [];
    const res = await this.http.request<{ Id: RecordId }[]>(
      'POST',
      `/api/v2/tables/${this.tableId}/records`,
      rows,
    );
    return res.map((r) => r.Id);
  }

  async update(id: RecordId, patch: Partial<T>): Promise<void> {
    await this.updateMany([{ ...patch, Id: id }]);
  }

  async updateMany(patches: (Partial<T> & { Id: RecordId })[]): Promise<void> {
    if (patches.length === 0) return;
    await this.http.request('PATCH', `/api/v2/tables/${this.tableId}/records`, patches);
  }

  async delete(ids: RecordId[]): Promise<void> {
    if (ids.length === 0) return;
    await this.http.request(
      'DELETE',
      `/api/v2/tables/${this.tableId}/records`,
      ids.map((Id) => ({ Id })),
    );
  }
}
