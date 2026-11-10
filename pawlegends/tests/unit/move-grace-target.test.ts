/**
 * Sim v20 (V20-CHASE.md S1) review: a Move or Stop that arrives in a swing's last tick lets the swing land (one-tick
 * grace), but the hero must then drop that target: a walking hero holds no attack target (Stilts' auto-pounce reads
 * it, and so do the bots' "am I focused" checks).
 */
import { describe, expect, it } from 'vitest';
import { Op } from '../../src/sim/api';
import { applyOrder } from '../../src/sim/units/hero';
import { FM } from '../../src/sim/world';
import { MID, heroMatch, hold, place, steps, tanky } from './heroes/kit-helpers';
import { baseNumbers } from '../../src/sim/heroes/talents';
import { HERO_IDS } from '../../src/data/heroes';

const ME = 0;
const FOE = 3;

describe('sim v20: a Move in the last windup tick does not leave a stale target', () => {
  it('the swing lands and the walking hero then has no target', () => {
    const m = heroMatch(['clem', 'clem', 'sage', 'sage', 'clem', 'sage']);
    for (let id = 1; id < 6; id++) place(m, id, MID.x - 25000, MID.y + id * 3000, 0);
    hold(m, 1, 2, 3, 4, 5);
    tanky(m, ME, FOE);
    const w = m.world;
    place(m, ME, MID.x, MID.y, 0);
    place(m, FOE, MID.x + 1500, MID.y, 0);
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    let guard = 0;
    while (w.windup[ME] !== 1 && guard++ < 60) steps(m, 1);
    expect(w.windup[ME]).toBe(1);
    applyOrder(m, ME, { op: Op.Move, x: MID.x - 8000, y: MID.y });
    steps(m, 2);
    expect(w.target[ME]).toBe(-1);
  });

  it('Stilts at full Stride walking away after a grace-tick swing does not pounce back', () => {
    const m = heroMatch(['stilts', 'clem', 'sage', 'sage', 'clem', 'sage']);
    for (let id = 1; id < 6; id++) place(m, id, MID.x - 25000, MID.y + id * 3000, 0);
    hold(m, 1, 2, 3, 4, 5);
    tanky(m, ME, FOE);
    const w = m.world;
    place(m, ME, MID.x, MID.y, 0);
    place(m, FOE, MID.x + 1500, MID.y, 0);
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    let guard = 0;
    while (w.windup[ME] !== 1 && guard++ < 60) steps(m, 1);
    applyOrder(m, ME, { op: Op.Move, x: MID.x - 8000, y: MID.y });
    steps(m, 2);
    let dashed = false;
    for (let t = 0; t < 30; t++) {
      w.kValor[ME] = baseNumbers(HERO_IDS.indexOf('stilts')).passive.max;
      steps(m, 1);
      if (w.fmKind[ME] !== FM.None) dashed = true;
    }
    expect(dashed).toBe(false);
  });
});

describe('sim v20: an Attack on another unit in the last windup tick', () => {
  it('does not land the old swing on the new unit', () => {
    const m = heroMatch(['clem', 'clem', 'sage', 'sage', 'clem', 'sage']);
    for (let id = 1; id < 6; id++) place(m, id, MID.x - 25000, MID.y + id * 3000, 0);
    hold(m, 1, 2, 3, 4, 5);
    tanky(m, ME, FOE, 4);
    const w = m.world;
    place(m, ME, MID.x, MID.y, 0);
    place(m, FOE, MID.x + 1500, MID.y, 0);
    place(m, 4, MID.x - 2000, MID.y, 0);
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    let guard = 0;
    while (w.windup[ME] !== 1 && guard++ < 60) steps(m, 1);
    expect(w.windup[ME]).toBe(1);
    const hp = w.hp[4];
    applyOrder(m, ME, { op: Op.Attack, id: 4 });
    steps(m, 1);
    expect(w.hp[4]).toBe(hp);
  });
});
