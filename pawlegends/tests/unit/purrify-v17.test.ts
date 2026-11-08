/**
 * Sim v17 (docs/plans/moba/V17.md §3.3): Purr-ify answers big ults. Its immunity is 30 ticks, so a cast 8 ticks
 * (a 250 ms read) into an ult's windup outlasts the windup; Pixel's and Chili's R give 21.
 */
import { describe, expect, it } from 'vitest';
import { TRICKS } from '../../src/data/tricks';
import { HERO_IDS } from '../../src/data/heroes';
import type { HeroId } from '../../src/sim/api';
import { kitNumbers } from '../../src/sim/heroes/talents';
import { charm, stun } from '../../src/sim/effects';
import { MID, cast, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';

const VIC = 0;
const ULT = 3;

/** Clem (0, Purr-ify) and friends vs `hero` (3); the victim stands `d` mm from the caster. */
function duel(hero: HeroId, d: number) {
  const m = heroMatch(['clem', 'sage', 'clem', hero, 'sage', 'clem'], ['purrify', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
  place(m, VIC, MID.x, MID.y, 0);
  place(m, ULT, MID.x + d, MID.y, 2048);
  setLevel(m, ULT, 10);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, VIC);
  return m;
}

const lockedOrPulled = (m: ReturnType<typeof duel>): boolean => {
  const w = m.world;
  return w.stunT[VIC] > 0 || w.rootT[VIC] > 0 || w.fearT[VIC] > 0 || w.fmKind[VIC] !== 0;
};

describe('sim v17 Purr-ify vs big ults (§3.3)', () => {
  it('data: Purr-ify 30 ticks immune (cooldown 2400), Pixel R and Chili R 21', () => {
    expect(TRICKS.purrify).toEqual({ cooldown: 2400, immune: 30 });
    expect(kitNumbers(HERO_IDS.indexOf('pixel'), 10).r.immune).toBe(21);
    expect(kitNumbers(HERO_IDS.indexOf('chili'), 10).r.immune).toBe(21);
  });

  for (const [hero, d, aimAtVictim] of [
    ['lambo', 3000, false],
    ['gabe', 3000, true],
    ['bravo', 3000, false],
    ['domino', 6000, true],
  ] as const) {
    it(`a Purr-ify cast 8 ticks into ${hero} R's windup blocks its CC`, () => {
      const m = duel(hero, d);
      const w = m.world;
      // Domino R roots Spotted heroes: give the victim a Spot.
      w.dotN[VIC] = 1;
      w.dotT[VIC] = 300;
      cast(m, ULT, 3, aimAtVictim ? w.x[VIC] : w.x[ULT], w.y[VIC]);
      expect(w.castPhase[ULT]).toBe(2);
      steps(m, 7);
      cast(m, VIC, 4, w.x[VIC], w.y[VIC]);
      expect(w.ccImmT[VIC]).toBeGreaterThan(0);
      let hit = false;
      for (let t = 0; t < 30; t++) {
        steps(m, 1);
        if (lockedOrPulled(m)) hit = true;
      }
      expect(w.castPhase[ULT]).toBe(0);
      expect(hit).toBe(false);
      // Control: without the Purr-ify the same ult lands.
      const c = duel(hero, d);
      c.world.dotN[VIC] = 1;
      c.world.dotT[VIC] = 300;
      cast(c, ULT, 3, aimAtVictim ? c.world.x[VIC] : c.world.x[ULT], c.world.y[VIC]);
      let landed = false;
      for (let t = 0; t < 38; t++) {
        steps(c, 1);
        if (lockedOrPulled(c)) landed = true;
      }
      expect(landed).toBe(true);
    });
  }

  it('Purr-ify cast 1 tick after the CC landed still cleanses', () => {
    const m = duel('gabe', 3000);
    const w = m.world;
    charm(w, VIC, 30, ULT);
    stun(w, VIC, 10);
    steps(m, 1);
    cast(m, VIC, 4, w.x[VIC], w.y[VIC]);
    expect([w.stunT[VIC], w.fearT[VIC]]).toEqual([0, 0]);
  });
});
