import { Http } from './http.js';

/** Типы колонок NocoDB (uidt), которые использует схема. */
export type Uidt =
  'SingleLineText' | 'LongText' | 'Number' | 'Decimal' | 'Checkbox' | 'DateTime' | 'JSON';

export interface MetaColumn {
  id: string;
  title: string;
  column_name: string;
  uidt: string;
  system?: boolean | number | null;
  pk?: boolean | number | null;
}

export interface MetaTable {
  id: string;
  title: string;
  table_name: string;
  columns?: MetaColumn[];
}

export interface MetaBase {
  id: string;
  title: string;
}

interface ListResponse<T> {
  list: T[];
}

export interface NewColumn {
  column_name: string;
  title: string;
  uidt: Uidt;
}

/** Обёртка над meta API NocoDB: базы, таблицы, колонки, API-токены. */
export class MetaApi {
  constructor(private readonly http: Http) {}

  async listBases(): Promise<MetaBase[]> {
    return (await this.http.request<ListResponse<MetaBase>>('GET', '/api/v2/meta/bases')).list;
  }

  createBase(title: string): Promise<MetaBase> {
    return this.http.request('POST', '/api/v2/meta/bases', { title });
  }

  async deleteBase(baseId: string): Promise<void> {
    await this.http.request('DELETE', `/api/v2/meta/bases/${baseId}`);
  }

  async listTables(baseId: string): Promise<MetaTable[]> {
    const res = await this.http.request<ListResponse<MetaTable>>(
      'GET',
      `/api/v2/meta/bases/${baseId}/tables`,
    );
    return res.list;
  }

  getTable(tableId: string): Promise<MetaTable> {
    return this.http.request('GET', `/api/v2/meta/tables/${tableId}`);
  }

  createTable(baseId: string, tableName: string, columns: NewColumn[]): Promise<MetaTable> {
    return this.http.request('POST', `/api/v2/meta/bases/${baseId}/tables`, {
      table_name: tableName,
      title: tableName,
      columns,
    });
  }

  async addColumn(tableId: string, column: NewColumn): Promise<void> {
    await this.http.request('POST', `/api/v2/meta/tables/${tableId}/columns`, column);
  }
}

/** Вход администратором NocoDB и выпуск API-токена для приложения. */
export async function issueApiToken(
  baseUrl: string,
  email: string,
  password: string,
  description: string,
): Promise<string> {
  const anon = new Http({ baseUrl });
  const { token: jwt } = await anon.request<{ token: string }>('POST', '/api/v1/auth/user/signin', {
    email,
    password,
  });
  const authed = new Http({ baseUrl, auth: { jwt } });
  const { token } = await authed.request<{ token: string }>('POST', '/api/v1/tokens', {
    description,
  });
  return token;
}
