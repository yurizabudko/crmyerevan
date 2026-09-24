import { Http, type HttpOptions } from './http.js';
import { MetaApi } from './meta.js';
import { TableRecords } from './records.js';
import { schema, type Row, type TableName } from './schema.js';

export interface NocoDbConfig {
  baseUrl: string;
  apiToken: string;
  baseTitle: string;
  retries?: HttpOptions['retries'];
  timeoutMs?: HttpOptions['timeoutMs'];
}

/**
 * Точка доступа к данным CRM. Идентификаторы таблиц NocoDB определяются
 * один раз при `connect()` по названиям из схемы.
 */
export class NocoDb {
  private constructor(
    readonly http: Http,
    readonly meta: MetaApi,
    readonly baseId: string,
    private readonly tables: Map<TableName, TableRecords<object>>,
  ) {}

  static async connect(config: NocoDbConfig): Promise<NocoDb> {
    const http = new Http({
      baseUrl: config.baseUrl,
      auth: { apiToken: config.apiToken },
      retries: config.retries,
      timeoutMs: config.timeoutMs,
    });
    const meta = new MetaApi(http);
    const base = (await meta.listBases()).find((b) => b.title === config.baseTitle);
    if (!base) {
      throw new Error(`База NocoDB "${config.baseTitle}" не найдена — запустите миграции`);
    }
    const byTitle = new Map((await meta.listTables(base.id)).map((t) => [t.title, t.id]));
    const tables = new Map<TableName, TableRecords<object>>();
    for (const name of Object.keys(schema) as TableName[]) {
      const id = byTitle.get(name);
      if (!id) throw new Error(`Таблица "${name}" отсутствует в NocoDB — запустите миграции`);
      tables.set(name, new TableRecords(http, id));
    }
    return new NocoDb(http, meta, base.id, tables);
  }

  table<T extends TableName>(name: T): TableRecords<Row<T>> {
    return this.tables.get(name) as TableRecords<Row<T>>;
  }

  /** Проверка доступности NocoDB для health-check. */
  async ping(): Promise<void> {
    await this.http.request('GET', '/api/v1/health');
  }
}
