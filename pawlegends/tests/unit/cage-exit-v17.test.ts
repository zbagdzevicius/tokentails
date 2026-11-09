/**
 * Sim v17 Brutus cage exit (docs/plans/moba/V17.md §3.5): Champion's Challenge lasts 2.5 s (Arena of Honour 3.5 s), and
 * the tethered foe breaks out with Pounce or any cleanse; the arena then ends for both and Sir Brutus loses his 30% cut.
 */
import { describe, expect, it } from 'vitest';
import { ZONE_KIND } from '../../src/data/effects';
import { TRICKS } from '../../src/data/tricks';
import { Op } from '../../src/sim/api';
import { dealDamage } from '../../src/sim/combat/damage';
import { isqrt } from '../../src/sim/fixed';
import { applyOrder } from '../../src/sim/units/hero';
import { Buff, Kind } from '../../src/sim/world';
import { MID, cast, basicHit, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';

const BR = 0;
const FOE = 3;

function cage(trick: 'pounce' | 'purrify') {
  const m = heroMatch(['brutus', 'sage', 'clem', 'sage', 'clem', 'clem'], ['purrify', 'pounce', 'pounce', trick, 'pounce', 'pounce']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
  place(m, BR, MID.x, MID.y, 0);
  place(m, FOE, MID.x + 3000, MID.y, 2048);
  setLevel(m, BR, 4);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE);
  cast(m, BR, 3, MID.x + 3000, MID.y, FOE);
  return m;
}

describe('sim v17 Brutus cage exit (§3.5)', () => {
  it('a tethered Sage Pounces from 1 m inside the ring edge: lands 4 m out, the arena is gone, Brutus takes full damage', () => {
    const m = cage('pounce');
    const w = m.world;
    const z = w.tether[FOE];
    expect(z).toBeGreaterThanOrEqual(0);
    // 1 m inside the 6 m edge.
    place(m, FOE, w.zX[z] + 5000, w.zY[z], 0);
    steps(m, 1);
    expect(w.buffs[FOE] & Buff.Tethered).not.toBe(0);
    const x0 = w.x[FOE];
    cast(m, FOE, 4, w.x[FOE] + 9000, w.y[FOE]);
    expect(w.x[FOE] - x0).toBe(TRICKS.pounce.blink);
    expect(w.zAlive[z]).toBe(0);
    expect([w.tether[FOE], w.tether[BR]]).toEqual([-1, -1]);
    steps(m, 1);
    expect(w.buffs[FOE] & Buff.Tethered).toBe(0);
    expect(w.buffs[BR] & Buff.Tethered).toBe(0);
    const hp = w.hp[BR];
    w.kHonour[BR] = 0;
    dealDamage(m, FOE, 1, Kind.Hero, BR, 100, 'basic');
    expect(hp - w.hp[BR]).toBe(basicHit(100, 40 + 3 * 3));
  });

  it("Purr-ify inside the ring frees the foe; Brutus casting his own Purr-ify keeps the ring", () => {
    const m = cage('purrify');
    const w = m.world;
    const z = w.tether[FOE];
    cast(m, FOE, 4, w.x[FOE], w.y[FOE]);
    expect(w.zAlive[z]).toBe(0);
    expect(w.tether[FOE]).toBe(-1);
    // The free foe walks out of the old ring.
    applyOrder(m, FOE, { op: Op.Move, x: MID.x + 20000, y: MID.y });
    steps(m, 60);
    expect(isqrt((w.x[FOE] - MID.x) ** 2 + (w.y[FOE] - MID.y) ** 2)).toBeGreaterThan(6500);

    const n = cage('purrify');
    const z2 = n.world.tether[FOE];
    cast(n, BR, 4, n.world.x[BR], n.world.y[BR]);
    expect(n.world.zAlive[z2]).toBe(1);
    expect(n.world.tether[FOE]).toBe(z2);
  });

  it('the ring lasts 75 ticks (Arena of Honour: 105)', () => {
    const m = cage('pounce');
    const w = m.world;
    const z = w.tether[FOE];
    expect(w.zKind[z]).toBe(ZONE_KIND.arena);
    expect(w.zTtl[z]).toBe(75);
  });
});
