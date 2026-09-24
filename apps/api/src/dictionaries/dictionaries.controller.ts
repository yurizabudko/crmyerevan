import { Controller, Get, Inject } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import { DICTIONARY_KINDS, type DictionariesDto, type DictionaryKind } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';

export type Dictionaries = DictionariesDto;

/** Активные элементы справочников для форм и фильтров. Редактирование — в разделе 7.2. */
@Controller('dictionaries')
export class DictionariesController {
  constructor(@Inject(NOCODB) private readonly db: NocoDb) {}

  @Get()
  async all(): Promise<Dictionaries> {
    const rows = await this.db
      .table('dictionary_items')
      .listAll({ where: w.eq('is_active', true), sort: ['kind', 'position'] });
    const result = Object.fromEntries(
      DICTIONARY_KINDS.map((k) => [k, []]),
    ) as unknown as Dictionaries;
    for (const row of rows) {
      const kind = row.kind as DictionaryKind;
      result[kind]?.push({ id: row.Id, code: row.code ?? '', name: row.name ?? '' });
    }
    return result;
  }
}
