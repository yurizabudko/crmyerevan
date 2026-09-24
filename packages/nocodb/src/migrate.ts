import { type MetaApi, type MetaTable, type NewColumn } from './meta.js';
import { schema, type TableName } from './schema.js';

export interface MigrationReport {
  baseId: string;
  createdBase: boolean;
  createdTables: string[];
  addedColumns: string[];
}

export class SchemaMismatchError extends Error {}

/**
 * Приводит базу NocoDB к схеме из кода: создаёт недостающую базу, таблицы и колонки.
 * Идемпотентна. Несовпадение типа существующей колонки — ошибка: такие изменения
 * делаются отдельной ручной миграцией, чтобы не потерять данные.
 */
export async function migrateSchema(meta: MetaApi, baseTitle: string): Promise<MigrationReport> {
  const report: MigrationReport = {
    baseId: '',
    createdBase: false,
    createdTables: [],
    addedColumns: [],
  };

  let base = (await meta.listBases()).find((b) => b.title === baseTitle);
  if (!base) {
    base = await meta.createBase(baseTitle);
    report.createdBase = true;
  }
  report.baseId = base.id;

  const existing = new Map((await meta.listTables(base.id)).map((t) => [t.title, t]));

  for (const tableName of Object.keys(schema) as TableName[]) {
    const wanted = desiredColumns(tableName);
    const table = existing.get(tableName);
    if (!table) {
      await meta.createTable(base.id, tableName, wanted);
      report.createdTables.push(tableName);
      continue;
    }
    for (const column of await missingColumns(meta, table, wanted, tableName)) {
      await meta.addColumn(table.id, column);
      report.addedColumns.push(`${tableName}.${column.column_name}`);
    }
  }

  return report;
}

function desiredColumns(tableName: TableName): NewColumn[] {
  return Object.entries(schema[tableName]).map(([name, spec]) => ({
    column_name: name,
    title: name,
    uidt: spec.uidt,
  }));
}

async function missingColumns(
  meta: MetaApi,
  table: MetaTable,
  wanted: NewColumn[],
  tableName: string,
): Promise<NewColumn[]> {
  const full = await meta.getTable(table.id);
  const actual = new Map((full.columns ?? []).map((col) => [col.title, col]));
  const missing: NewColumn[] = [];
  for (const column of wanted) {
    const current = actual.get(column.title);
    if (!current) {
      missing.push(column);
    } else if (current.uidt !== column.uidt) {
      throw new SchemaMismatchError(
        `${tableName}.${column.title}: в NocoDB тип ${current.uidt}, в схеме ${column.uidt}`,
      );
    }
  }
  return missing;
}
