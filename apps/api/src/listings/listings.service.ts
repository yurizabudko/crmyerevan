import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { w, type Condition, type NocoDb } from '@crm/nocodb';
import type { Actor, ListingBoardDto, ListingDetailsDto } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';
import { CommentsService } from './comments.service.js';
import { toListingDto } from './listing.mapper.js';
import { StagesService } from './stages.service.js';

export type ListingBoard = ListingBoardDto;
export type ListingDetails = ListingDetailsDto;

@Injectable()
export class ListingsService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  /** Доска воронки. Сортировка по умолчанию — свежие изменения сверху (БТ-3.3.1). */
  async board(actor: Actor): Promise<ListingBoard> {
    const [stages, where] = await Promise.all([
      this.stages.list('listings'),
      this.visibleTo(actor),
    ]);
    const rows = await this.db
      .table('listings')
      .listAll({ where, sort: ['-last_activity_at', '-Id'] });
    return { stages, cards: rows.map(toListingDto) };
  }

  async get(actor: Actor, id: number): Promise<ListingDetails> {
    const row = await this.db
      .table('listings')
      .findOne(w.and(w.eq('Id', id), await this.visibleTo(actor)));
    if (!row) throw new NotFoundException('Объявление не найдено');
    const comments = await this.comments.list({ type: 'listing', id }, actor);
    return { ...toListingDto(row), comments };
  }

  /**
   * Видимость карточек (2.2, В-5): партнёр видит созданные им, назначенные ему и
   * незакреплённые карточки этапа «Новое объявление»; остальные — всё.
   */
  private async visibleTo(actor: Actor): Promise<Condition> {
    const notDeleted = w.blank('deleted_at');
    if (actor.role !== 'partner') return notDeleted;
    const newStage = await this.stages.byCode('listings', 'new');
    return w.and(
      notDeleted,
      w.or(
        w.eq('created_by_id', actor.id),
        w.eq('responsible_id', actor.id),
        w.and(w.eq('stage_id', newStage.id), w.blank('responsible_id')),
      ),
    );
  }
}
