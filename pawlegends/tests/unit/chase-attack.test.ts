/**
 * Founder bug 2026-11-08: "it's close to impossible to attack a champ with a basic attack while chasing".
 *
 * An attacker with an Attack order chases an enemy hero walking straight away on open ground; we count the basic hits
 * that land in 5 s. Before the fix every case landed 0: the attacker stood still through its 8-tick windup, the target
 * walked a windup's distance out of range + its radius and the swing was dropped (attack timer spent), then it chased
 * at the same speed and never closed the gap again. Now the swing starts within range + HERO_RULES.chaseLeeway, the
 * attacker keeps pace with a target leaving range while it winds up and while its attack timer runs, and the touch
 * stick held toward the target yields to ATK (input/touch/assist.ts STICK_YIELD).
 */
import { describe, expect, it } from 'vitest';
import { HERO_RULES } from '../../src/data/xp';
import type { Command, HeroId } from '../../src/sim/api';
import { Op } from '../../src/sim/api';
import { step } from '../../src/sim/index';
import { lineClear } from '../../src/sim/map/grid';
import { applyOrder } from '../../src/sim/units/hero';
import { attackRange, radiusOf } from '../../src/sim/units/kinds';
import type { MatchHandle } from '../../src/sim/state';
import { stickTowardTarget } from '../../src/input/touch/assist';
import { heroMatch, hold, place, tanky } from './heroes/kit-helpers';

const ME = 0;
const FOE = 3;
const Y = 35000;
const X0 = 30000;
const TICKS = 30 * 5;

interface Opts {
  /** Start gap beyond the attacker's reach (mm, edge of range = 0); default 100 mm inside. */
  gap?: number;
  /** Slow on the target (bp). */
  slowBp?: number;
  /** Touch flow: ATK held with the stick held toward the target; 'raw' = the old stick, 'yield' = STICK_YIELD. */
  touch?: 'raw' | 'yield';
  /** The target Pounces away on the first tick the attacker winds up. */
  pounce?: boolean;
}

function reachOf(m: MatchHandle): number {
  return attackRange(m.world, ME) + radiusOf(m.world, ME) + radiusOf(m.world, FOE);
}

function chase(me: HeroId, foe: HeroId, o: Opts = {}): { hits: number; firstHit: number; m: MatchHandle } {
  const m = heroMatch([me, 'clem', 'clem', foe, 'clem', 'clem']);
  const w = m.world;
  for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
  hold(m, 1, 2, 4, 5, FOE);
  tanky(m, FOE);
  place(m, ME, X0, Y, 0);
  place(m, FOE, X0 + reachOf(m) + (o.gap ?? -100), Y, 0);
  expect(lineClear(m.grid, X0, Y, X0 + 36000, Y)).toBe(true);
  if (o.slowBp) {
    w.slowT[FOE] = TICKS * 2;
    w.slowBp[FOE] = o.slowBp;
  }
  applyOrder(m, FOE, { op: Op.Move, x: X0 + 60000, y: Y });
  let hits = 0;
  let firstHit = -1;
  let goalX = w.x[ME];
  let lastStick = -99;
  let lastAtk = -99;
  let pounced = false;
  for (let t = 0; t < TICKS; t++) {
    const cmds: Command[] = [];
    if (!o.touch) {
      if (t === 0) cmds.push({ op: Op.Attack, id: FOE });
    } else {
      // ATK held: an Attack every 350 ms (≈ 10 ticks). The stick, held toward the target, sends a Move 2 m ahead
      // whenever the hero is within 1 m of its last goal, at most every 100 ms (≈ 3 ticks): touchControls.ts STICK.
      if (t - lastAtk >= 10) {
        cmds.push({ op: Op.Attack, id: FOE });
        lastAtk = t;
      }
      const toward = stickTowardTarget(w.x[ME], w.y[ME], 0, { x: w.x[FOE], y: w.y[FOE] });
      const yields = o.touch === 'yield' && toward;
      if (!yields && Math.abs(goalX - w.x[ME]) < 1000 && t - lastStick >= 3) {
        goalX = w.x[ME] + 2000;
        cmds.push({ op: Op.Move, x: goalX, y: Y });
        lastStick = t;
      }
    }
    if (o.pounce && !pounced && w.windup[ME] > 0) {
      pounced = true;
      applyOrder(m, FOE, { op: Op.Trick, x: w.x[FOE] + 9000, y: Y });
    }
    step(m, cmds);
    for (const e of m.events) {
      if (e.type !== 'hit' || e.src !== ME || e.dst !== FOE || e.kind !== 'basic') continue;
      hits++;
      if (firstHit < 0) firstHit = t;
    }
  }
  return { hits, firstHit, m };
}

