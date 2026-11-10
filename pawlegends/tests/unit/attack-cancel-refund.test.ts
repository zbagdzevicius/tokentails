/**
 * Sim v20 (V20-CHASE.md S1, Wild Rift / LoL attack timer): "When the windup is interrupted by any means, the attack timer
 * stops counting and resets to zero" (LoL Wiki, Attack speed). Every way a hero's windup ends without the swing landing
 * leaves the windup and the attack timer at 0; a swing that lands still spends the timer. The one-tick grace (LoL Wiki,
 * Basic attack): a move or stop in the swing's last tick no longer cancels it.
 */
import { describe, expect, it } from 'vitest';
import { HERO_RULES } from '../../src/data/xp';
import { Op, type Command } from '../../src/sim/api';
import { step } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { dash } from '../../src/sim/effects/dash';
import { stun } from '../../src/sim/effects/stun';
import { knockback } from '../../src/sim/effects/knockback';
import { interrupt } from '../../src/sim/effects/status';
import { attackRange, radiusOf } from '../../src/sim/units/kinds';
import type { MatchHandle } from '../../src/sim/state';
import { heroMatch, hold, place, tanky } from './heroes/kit-helpers';

const ME = 0;
const FOE = 3;
const X0 = 30000;
const Y = 35000;

/** ME swinging at FOE (in range), `ticks` into the windup. */
function swinging(ticks = 2): MatchHandle {
  const m = heroMatch(['clem', 'clem', 'clem', 'clem', 'clem', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
  hold(m, 1, 2, 4, 5, FOE);
  tanky(m, FOE);
  const w = m.world;
  place(m, ME, X0, Y, 0);
  place(m, FOE, X0 + attackRange(w, ME) + radiusOf(w, ME) + radiusOf(w, FOE) - 200, Y, 0);
  step(m, [{ op: Op.Attack, id: FOE }]);
  for (let t = 1; t < ticks; t++) step(m);
  expect(w.windup[ME]).toBeGreaterThan(1);
  expect(w.attackTimer[ME]).toBeGreaterThan(0);
  return m;
}

const cancels: [string, (m: MatchHandle) => void][] = [
  ['a move', (m) => applyOrder(m, ME, { op: Op.Move, x: X0 - 5000, y: Y })],
  ['a stop', (m) => applyOrder(m, ME, { op: Op.Stop })],
  ['an attack on another unit', (m) => applyOrder(m, ME, { op: Op.Attack, id: 4 })],
  ['a stun', (m) => stun(m.world, ME, 10)],
  ['interrupt (soft)', (m) => interrupt(m.world, ME, false)],
  ['its own dash', (m) => dash(m, ME, 0, 2000)],
  ['a knockback', (m) => knockback(m, ME, X0 + 2000, Y, 1500, 0)],
  ['Nap', (m) => applyOrder(m, ME, { op: Op.Nap })],
];

describe('sim v20 S1: a cancelled windup gives the attack timer back', () => {
  for (const [name, act] of cancels) {
    it(`${name}: windup 0 and attack timer 0`, () => {
      const m = swinging();
      // FOE 4 must be targetable for the retarget case: place it next to the hero
      if (name.startsWith('an attack')) place(m, 4, X0 - 1500, Y, 0);
      act(m);
      expect(m.world.windup[ME], name).toBe(0);
      expect(m.world.attackTimer[ME], name).toBe(0);
    });
  }

  it('a swing that lands still spends the whole attack timer', () => {
    const m = swinging(1);
    const w = m.world;
    let landed = -1;
    for (let t = 0; t < HERO_RULES.attackWindup + 1 && landed < 0; t++) {
      step(m);
      if (m.events.some((e) => e.type === 'hit' && e.src === ME && e.kind === 'basic')) landed = t;
    }
    expect(landed).toBeGreaterThanOrEqual(0);
    expect(w.attackTimer[ME]).toBeGreaterThan(HERO_RULES.attackWindup);
  });

  it('one-tick grace: a move or stop in the swing\'s last tick does not cancel it (it lands)', () => {
    for (const cmd of [{ op: Op.Move, x: X0 - 5000, y: Y }, { op: Op.Stop }] as Command[]) {
      const m = swinging(1);
      const w = m.world;
      while (w.windup[ME] > 1) step(m);
      step(m, [cmd]);
      expect(m.events.some((e) => e.type === 'hit' && e.src === ME && e.kind === 'basic')).toBe(true);
    }
  });

  it('after a cancel the next swing starts on the next tick the target is in reach', () => {
    const m = swinging();
    const w = m.world;
    applyOrder(m, ME, { op: Op.Stop });
    expect(w.attackTimer[ME]).toBe(0);
    step(m, [{ op: Op.Attack, id: FOE }]);
    expect(w.windup[ME]).toBe(HERO_RULES.attackWindup - 1);
  });
});
