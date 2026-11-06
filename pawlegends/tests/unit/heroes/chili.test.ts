import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { CHILI } from '../../../src/data/heroes/chili';
import { PROJECTILE_KIND } from '../../../src/data/towers';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { canCast, kitBusy, kitOf } from '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { applyOrder } from '../../../src/sim/units/hero';
import { targetable } from '../../../src/sim/units/kinds';
import { snapshot } from '../../../src/sim/index';
import { Op } from '../../../src/sim/api';
import { Kind, RANGE } from '../../../src/sim/world';
import { MID, cast, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Chili (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const CH = 0;
const FOE = 3;
const FOE2 = 4;
const FOE3 = 5;
const A = baseNumbers(HERO_IDS.indexOf('chili'));

function arena() {
  const m = heroMatch(['chili', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, CH, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, FOE3, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, CH, FOE, FOE2, FOE3);
  return m;
}

const kit = (m: ReturnType<typeof arena>) => kitOf(m.world, CH);

describe('Chili, original dog marksman (sim v14)', () => {
  it('data: an ELECTRIC dog marksman, index 15', () => {
    expect([CHILI.side, CHILI.role, CHILI.element, CHILI.name]).toEqual(['dog', 'marksman', 'ELECTRIC', 'Chili']);
    expect(HERO_IDS.indexOf('chili')).toBe(15);
  });

  it('Small Dog Syndrome: one Rage a tick from enemy-hero damage, attack speed grows, all lost after the window', () => {
    const m = arena();
    const w = m.world;
    kit(m).incoming!(m, CH, FOE, 10);
    kit(m).incoming!(m, CH, FOE2, 10);
    expect(w.kValor[CH]).toBe(1);
    expect(w.asBp[CH]).toBe(A.passive.attackSpeedBpPer);
    // Minions and the map do not count.
    kit(m).incoming!(m, CH, RANGE.minions, 10);
    steps(m, 1);
    kit(m).incoming!(m, CH, FOE, 10);
    expect(w.kValor[CH]).toBe(2);
    expect(w.asBp[CH]).toBe(2 * A.passive.attackSpeedBpPer);
    expect(snapshot(m, 0).entities.find((e) => e.id === CH)?.resource).toBe(Math.trunc((2 * 255) / A.passive.max));
    steps(m, A.passive.window + 1);
    expect(w.kValor[CH]).toBe(0);
  });

  it('Yap Yap Yap: three yaps, gap ticks apart, of the yap kind; a yap on a hero adds Rage', () => {
    const m = arena();
    const w = m.world;
    const yaps: number[] = [];
    cast(m, CH, 0, MID.x + 7000, MID.y);
    for (let t = 0; t < 20; t++) {
      for (let p = 0; p < w.pAlive.length; p++) if (w.pAlive[p] === 1 && w.pOwner[p] === CH && w.pKind[p] === PROJECTILE_KIND.yap && !yaps.includes(p)) yaps.push(p);
      steps(m, 1);
    }
    expect(yaps).toHaveLength(A.q.count);
    kit(m).afterDeal!(m, CH, FOE, 10, 'ability');
    expect(w.kValor[CH]).toBe(1);
  });

  it('Purse Mode: untargetable, no move, basic or cast in the bag; on the way out a slow (no fear)', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    cast(m, CH, 2, MID.x, MID.y);
    expect(targetable(w, CH, 1)).toBe(false);
    expect(kitBusy(w, CH)).toBe(true);
    expect(canCast(w, CH, 0)).toBe(false);
    applyOrder(m, CH, { op: Op.Move, x: MID.x - 5000, y: MID.y });
    w.attackTimer[CH] = 0;
    steps(m, 10);
    expect(w.x[CH]).toBe(MID.x);
    expect(w.windup[CH]).toBe(0);
    steps(m, A.e.duration);
    expect(kitBusy(w, CH)).toBe(false);
    expect(w.slowBp[FOE]).toBe(A.e.slowBp);
    expect(w.fearT[FOE]).toBe(0);
  });

  it('BIG DOG ENERGY: Rage full, the splash hits at most 2 heroes or minions near the target, never a tower, and adds no Rage', () => {
    const m = arena();
    const w = m.world;
    w.level[CH] = 4;
    cast(m, CH, 3, MID.x, MID.y);
    expect(w.kValor[CH]).toBe(A.passive.max);
    expect(m.events.some((e) => e.type === 'clip' && e.what === 'bigdog')).toBe(true);
    // Three enemy heroes round FOE.
    place(m, FOE, MID.x + 4000, MID.y, 2048);
    place(m, FOE2, MID.x + 4500, MID.y, 2048);
    place(m, FOE3, MID.x + 4000, MID.y + 600, 2048);
    const t = RANGE.towers + 3;
    w.x[t] = MID.x + 3600;
    w.y[t] = MID.y;
    const tHp = w.hp[t];
    w.kValor[CH] = 0;
    m.events.length = 0;
    kit(m).afterDeal!(m, CH, FOE, 100, 'basic');
    const hits = m.events.filter((e) => e.type === 'hit' && e.src === CH);
    expect(hits).toHaveLength(A.r.splashMax);
    expect(hits.every((e) => e.type === 'hit' && w.kind[e.dst] !== Kind.Tower)).toBe(true);
    expect(w.hp[t]).toBe(tHp);
    expect(w.kValor[CH]).toBe(0);
  });
});
