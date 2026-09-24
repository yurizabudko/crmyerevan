import { describe, expect, it } from 'vitest';
import { moveWithin, orderColumn } from './ordering';

const card = (id: number) => ({ id });

describe('orderColumn', () => {
  it('keeps server order in auto mode', () => {
    expect(orderColumn([card(3), card(1)], undefined).map((c) => c.id)).toEqual([3, 1]);
  });

  it('applies manual order and puts new cards on top', () => {
    const cards = [card(5), card(1), card(2), card(3)];
    expect(orderColumn(cards, [2, 9, 1, 3]).map((c) => c.id)).toEqual([5, 2, 1, 3]);
  });
});

describe('moveWithin', () => {
  it('moves an id to the position of another', () => {
    expect(moveWithin([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveWithin([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveWithin([1, 2], 1, 7)).toEqual([1, 2]);
  });
});
