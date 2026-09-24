import { describe, expect, it } from 'vitest';
import { CLIENT_STAGES, LISTING_STAGES, SYSTEM_STAGES } from './pipelines.js';

describe('SYSTEM_STAGES', () => {
  it('covers every stage code in order', () => {
    expect(SYSTEM_STAGES.listings.map((s) => s.code)).toEqual([...LISTING_STAGES]);
    expect(SYSTEM_STAGES.clients.map((s) => s.code)).toEqual([...CLIENT_STAGES]);
  });
});
