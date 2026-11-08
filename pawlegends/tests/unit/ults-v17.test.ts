/**
 * Sim v17 big-ult windups (docs/plans/moba/V17.md §3.4): Lambo R and Gabė R 20 ticks, Bravo R and Duchess R 21
 * (Duchess R gives 1 Disdain), Domino R 18 ticks at 9.5 m. Pixel R's 21-tick immunity covers one ult windup.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { NO_TARGET, Op, type HeroId, type SimEvent } from '../../src/sim/api';
import { step, type MatchHandle } from '../../src/sim/index';
import { kitNumbers } from '../../src/sim/heroes/talents';
import { stacksOf } from '../../src/sim/effects';
import { applyOrder } from '../../src/sim/units/hero';
import { MID, cast, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';

const ME = 0;
const FOE = 3;

function duel(hero: HeroId, foe: HeroId = 'clem'): MatchHandle {
  const m = heroMatch([hero, 'sage', 'clem', foe, 'sage', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
  place(m, ME, MID.x, MID.y, 0);
  setLevel(m, ME, 10);
  setLevel(m, FOE, 10);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE);
  return m;
}

const windupTicks = (m: MatchHandle, slot: number, x: number, y: number): number[] => {
  step(m, [{ op: Op.Cast, slot: slot as 0 | 1 | 2 | 3, x, y, id: NO_TARGET }]);
  return m.events.filter((e): e is Extract<SimEvent, { type: 'windup' }> => e.type === 'windup' && e.src === ME).map((e) => e.ticks);
};

describe('sim v17 big-ult windups (§3.4)', () => {
  it('data and windup events: Lambo R 20, Gabė R 20, Bravo R 21, Duchess R 21 (1 stack), Domino R 18 at 9.5 m', () => {
    const r = (h: HeroId) => kitNumbers(HERO_IDS.indexOf(h), 10).r;
    expect(r('lambo').windup).toBe(20);
    expect(r('gabe').windup).toBe(20);
    expect(r('bravo').windup).toBe(21);
    expect([r('duchess').windup, r('duchess').stacks]).toEqual([21, 1]);
    expect([r('domino').windup, r('domino').range]).toEqual([18, 9500]);
    for (const [h, t] of [['lambo', 20], ['gabe', 20], ['bravo', 21], ['duchess', 21], ['domino', 18]] as const) {
      const m = duel(h);
      place(m, FOE, MID.x + 3000, MID.y, 2048);
      if (h === 'domino') m.world.dotN[FOE] = 1;
      expect(windupTicks(m, 3, MID.x + 3000, MID.y), h).toEqual([t]);
    }
  });

  it('Lambo R: a foe 2.2 m inside the ring edge walking straight out escapes; 3.2 m inside it does not', () => {
    const run = (inside: number): boolean => {
      const m = duel('lambo');
      const w = m.world;
      const R = kitNumbers(HERO_IDS.indexOf('lambo'), 10).r.radius;
      place(m, FOE, MID.x + R - inside, MID.y, 0);
      cast(m, ME, 3, MID.x, MID.y);
      let rooted = false;
      for (let t = 0; t < 30; t++) {
        applyOrder(m, FOE, { op: Op.Move, x: MID.x + 30000, y: MID.y });
        step(m);
        if (w.rootT[FOE] > 0) rooted = true;
      }
      return rooted;
    };
    expect(run(2200)).toBe(false);
    expect(run(3200)).toBe(true);
  });

  it('Duchess: R alone gives 1 Disdain; R then W gives 2; R, W, Q Snubs', () => {
    const m = duel('duchess');
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    cast(m, ME, 3, MID.x, MID.y);
    steps(m, 21);
    expect(stacksOf(w, FOE)).toBe(1);
    cast(m, ME, 1, MID.x + 3000, MID.y);
    steps(m, 12);
    expect(stacksOf(w, FOE)).toBe(2);
    cast(m, ME, 0, MID.x + 3000, MID.y);
    let stunned = false;
    for (let t = 0; t < 20 && !stunned; t++) {
      step(m);
      stunned = w.stunT[FOE] > 0;
    }
    expect(stunned).toBe(true);
  });

  it('Domino R does not root a Spotted hero 10.3 m away (9.5 m reach plus its body); does at 9 m', () => {
    for (const [d, want] of [[10300, false], [9000, true]] as const) {
      const m = duel('domino');
      const w = m.world;
      place(m, FOE, MID.x + d, MID.y, 2048);
      w.dotN[FOE] = 1;
      w.dotT[FOE] = 300;
      cast(m, ME, 3, MID.x + d, MID.y);
      let rooted = false;
      for (let t = 0; t < 22; t++) {
        step(m);
        if (w.rootT[FOE] > 0) rooted = true;
      }
      expect(rooted, `${d} mm`).toBe(want);
    }
  });

  it('Pixel R at tick 0, Gabė R windup landing at tick 20: no charm', () => {
    const m = duel('gabe', 'pixel');
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    cast(m, ME, 3, MID.x + 3000, MID.y);
    // Pixel (slot 3) answers on the same tick.
    applyOrder(m, FOE, { op: Op.Cast, slot: 3, x: w.x[FOE], y: w.y[FOE], id: NO_TARGET });
    let charmed = false;
    for (let t = 0; t < 25; t++) {
      step(m);
      if (w.fearSrc[FOE] === ME) charmed = true;
    }
    expect(w.ccImmT[FOE]).toBe(0);
    expect(charmed).toBe(false);
  });
});
