import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import type { Pipeline, StageDto } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';

export type Stage = StageDto;

const CACHE_TTL_MS = 60_000;

/** Этапы воронок. Меняются редко (только Владельцем), поэтому кэшируются в памяти на минуту. */
@Injectable()
export class StagesService {
  private readonly cache = new Map<Pipeline, { at: number; stages: Stage[] }>();

  constructor(@Inject(NOCODB) private readonly db: NocoDb) {}

  async list(pipeline: Pipeline): Promise<Stage[]> {
    const cached = this.cache.get(pipeline);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.stages;
    const rows = await this.db
      .table('pipeline_stages')
      .listAll({ where: w.eq('pipeline', pipeline), sort: ['position'] });
    const stages = rows.map((r) => ({
      id: r.Id,
      code: r.code ?? '',
      name: r.name ?? '',
      position: r.position ?? 0,
      isSystem: Boolean(r.is_system),
      isTerminal: Boolean(r.is_terminal),
    }));
    this.cache.set(pipeline, { at: Date.now(), stages });
    return stages;
  }

  /** Сброс кэша после правок этапов в администрировании. */
  invalidate(): void {
    this.cache.clear();
  }

  async byCode(pipeline: Pipeline, code: string): Promise<Stage> {
    const stage = (await this.list(pipeline)).find((s) => s.code === code);
    if (!stage) {
      throw new InternalServerErrorException(`Нет этапа ${pipeline}/${code} — запустите миграции`);
    }
    return stage;
  }
}
