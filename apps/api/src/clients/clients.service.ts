import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import {
  OVERDUE_CLIENT_STAGES,
  type Actor,
  type ClientBoardDto,
  type ClientDetailsDto,
  type ClientDto,
} from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';
import { CommentsService } from '../listings/comments.service.js';
import { StagesService } from '../listings/stages.service.js';
import { visibleClients } from './access.js';
import { toClientDto, type ClientRow } from './client.mapper.js';
import { LinksService } from './links.service.js';

/** Чтение воронки клиентов с учётом видимости (2.2): партнёр видит созданных им и назначенных ему. */
@Injectable()
export class ClientsService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(LinksService) private readonly links: LinksService,
  ) {}

  async board(actor: Actor): Promise<ClientBoardDto> {
    const [stages, overdue] = await Promise.all([
      this.stages.list('clients'),
      this.overdueStageIds(),
    ]);
    const rows = await this.db
      .table('clients')
      .listAll({ where: visibleClients(actor), sort: ['-last_activity_at', '-Id'] });
    return { stages, cards: rows.map((r) => toClientDto(r, overdue)) };
  }

  async get(actor: Actor, id: number): Promise<ClientDetailsDto> {
    const row = await this.db
      .table('clients')
      .findOne(w.and(w.eq('Id', id), visibleClients(actor)));
    if (!row) throw new NotFoundException('Клиент не найден');
    const [comments, links, dto] = await Promise.all([
      this.comments.list({ type: 'client', id }, actor),
      this.links.forClient(id),
      this.toDto(row),
    ]);
    return { ...dto, comments, links, linkedListings: links.length };
  }

  async toDto(row: ClientRow): Promise<ClientDto> {
    return toClientDto(row, await this.overdueStageIds());
  }

  private async overdueStageIds(): Promise<Set<number>> {
    const stages = await this.stages.list('clients');
    return new Set(
      stages
        .filter((s) => (OVERDUE_CLIENT_STAGES as readonly string[]).includes(s.code))
        .map((s) => s.id),
    );
  }
}
