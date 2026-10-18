/**
 * Tower lock-on (sim v4, data/towers.ts TOWERS.lockOnTicks): a structure that switches to a hero marks it first (a
 * `windup` event, slot 4, that the client draws as the red line) and fires only after 1.2 s; a hero that leaves
 * range during the lock-on is not shot. Rookie: the first hit on a low-level hero of the human's team knocks it back.
 */
import { describe, expect, it } from 'vitest';
import { TOWER_SPOTS } from '../../src/data/map';
import { TOWERS } from '../../src/data/towers';
import { step } from '../../src/sim/index';
import { stepStructures } from '../../src/sim/units/tower';
import { G } from '../../src/sim/world';
import { putHero, quietMatch, towerId } from './sim-helpers';
import { steps } from './heroes/kit-helpers';

const OUTER = TOWER_SPOTS[0];
const woofOuter = () => ({ x: 100000 - OUTER.x, y: OUTER.y });

const bolts = (m: ReturnType<typeof quietMatch>, owner: number): number => {
  let n = 0;
  for (let p = 0; p < m.world.pAlive.length; p++) if (m.world.pAlive[p] === 1 && m.world.pOwner[p] === owner) n++;
  return n;
};

describe('tower lock-on (sim v4)', () => {
  it('marks a hero for 1.2 s (a windup event, slot 4) before the first shot', () => {
    const m = quietMatch(1, false, 'normal');
    const t = towerId(0, 0);
    putHero(m, 3, OUTER.x + 2000, OUTER.y);
    stepStructures(m);
    expect(m.events.some((e) => e.type === 'windup' && e.src === t && e.slot === 4 && e.ticks === TOWERS.lockOnTicks)).toBe(true);
    for (let i = 1; i < TOWERS.lockOnTicks; i++) stepStructures(m);
    expect(bolts(m, t)).toBe(0);
    stepStructures(m);
    expect(bolts(m, t)).toBe(1);
  });

  it('a hero that leaves range during the lock-on is not shot', () => {
    const m = quietMatch(1, false, 'normal');
    const t = towerId(0, 0);
    putHero(m, 3, OUTER.x + 2000, OUTER.y);
    for (let i = 0; i < TOWERS.lockOnTicks - 5; i++) stepStructures(m);
    putHero(m, 3, OUTER.x + 20000, OUTER.y);
    for (let i = 0; i < TOWERS.lockOnTicks + 40; i++) stepStructures(m);
    expect(bolts(m, t)).toBe(0);
    expect(m.world.target[t]).toBe(-1);
  });

  it('Rookie: the first tower hit knocks a level ≤ 2 hero of the human’s team back 3 m; not the enemy, not higher levels', () => {
    const knocked = (difficulty: 'rookie' | 'normal', slot: number, level = 1): number => {
      const m = quietMatch(1, false, difficulty);
      const w = m.world;
      w.globals[G.Tick] = 300;
      const tower = slot < 3 ? towerId(1, 0) : towerId(0, 0);
      const at = slot < 3 ? woofOuter() : OUTER;
      const dir = slot < 3 ? -1 : 1;
      w.level[slot] = level;
      putHero(m, slot, at.x + dir * 3000, at.y);
      const x0 = w.x[slot];
      let hit = false;
      for (let i = 0; i < 120 && !hit; i++) {
        putHero(m, slot, x0, at.y); // the hero holds still until the first hit lands
        step(m);
        hit = m.events.some((e) => e.type === 'hit' && e.src === tower && e.dst === slot);
      }
      expect(hit).toBe(true);
      steps(m, 15); // the knockback plays out
      return Math.abs(w.x[slot] - x0);
    };
    expect(knocked('rookie', 1)).toBeGreaterThanOrEqual(TOWERS.rookieKnockback - 200);
    expect(knocked('normal', 1)).toBeLessThan(500);
    expect(knocked('rookie', 4)).toBeLessThan(500);
    expect(knocked('rookie', 1, 3)).toBeLessThan(500);
  });
});
