import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { MARSHMALLOW } from '../../../src/data/heroes/marshmallow';
import { PROJECTILE_KIND } from '../../../src/data/towers';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { inOwnSnow } from '../../../src/sim/heroes/marshmallow';
import { spawnBurst } from '../../../src/sim/effects';
import type { SimEvent } from '../../../src/sim/api';
import { MID, cast, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Marshmallow (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const MM = 0;
const ALLY = 1;
const FOE = 3;
const FOE2 = 4;
const FOE3 = 5;
const A = baseNumbers(HERO_IDS.indexOf('marshmallow'));

function arena() {
  const m = heroMatch(['marshmallow', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, MM, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, FOE3, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2, FOE3);
  return m;
}

describe('Marshmallow, original dog mage (sim v14)', () => {
  it('data: an ICE dog mage, index 13, no stacks', () => {
    expect([MARSHMALLOW.side, MARSHMALLOW.role, MARSHMALLOW.element, MARSHMALLOW.name]).toEqual(['dog', 'mage', 'ICE', 'Marshmallow']);
    expect(HERO_IDS.indexOf('marshmallow')).toBe(13);
    expect(A.r.freeze).toBe(30);
  });

  it('Snowball: stops at the first unit, the shared fluff projectile kind', () => {
    const m = arena();
    const w = m.world;
    cast(m, MM, 0, MID.x + 8000, MID.y);
    const p = [...w.pAlive].findIndex((a, i) => a === 1 && w.pOwner[i] === MM);
    expect(w.pKind[p]).toBe(PROJECTILE_KIND.fluff);
    expect(w.pFlags[p]).toBe(0);
  });

  it('Snow Patch: after the wind-up it hurts and slows a cat standing in it', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, MM, 1, MID.x + 5000, MID.y);
    steps(m, A.w.windup + 2);
    expect(hp - w.hp[FOE]).toBeGreaterThan(0);
    expect(w.slowBp[FOE]).toBe(A.w.slowBp);
  });

  it('Fresh Snow: only in her own snow (a burst of another owner does not count)', () => {
    const m = arena();
    const w = m.world;
    spawnBurst(w, w.team[ALLY], ALLY, MID.x, MID.y, 3000, 0, 300, 0, 0, 15, 0, 0);
    steps(m, 1);
    expect(inOwnSnow(w, MM)).toBe(false);
    expect(w.kValor[MM]).toBe(0);
    spawnBurst(w, w.team[MM], MM, MID.x, MID.y, 3000, 0, 300, 0, 0, 15, 0, 0);
    steps(m, 1);
    expect(w.kValor[MM]).toBe(1);
    expect(w.hasteBp[MM]).toBe(A.passive.hasteBp);
  });

  it('SNOW DAY!: a cat still inside at the end is Frozen (rooted), one that left is not, a CC-immune one is not; one clip each', () => {
    const m = arena();
    const w = m.world;
    w.level[MM] = 4;
    const cx = MID.x + 6000;
    place(m, FOE, cx, MID.y, 2048);
    place(m, FOE2, cx + 500, MID.y + 500, 2048);
    place(m, FOE3, cx - 500, MID.y - 500, 2048);
    cast(m, MM, 3, cx, MID.y);
    const clips: SimEvent[] = [];
    let froze = -1;
    for (let t = 0; t < A.r.windup + A.r.duration + 4; t++) {
      // FOE2 walks out halfway through; FOE3 is CC-immune at the end.
      // (4 m off the row: sim v25 moved team 1's rat-camp Boing Bed to x 65.5 m, and a hero parked on it is thrown)
      if (t === 60) place(m, FOE2, cx + 9000, MID.y + 4000, 2048);
      w.ccImmT[FOE3] = 5;
      steps(m, 1);
      for (const e of m.events) if (e.type === 'clip') clips.push(e);
      if (froze < 0 && w.rootT[FOE] > 0) froze = w.rootT[FOE];
    }
    expect(froze).toBeGreaterThanOrEqual(A.r.freeze - 1);
    expect(w.rootT[FOE2]).toBe(0);
    expect(w.rootT[FOE3]).toBe(0);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ type: 'clip', id: FOE, what: 'frozen' });
  });

  it('Belly Slide: dashes, then +speed and a shield on landing', () => {
    const m = arena();
    const w = m.world;
    cast(m, MM, 2, MID.x + 4000, MID.y);
    steps(m, 10);
    expect(w.x[MM]).toBe(MID.x + A.e.dash);
    expect(w.shield[MM]).toBe(A.e.shield);
    expect(w.hasteBp[MM]).toBe(A.e.hasteBp);
  });
});
