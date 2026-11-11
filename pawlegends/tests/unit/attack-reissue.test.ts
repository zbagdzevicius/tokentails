/**
 * Sim v20 (V20-CHASE.md S2): re-issuing the attack on the unit already being attacked never restarts the windup. An
 * Attack on the same id is a no-op (a held or re-tapped ATK, right-click spam), and an attack-move mid-swing keeps
 * the swing on a target it may still hit (desktop A-click spam). Both hit at the attack-speed limit.
 */
import { describe, expect, it } from 'vitest';
import { Op, type Command, type HeroId } from '../../src/sim/api';
import { step } from '../../src/sim/index';
import { attackEvery, attackRange, radiusOf } from '../../src/sim/units/kinds';
import { heroMatch, hold, place, tanky } from './heroes/kit-helpers';

const ME = 0;
const FOE = 3;
const X0 = 30000;
const Y = 35000;
const TICKS = 30 * 5;

function spam(make: (t: number, m: ReturnType<typeof heroMatch>) => Command | null, hero: HeroId = 'clem', first: 'attack' | 'amove' = 'attack'): { hits: number; limit: number } {
  const m = heroMatch([hero, 'clem', 'clem', 'clem', 'clem', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
  hold(m, 1, 2, 4, 5, FOE);
  tanky(m, FOE);
  const w = m.world;
  place(m, ME, X0, Y, 0);
  place(m, FOE, X0 + attackRange(w, ME) + radiusOf(w, ME) + radiusOf(w, FOE) - 200, Y, 0);
  let hits = 0;
  for (let t = 0; t < TICKS; t++) {
    const c = make(t, m);
    const open: Command = first === 'attack' ? { op: Op.Attack, id: FOE } : { op: Op.AttackMove, x: w.x[FOE], y: w.y[FOE] };
    step(m, t === 0 ? [open] : c ? [c] : []);
    for (const e of m.events) if (e.type === 'hit' && e.src === ME && e.dst === FOE && e.kind === 'basic') hits++;
  }
  return { hits, limit: Math.floor(TICKS / attackEvery(w, ME)) };
}

describe('sim v20 S2: re-issuing an attack never restarts its windup', () => {
  it('Attack on the same id every tick hits at the attack-speed limit', () => {
    const r = spam(() => ({ op: Op.Attack, id: FOE }));
    expect(r.hits).toBeGreaterThanOrEqual(r.limit);
  });

  it('A-move on the target every 250 ms (8 ticks) hits at the attack-speed limit', () => {
    const r = spam((t, m) => (t % 8 === 0 ? { op: Op.AttackMove, x: m.world.x[FOE], y: m.world.y[FOE] } : null));
    expect(r.hits).toBeGreaterThanOrEqual(r.limit);
  });

  it('A-move spam on a fleeing-range target between swings keeps the target (long-range heroes too: sage, pixel, rocket)', () => {
    for (const hero of ['clem', 'sage', 'pixel', 'rocket'] as const) {
      const r = spam((t, m) => (t % 8 === 0 ? { op: Op.AttackMove, x: m.world.x[FOE], y: m.world.y[FOE] } : null), hero, 'amove');
      expect(r.hits, hero).toBeGreaterThanOrEqual(r.limit - 1);
    }
  });

  it('an Attack on the same id mid-swing leaves the windup running', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'clem', 'clem', 'clem']);
    for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
    hold(m, 1, 2, 4, 5, FOE);
    const w = m.world;
    place(m, ME, X0, Y, 0);
    place(m, FOE, X0 + 2000, Y, 0);
    step(m, [{ op: Op.Attack, id: FOE }]);
    const wind = w.windup[ME];
    expect(wind).toBeGreaterThan(1);
    step(m, [{ op: Op.Attack, id: FOE }]);
    expect(w.windup[ME]).toBe(wind - 1);
  });
});
