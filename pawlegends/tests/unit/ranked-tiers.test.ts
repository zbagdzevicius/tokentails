/** The game's ranked constants equal the backend's (SOCIAL-RANKED.md §11.1); labels always carry a division or points. */
import { describe, expect, it } from 'vitest';
import * as backend from '../../../backend/src/pawlegends/ranked/tiers';
import { DIVISION_NUMERALS, LEGEND_IDX, PLACEMENTS, RANKED_BOTS, RANKED_POINTS, RANKED_PRIME_TIME, RANKED_TIERS, rankedLabel } from '../../src/meta/ranked';

describe('ranked tiers mirror', () => {
  it('deep-equals backend/src/pawlegends/ranked/tiers.ts', () => {
    expect(RANKED_TIERS).toEqual(backend.RANKED_TIERS);
    expect(RANKED_POINTS).toEqual(backend.RANKED_POINTS);
    expect(PLACEMENTS).toEqual(backend.PLACEMENTS);
    expect(DIVISION_NUMERALS).toEqual(backend.DIVISION_NUMERALS);
    expect(LEGEND_IDX).toBe(backend.LEGEND_IDX);
    // round 4 (SOCIAL-RANKED.md §7.11): the bot rules and Prime Time the game explains are the server's
    expect(RANKED_BOTS).toEqual(backend.RANKED_BOTS);
    expect(RANKED_PRIME_TIME).toEqual(backend.RANKED_PRIME_TIME);
  });

  it('labels never read as a bare card word', () => {
    expect(rankedLabel(0)).toBe('Kitten III');
    expect(rankedLabel(4, 64)).toBe('Tabby II · 64 / 100');
    expect(rankedLabel(12, 240)).toBe('Legend · 240 pts');
    for (let i = 0; i <= 12; i++) expect(rankedLabel(i)).toMatch(/ (III|II|I|· \d+ pts)$/);
  });
});
