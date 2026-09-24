import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NocoDb } from './client.js';
import { Http } from './http.js';
import { MetaApi, issueApiToken } from './meta.js';
import { migrateSchema } from './migrate.js';
import { schema, type TableName } from './schema.js';
import { seed } from './seed.js';
import { w } from './where.js';

/**
 * Требует запущенный NocoDB (`pnpm infra:up`). Работает в отдельной базе,
 * чтобы не трогать данные разработчика.
 */
const baseUrl = process.env.NOCODB_URL ?? 'http://localhost:8080';
const baseTitle = `crm_test_${Date.now()}`;

let apiToken: string;
let db: NocoDb;

beforeAll(async () => {
  apiToken =
    process.env.NOCODB_API_TOKEN ||
    (await issueApiToken(
      baseUrl,
      process.env.NC_ADMIN_EMAIL ?? 'admin@crm.local',
      process.env.NC_ADMIN_PASSWORD ?? 'ChangeMe123!',
      'crm-integration-tests',
    ));
  await migrateSchema(new MetaApi(new Http({ baseUrl, auth: { apiToken } })), baseTitle);
  db = await NocoDb.connect({ baseUrl, apiToken, baseTitle });
});

afterAll(async () => {
  if (db) await db.meta.deleteBase(db.baseId);
});

describe('schema migration', () => {
  it('is idempotent', async () => {
    const meta = new MetaApi(new Http({ baseUrl, auth: { apiToken } }));
    const again = await migrateSchema(meta, baseTitle);
    expect(again.createdBase).toBe(false);
    expect(again.createdTables).toEqual([]);
    expect(again.addedColumns).toEqual([]);
  });

  it('creates every table from the schema', async () => {
    const tables = await db.meta.listTables(db.baseId);
    expect(tables.map((t) => t.title).sort()).toEqual((Object.keys(schema) as TableName[]).sort());
  });
});

describe('seed', () => {
  it('creates system stages once', async () => {
    const first = await seed(db);
    const second = await seed(db);
    expect(first.stages).toBe(13);
    expect(second).toEqual({ stages: 0, dictionaryItems: 0, settings: [] });
    const stages = await db
      .table('pipeline_stages')
      .listAll({ where: w.eq('pipeline', 'listings'), sort: ['position'] });
    expect(stages.map((s) => s.code)).toEqual(['new', 'call', 'available', 'meeting', 'closed']);
  });
});

describe('records', () => {
  it('round-trips typed rows and filters', async () => {
    const listings = db.table('listings');
    const url = 'https://www.list.am/item/123, test (a)';
    const id = await listings.create({
      title: '2 комн., Кентрон',
      price: 95000.5,
      source: 'parser',
      source_url: url,
      meeting_at: '2026-09-24 10:00:00+00:00',
      version: 1,
    });

    const found = await listings.findOne(w.eq('source_url', url));
    expect(found?.Id).toBe(id);
    expect(found?.price).toBe(95000.5);

    await listings.update(id, { version: 2, title: 'Обновлено' });
    const updated = await listings.get(id);
    expect(updated?.title).toBe('Обновлено');
    expect(updated?.version).toBe(2);

    expect(
      await listings.count(
        w.and(w.eq('source', 'parser'), w.after('meeting_at', new Date('2026-09-24T09:00:00Z'))),
      ),
    ).toBe(1);
    expect(await listings.count(w.blank('responsible_id'))).toBe(1);

    // Две группы подряд NocoDB сам не разбирает — построитель это обходит.
    const either = (f: string) => w.or(w.blank(f), w.gte(f, 0));
    expect(await listings.count(w.and(either('price'), either('rooms')))).toBe(1);
    expect(
      await listings.count(w.or(w.and(w.eq('Id', id), either('price')), either('rooms'))),
    ).toBe(1);

    await listings.delete([id]);
    expect(await listings.get(id)).toBeNull();
  });
});