describe('basic attacks while chasing (founder bug 2026-11-08)', () => {
  it('a melee hero lands every swing on a target walking away at its own speed (was 0 in 5 s)', () => {
    expect(chase('clem', 'clem').hits).toBe(5);
    expect(chase('clem', 'clem', { gap: 0 }).hits).toBe(5);
    expect(chase('clem', 'clem', { slowBp: 3000 }).hits).toBe(5);
  });

  it('a ranged hero keeps landing bolts on a target walking away at its own speed (was 0 in 5 s)', () => {
    expect(chase('sage', 'sage').hits).toBeGreaterThanOrEqual(4);
    expect(chase('sage', 'sage', { gap: 0 }).hits).toBeGreaterThanOrEqual(4);
    expect(chase('sage', 'sage', { slowBp: 3000 }).hits).toBeGreaterThanOrEqual(4);
  });

  it('a faster target still gets away: one swing, then the gap opens past the leeway', () => {
    for (const me of ['lambo', 'pixel'] as const) {
      const r = chase(me, 'stilts');
      expect(r.hits).toBeLessThanOrEqual(2);
      const w = r.m.world;
      expect(w.x[FOE] - w.x[ME]).toBeGreaterThan(reachOf(r.m) + HERO_RULES.chaseLeeway + 1000);
    }
  });

  it('a Pounce out of the windup still dodges the melee swing (the first hit comes a whole attack later)', () => {
    const plain = chase('clem', 'clem');
    expect(plain.firstHit).toBeLessThan(HERO_RULES.attackWindup);
    expect(chase('clem', 'clem', { pounce: true }).firstHit).toBeGreaterThan(20);
  });

  it('touch: ATK held with the stick toward the target lands its swings (the old stick moves cancelled them all)', () => {
    expect(chase('clem', 'clem', { touch: 'raw' }).hits).toBe(0);
    expect(chase('clem', 'clem', { touch: 'yield' }).hits).toBe(5);
    expect(chase('sage', 'sage', { touch: 'yield' }).hits).toBeGreaterThanOrEqual(4);
  });

  it('the stick yields only toward the target: pulled away it still moves (retreat, kite)', () => {
    expect(stickTowardTarget(0, 0, 0, { x: 1000, y: 0 })).toBe(true);
    expect(stickTowardTarget(0, 0, Math.PI / 3, { x: 1000, y: 0 })).toBe(true);
    expect(stickTowardTarget(0, 0, Math.PI, { x: 1000, y: 0 })).toBe(false);
    expect(stickTowardTarget(0, 0, -Math.PI * 0.6, { x: 1000, y: 0 })).toBe(false);
  });

  it('a rooted hero gets no extra reach from the leeway: a target standing just past its range is never hit', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'clem', 'clem', 'clem']);
    const w = m.world;
    for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
    hold(m, 1, 2, 4, 5, FOE);
    tanky(m, FOE);
    place(m, ME, X0, Y, 0);
    place(m, FOE, X0 + reachOf(m) + 200, Y, 0);
    w.rootT[ME] = TICKS * 2;
    step(m, [{ op: Op.Attack, id: FOE }]);
    let hits = 0;
    for (let t = 1; t < TICKS; t++) {
      step(m);
      for (const e of m.events) if (e.type === 'hit' && e.src === ME && e.kind === 'basic') hits++;
    }
    expect(w.x[ME]).toBe(X0);
    expect(hits).toBe(0);
  });

  it('a target standing in range is fought standing still: no step during the attack timer', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'clem', 'clem', 'clem']);
    const w = m.world;
    for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
    hold(m, 1, 2, 4, 5, FOE);
    tanky(m, FOE);
    place(m, ME, X0, Y, 0);
    place(m, FOE, X0 + reachOf(m) - 100, Y, 0);
    step(m, [{ op: Op.Attack, id: FOE }]);
    let hits = 0;
    for (let t = 1; t < TICKS; t++) {
      step(m);
      for (const e of m.events) if (e.type === 'hit' && e.src === ME && e.kind === 'basic') hits++;
      expect(w.x[ME]).toBe(X0);
    }
    expect(hits).toBe(5);
  });
});
