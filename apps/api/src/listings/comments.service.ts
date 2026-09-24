import { Inject, Injectable } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import { can, type Actor, type CommentDto, type CommentKind } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';

export type CardType = 'listing' | 'client';
export type CardComment = CommentDto;

/** Комментарии карточек: ручные и системные (БТ-3.4.1, БТ-3.4.2). */
@Injectable()
export class CommentsService {
  constructor(@Inject(NOCODB) private readonly db: NocoDb) {}

  /** Системная запись. Изменить или удалить её через API нельзя. */
  async system(
    card: { type: CardType; id: number },
    authorId: number | null,
    body: string,
    change?: { field: string; oldValue: unknown; newValue: unknown },
  ): Promise<void> {
    await this.db.table('comments').create({
      entity_type: card.type,
      entity_id: card.id,
      kind: 'system',
      author_id: authorId,
      body,
      field: change?.field ?? null,
      old_value: change ? stringify(change.oldValue) : null,
      new_value: change ? stringify(change.newValue) : null,
    });
  }

  async list(card: { type: CardType; id: number }, viewer: Actor): Promise<CardComment[]> {
    const conditions = [w.eq('entity_type', card.type), w.eq('entity_id', card.id)];
    // Системные записи не видны партнёру.
    if (!can.viewSystemComments(viewer)) conditions.push(w.neq('kind', 'system'));
    const rows = await this.db
      .table('comments')
      .listAll({ where: w.and(...conditions), sort: ['-CreatedAt', '-Id'] });
    return rows.map((r) => ({
      id: r.Id,
      kind: (r.kind ?? 'manual') as CommentKind,
      authorId: r.author_id,
      body: r.body,
      field: r.field,
      oldValue: r.old_value,
      newValue: r.new_value,
      createdAt: r.CreatedAt,
    }));
  }
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
