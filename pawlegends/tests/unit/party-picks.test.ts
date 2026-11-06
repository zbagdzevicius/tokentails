/** Party play N0 (MULTIPLAYER.md §1.5): fillPicksParty with one seat is fillPicks, for 1,000 seeds. */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { TRICK_IDS } from '../../src/data/tricks';
import { fillPicks } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';

describe('party-picks', () => {
  it('fillPicksParty(seed, [h0]) deep-equals fillPicks for 1,000 seeds', () => {
    for (let i = 0; i < 1000; i++) {
      const seed = Math.imul(i + 1, 0x9e3779b1) >>> 0;
      const hero = HERO_IDS[i % HERO_IDS.length];
      const trick = TRICK_IDS[i % TRICK_IDS.length];
      expect(fillPicksParty(seed, [{ slot: 0, hero, trick }])).toEqual(fillPicks(seed, hero, trick));
    }
  });
  it('human seats overwrite their slots; bot slots stay as fillPicks drew them', () => {
    const base = fillPicks(77, 'clem', 'pounce');
    const p = fillPicksParty(77, [
      { slot: 0, hero: 'clem', trick: 'pounce' },
      { slot: 2, hero: 'gabe', trick: 'hiss' },
    ]);
    expect(p.picks[2]).toBe('gabe');
    expect(p.tricks[2]).toBe('hiss');
    for (const s of [0, 1, 3, 4, 5]) {
      expect(p.picks[s]).toBe(base.picks[s]);
      expect(p.tricks[s]).toBe(base.tricks[s]);
    }
  });
});
