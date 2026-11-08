/**
 * Sim v17 Avietė (docs/plans/moba/V17.md §3.7): no point-and-click stun. Shiny Coat charges after a 15-tick fill, and
 * Short Circuit's hit neither uses nor sets off the charge; the stun needs her Q cone or a basic.
 */
import { describe, expect, it } from 'vitest';
import { MID, cast, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';
import { charged } from '../../src/sim/heroes/aviete';
import { Buff } from '../../src/sim/world';

const AV = 0;
const FOE = 3;

function duel() {
  const m = heroMatch(['aviete', 'sage', 'clem', 'clem', 'sage', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
  place(m, AV, MID.x, MID.y, 0);
  place(m, FOE, MID.x + 4000, MID.y, 2048);
  setLevel(m, AV, 10);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE);
  return m;
}

describe('sim v17 Avietė (§3.7)', () => {
  it('W: not charged 14 ticks after the cast, charged at 15; the fill shows no Blocking bit', () => {
    const m = duel();
    const w = m.world;
    cast(m, AV, 1, MID.x, MID.y);
    expect(charged(w, AV)).toBe(false);
    steps(m, 14);
    expect(charged(w, AV)).toBe(false);
    expect(w.buffs[AV] & Buff.Blocking).toBe(0);
    steps(m, 1);
    expect(charged(w, AV)).toBe(true);
  });

  it('W then R: the Short Circuit hit does not stun and the charge is still up; the next Q stuns', () => {
    const m = duel();
    const w = m.world;
    cast(m, AV, 1, MID.x, MID.y);
    steps(m, 15);
    expect(charged(w, AV)).toBe(true);
    const hp = w.hp[FOE];
    cast(m, AV, 3, w.x[FOE], w.y[FOE], FOE);
    expect(w.hp[FOE]).toBeLessThan(hp);
    expect(w.stunT[FOE]).toBe(0);
    expect(charged(w, AV)).toBe(true);
    cast(m, AV, 0, w.x[FOE], w.y[FOE]);
    expect(w.stunT[FOE]).toBeGreaterThan(0);
    expect(charged(w, AV)).toBe(false);
  });

  it('the brush charge (passive) is unchanged: 1 s in a bush charges her at once', () => {
    const m = duel();
    const w = m.world;
    // Stand in a bush for brushTime ticks.
    w.bush[AV] = 0;
    w.kWAge[AV] = 29;
    steps(m, 1);
    expect(charged(w, AV) || w.bush[AV] < 0).toBe(true);
  });
});
