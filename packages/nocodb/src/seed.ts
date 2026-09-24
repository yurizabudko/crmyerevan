import { DICTIONARY_SEED, PIPELINES, SYSTEM_STAGES, type DictionaryKind } from '@crm/shared';
import type { NocoDb } from './client.js';
import { w } from './where.js';

export interface SeedReport {
  stages: number;
  dictionaryItems: number;
  settings: string[];
}

export const DEFAULT_PARSER_SETTINGS = {
  enabled: false,
  intervalMinutes: 5,
  city: 'yerevan',
  category: 'apartments',
  ownerOnly: true,
};

/**
 * Идемпотентно добавляет системные этапы, начальные справочники и настройки.
 * Существующие записи не трогает: названия этапов и справочники мог изменить Владелец.
 */
export async function seed(db: NocoDb): Promise<SeedReport> {
  const report: SeedReport = { stages: 0, dictionaryItems: 0, settings: [] };

  const stages = db.table('pipeline_stages');
  for (const pipeline of PIPELINES) {
    const existing = await stages.listAll({ where: w.eq('pipeline', pipeline) });
    const codes = new Set(existing.map((s) => s.code));
    const toCreate = SYSTEM_STAGES[pipeline]
      .map((stage, index) => ({ stage, index }))
      .filter(({ stage }) => !codes.has(stage.code))
      .map(({ stage, index }) => ({
        pipeline,
        code: stage.code,
        name: stage.name,
        position: (index + 1) * 10,
        is_system: true,
        is_terminal: stage.isTerminal,
      }));
    await stages.createMany(toCreate);
    report.stages += toCreate.length;
  }

  const dict = db.table('dictionary_items');
  for (const kind of Object.keys(DICTIONARY_SEED) as DictionaryKind[]) {
    const existing = await dict.listAll({ where: w.eq('kind', kind) });
    if (existing.length > 0) continue;
    const items = DICTIONARY_SEED[kind].map((item, index) => ({
      kind,
      code: item.code,
      name: item.name,
      position: (index + 1) * 10,
      is_active: true,
    }));
    await dict.createMany(items);
    report.dictionaryItems += items.length;
  }

  const settings = db.table('settings');
  if (!(await settings.findOne(w.eq('key', 'parser')))) {
    await settings.create({ key: 'parser', value: DEFAULT_PARSER_SETTINGS });
    report.settings.push('parser');
  }

  return report;
}
