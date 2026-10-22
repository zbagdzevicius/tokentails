/** ANIM-SPEC §3 / §12 registry.test: all 8 heroes registered, each loader resolves to the agreed shape, stubs fall back. */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { HERO_ANIM, loadHeroAnim, movesFor, setHeroAnim, skillFxFor } from '../../../src/render/anim/registry';
import { stubMoves } from '../../../src/render/anim/common';

describe('HERO_ANIM registry', () => {
  it('has every HeroId', () => {
    expect(Object.keys(HERO_ANIM).sort()).toEqual([...HERO_IDS].sort());
  });

  it('each loader resolves to MOVES / SKILL_FX for its hero', async () => {
    for (const h of HERO_IDS) {
      const m = (await HERO_ANIM[h].moves()).MOVES;
      const f = (await HERO_ANIM[h].fx()).SKILL_FX;
      expect(m.hero).toBe(h);
      expect(f.hero).toBe(h);
      expect(typeof m.stub).toBe('boolean');
      expect(Object.keys(m.slots).sort()).toEqual(['e', 'q', 'r', 'w']);
      expect(Object.keys(f.owns).sort()).toEqual(['basic', 'e', 'passive', 'q', 'r', 'w']);
      // a filled hero's attack and ability clips carry a contact marker
      if (!m.stub) {
        for (const c of m.basic) expect(c.markers.contact, c.id).toBeTypeOf('number');
        for (const s of Object.values(m.slots)) expect(s.cast.markers.contact, s.cast.id).toBeTypeOf('number');
      }
    }
  });

  it('stubs until loaded; loaded sets after loadHeroAnim; setHeroAnim overrides and falls back', async () => {
    for (const h of HERO_IDS) expect(movesFor(h).hero).toBe(h);
    await loadHeroAnim(HERO_IDS);
    for (const h of HERO_IDS) {
      expect(movesFor(h).hero).toBe(h);
      expect(skillFxFor(h).hero).toBe(h);
    }
    const custom = { ...stubMoves('clem'), stub: false };
    setHeroAnim('clem', custom);
    expect(movesFor('clem')).toBe(custom);
    setHeroAnim('clem', null);
    expect(movesFor('clem').stub).toBe(true);
  });
});
