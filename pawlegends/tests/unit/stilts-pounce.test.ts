/**
 * Sim v20 (V20-CHASE.md S4): Stilts' auto-pounce never dashes out of her own swing (the dash would cancel it) and
 * never pounces on a target within her reach + the chase leeway (she swings, stepping in); she still pounces across a
 * real gap.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { HERO_RULES } from '../../src/data/xp';
import { Op } from '../../src/sim/api';
import { baseNumbers } from '../../src/sim/heroes/talents';
import { applyOrder } from '../../src/sim/units/hero';
import { attackRange, radiusOf } from '../../src/sim/units/kinds';
import { FM } from '../../src/sim/world';
import { MID, heroMatch, hold, place, steps, tanky } from './heroes/kit-helpers';

const ME = 0;
const FOE = 3;
const A = baseNumbers(HERO_IDS.indexOf('stilts'));

function arena(gap: number) {
  const m = heroMatch(['stilts', 'clem', 'sage', 'sage', 'clem', 'sage']);
  for (let id = 1; id < 6; id++) place(m, id, MID.x - 25000, MID.y + id * 3000, 0);
  hold(m, 1, 2, 3, 4, 5);
  tanky(m, ME, FOE);
  const w = m.world;
  place(m, ME, MID.x, MID.y, 0);
  place(m, FOE, MID.x + attackRange(w, ME) + radiusOf(w, ME) + radiusOf(w, FOE) + gap, MID.y, 2048);
  steps(m, 1);
  w.kValor[ME] = A.passive.max;
  return m;
}

describe('sim v20 S4: Stilts never pounces out of her own swing', () => {
  it('a target within reach + the chase leeway is swung at, not pounced on', () => {
    for (const gap of [-200, 0, HERO_RULES.chaseLeeway - 50]) {
      const m = arena(gap);
      applyOrder(m, ME, { op: Op.Attack, id: FOE });
      steps(m, 1);
      expect(m.world.fmKind[ME], `gap ${gap}`).toBe(FM.None);
      expect(m.world.windup[ME], `gap ${gap}`).toBeGreaterThan(0);
    }
  });

  it('mid-windup she does not pounce even when the target steps into the pounce band', () => {
    const m = arena(-200);
    const w = m.world;
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    steps(m, 1);
    expect(w.windup[ME]).toBeGreaterThan(1);
    w.x[FOE] += HERO_RULES.chaseLeeway + 600;
    steps(m, 1);
    expect(w.fmKind[ME]).toBe(FM.None);
  });

  it('she still pounces across a real gap (2 m)', () => {
    const m = arena(2000);
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    let dashed = false;
    for (let t = 0; t < 5; t++) {
      steps(m, 1);
      if (m.world.fmKind[ME] === FM.Dash) dashed = true;
    }
    expect(dashed).toBe(true);
  });
});
