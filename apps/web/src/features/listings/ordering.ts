import type { ListingDto } from '@crm/shared';

/** Настройка доски: колонки с ручным порядком и сам порядок (БТ-3.3.2). */
export interface BoardPrefs {
  manual: Record<string, number[]>;
}

export const BOARD_PREFS_KEY = 'listings.board';
export const DEFAULT_BOARD_PREFS: BoardPrefs = { manual: {} };

/**
 * Порядок карточек в колонке. Авто — как пришло с сервера (свежие изменения сверху).
 * Ручной — сохранённый порядок; новые карточки, которых в нём нет, — сверху.
 */
export function orderColumn(cards: ListingDto[], manual: number[] | undefined): ListingDto[] {
  if (!manual) return cards;
  const position = new Map(manual.map((id, i) => [id, i]));
  const fresh = cards.filter((c) => !position.has(c.id));
  const known = cards
    .filter((c) => position.has(c.id))
    .sort((a, b) => position.get(a.id)! - position.get(b.id)!);
  return [...fresh, ...known];
}

/** Перемещение карточки внутри колонки. */
export function moveWithin(ids: number[], activeId: number, overId: number): number[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}
