/** Party play N0 (MULTIPLAYER.md §1.5): the mode-flip fuzz records and replays identically in Node. */
import { describe, expect, it } from 'vitest';
import { fuzzPartyMatch, fuzzSeed } from '../../tools/lib/fuzz-entry';

describe('party mode-flip fuzz (Node)', { timeout: 600_000 }, () => {
  it('10 seeds: pilot <-> human flips at random turns replay to the same trail', () => {
    for (let i = 0; i < 10; i++) {
      const r = fuzzPartyMatch(fuzzSeed(i));
      expect(r.ok).toBe(true);
      expect(r.flips).toBeGreaterThan(0);
    }
  });
});
