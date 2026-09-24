import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_PARSER_SETTINGS, w, type Condition, type NocoDb } from '@crm/nocodb';
import {
  ParserSettings,
  can,
  type Actor,
  type AdminDictionaryItemDto,
  type AuditEventDto,
  type AuditQuery,
  type DictionaryItemCreate,
  type DictionaryItemUpdate,
  type DictionaryOrder,
  type ParserRunDto,
  type StageCreate,
  type StageDto,
  type StageOrder,
  type TablePage,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { StagesService } from '../listings/stages.service.js';

/** Администрирование (раздел 7): этапы, справочники, парсер, журнал аудита. */
@Injectable()
export class AdminService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ---------- Этапы воронок (7.2) ----------

  async addStage(actor: Actor, input: StageCreate): Promise<StageDto[]> {
    this.assert(can.manageDictionaries(actor));
    await withLock(this.redis, `stages:${input.pipeline}`, async () => {
      const current = await this.stages.list(input.pipeline);
      if (current.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) {
        throw new ConflictException('Этап с таким названием уже есть');
      }
      // Новый этап — перед терминальными, чтобы «Закрыт»/«Отказ» оставались в конце.
      const firstTerminal = current.find((s) => s.isTerminal);
      const position = firstTerminal
        ? firstTerminal.position - 1
        : Math.max(0, ...current.map((s) => s.position)) + 10;
      await this.db.table('pipeline_stages').create({
        pipeline: input.pipeline,
        // У пользовательских этапов код не системный — правил переходов у них нет (В-7).
        code: `custom_${Date.now().toString(36)}`,
        name: input.name,
        position,
        is_system: false,
        is_terminal: false,
      });
      await this.renumber(input.pipeline);
    });
    await this.log(actor, 'stage.changed', { action: 'add', ...input });
    return this.stages.list(input.pipeline);
  }

  async renameStage(actor: Actor, id: number, name: string): Promise<StageDto> {
    this.assert(can.manageDictionaries(actor));
    const stage = await this.db.table('pipeline_stages').get(id);
    if (!stage) throw new NotFoundException('Этап не найден');
    await this.db.table('pipeline_stages').update(id, { name });
    this.stages.invalidate();
    await this.log(actor, 'stage.changed', { action: 'rename', id, from: stage.name, to: name });
    const pipeline = stage.pipeline as StageCreate['pipeline'];
    return (await this.stages.list(pipeline)).find((s) => s.id === id)!;
  }

  async reorderStages(actor: Actor, input: StageOrder): Promise<StageDto[]> {
    this.assert(can.manageDictionaries(actor));
    const current = await this.stages.list(input.pipeline);
    const same =
      current.length === input.ids.length && current.every((s) => input.ids.includes(s.id));
    if (!same) throw new BadRequestException('Передайте все этапы воронки ровно по одному разу');
    await this.db
      .table('pipeline_stages')
      .updateMany(input.ids.map((id, i) => ({ Id: id, position: (i + 1) * 10 })));
    this.stages.invalidate();
    await this.log(actor, 'stage.changed', { action: 'reorder', ...input });
    return this.stages.list(input.pipeline);
  }

  /** Удалить можно только пользовательский этап без карточек (7.2). */
  async deleteStage(actor: Actor, id: number): Promise<void> {
    this.assert(can.manageDictionaries(actor));
    const stage = await this.db.table('pipeline_stages').get(id);
    if (!stage) throw new NotFoundException('Этап не найден');
    if (stage.is_system) throw new BadRequestException('Системный этап удалить нельзя');
    const table = stage.pipeline === 'clients' ? 'clients' : 'listings';
    const cards = await this.db
      .table(table)
      .count(w.and(w.eq('stage_id', id), w.blank('deleted_at')));
    if (cards > 0) {
      throw new ConflictException(
        `На этапе ${cards} карточ${cards === 1 ? 'ка' : 'ек'} — сначала перенесите их`,
      );
    }
    await this.db.table('pipeline_stages').delete([id]);
    this.stages.invalidate();
    await this.log(actor, 'stage.changed', { action: 'delete', id, name: stage.name });
  }

  private async renumber(pipeline: StageCreate['pipeline']): Promise<void> {
    const rows = await this.db
      .table('pipeline_stages')
      .listAll({ where: w.eq('pipeline', pipeline), sort: ['position', 'Id'] });
    await this.db
      .table('pipeline_stages')
      .updateMany(rows.map((r, i) => ({ Id: r.Id, position: (i + 1) * 10 })));
    this.stages.invalidate();
  }

  // ---------- Справочники (7.2) ----------

  async dictionaries(actor: Actor): Promise<AdminDictionaryItemDto[]> {
    this.assert(can.manageDictionaries(actor));
    const rows = await this.db
      .table('dictionary_items')
      .listAll({ sort: ['kind', 'position', 'Id'] });
    return rows.map((r) => ({
      id: r.Id,
      kind: r.kind ?? '',
      code: r.code ?? '',
      name: r.name ?? '',
      position: r.position ?? 0,
      isActive: Boolean(r.is_active),
    }));
  }

  async addDictionaryItem(actor: Actor, input: DictionaryItemCreate): Promise<void> {
    this.assert(can.manageDictionaries(actor));
    await withLock(this.redis, `dict:${input.kind}`, async () => {
      const items = await this.db
        .table('dictionary_items')
        .listAll({ where: w.eq('kind', input.kind) });
      if (items.some((i) => (i.name ?? '').toLowerCase() === input.name.toLowerCase())) {
        throw new ConflictException('Такое значение уже есть');
      }
      await this.db.table('dictionary_items').create({
        kind: input.kind,
        code: `custom_${Date.now().toString(36)}`,
        name: input.name,
        position: (Math.max(0, ...items.map((i) => i.position ?? 0)) || 0) + 10,
        is_active: true,
      });
    });
    await this.log(actor, 'dictionary.changed', { action: 'add', ...input });
  }

  async updateDictionaryItem(actor: Actor, id: number, input: DictionaryItemUpdate): Promise<void> {
    this.assert(can.manageDictionaries(actor));
    const item = await this.db.table('dictionary_items').get(id);
    if (!item) throw new NotFoundException('Значение не найдено');
    await this.db.table('dictionary_items').update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    });
    await this.log(actor, 'dictionary.changed', {
      action: 'update',
      id,
      kind: item.kind,
      from: { name: item.name, isActive: item.is_active },
      to: input,
    });
  }

  async reorderDictionary(actor: Actor, input: DictionaryOrder): Promise<void> {
    this.assert(can.manageDictionaries(actor));
    const items = await this.db
      .table('dictionary_items')
      .listAll({ where: w.eq('kind', input.kind), fields: ['Id'] });
    const same = items.length === input.ids.length && items.every((i) => input.ids.includes(i.Id));
    if (!same)
      throw new BadRequestException('Передайте все значения справочника ровно по одному разу');
    await this.db
      .table('dictionary_items')
      .updateMany(input.ids.map((id, i) => ({ Id: id, position: (i + 1) * 10 })));
    await this.log(actor, 'dictionary.changed', { action: 'reorder', ...input });
  }

  // ---------- Парсер (7.3) ----------

  async parserSettings(actor: Actor): Promise<ParserSettings> {
    this.assert(can.manageParser(actor));
    const row = await this.db.table('settings').findOne(w.eq('key', 'parser'));
    const parsed = ParserSettings.safeParse({ ...DEFAULT_PARSER_SETTINGS, ...(row?.value ?? {}) });
    return parsed.success ? parsed.data : DEFAULT_PARSER_SETTINGS;
  }

  // TODO(auto-import): процесс парсера должен перечитывать эти настройки перед каждым запуском.
  async saveParserSettings(actor: Actor, input: ParserSettings): Promise<ParserSettings> {
    this.assert(can.manageParser(actor));
    const row = await this.db.table('settings').findOne(w.eq('key', 'parser'));
    if (row) await this.db.table('settings').update(row.Id, { value: input });
    else await this.db.table('settings').create({ key: 'parser', value: input });
    await this.log(actor, 'settings.changed', { key: 'parser', value: input });
    return input;
  }

  async parserRuns(actor: Actor): Promise<ParserRunDto[]> {
    this.assert(can.manageParser(actor));
    const page = await this.db
      .table('parser_runs')
      .list({ sort: ['-started_at', '-Id'], limit: 20 });
    return page.list.map((r) => ({
      id: r.Id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      foundNew: r.found_new ?? 0,
      updated: r.updated ?? 0,
      errors: r.errors,
    }));
  }

  // ---------- Журнал аудита (7.4) ----------

  async auditLog(actor: Actor, q: AuditQuery): Promise<TablePage<AuditEventDto>> {
    this.assert(can.viewAudit(actor));
    const conditions: Condition[] = [w.notBlank('event_type')];
    if (q.userId) conditions.push(w.eq('user_id', q.userId));
    if (q.type) conditions.push(w.eq('event_type', q.type));
    if (q.from) conditions.push(w.onOrAfter('at', new Date(q.from)));
    if (q.to) conditions.push(w.before('at', new Date(q.to)));
    const [page, users] = await Promise.all([
      this.db.table('audit_events').list({
        where: w.and(...conditions),
        sort: ['-at', '-Id'],
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      }),
      this.db.table('users').listAll({ fields: ['Id', 'display_name'] }),
    ]);
    const names = new Map(users.map((u) => [u.Id, u.display_name]));
    return {
      rows: page.list.map((e) => ({
        id: e.Id,
        at: e.at,
        type: e.event_type ?? '',
        userId: e.user_id,
        userName: e.user_id === null ? null : (names.get(e.user_id) ?? null),
        entityType: e.entity_type,
        entityId: e.entity_id,
        payload: e.payload,
        ip: e.ip,
      })),
      total: page.pageInfo.totalRows,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private assert(allowed: boolean): void {
    if (!allowed) throw new ForbiddenException('Недостаточно прав');
  }

  private log(
    actor: Actor,
    type: 'stage.changed' | 'dictionary.changed' | 'settings.changed',
    payload: Record<string, unknown>,
  ) {
    return this.audit.record({ type, userId: actor.id, payload });
  }
}
