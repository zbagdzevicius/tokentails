/**
 * Sim v17 telegraphs on every instant hard CC (docs/plans/moba/V17.md §3.2): Cacklejaw W, Meatball W, Brutus E, Lambo
 * E and Frankie W wind up before their CC lands, and the windup event says where (Lambo's landing, Frankie's pop).
 */
import { describe, expect, it } from 'vitest';
import { TRICKS } from '../../src/data/tricks';
import { travelTicks } from '../../src/sim/effects';
import { step, type MatchHandle } from '../../src/sim/index';
import { isqrt } from '../../src/sim/fixed';
import { NO_TARGET, Op, type HeroId, type SimEvent } from '../../src/sim/api';
import { MID, heroMatch, hold, place, steps, tanky } from './heroes/kit-helpers';

const ME = 0;
const FOE = 3;

function duel(hero: HeroId): MatchHandle {
  const m = heroMatch([hero, 'sage', 'clem', 'clem', 'sage', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
  place(m, ME, MID.x, MID.y, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE);
  return m;
}

/** The windup events of hero `id` pushed during the last step. */
const windups = (m: MatchHandle, id: number): Extract<SimEvent, { type: 'windup' }>[] =>
  m.events.filter((e): e is Extract<SimEvent, { type: 'windup' }> => e.type === 'windup' && e.src === id);

/** Slot 0 (the human seat) casts `slot` at (x, y) through the step's commands, so the windup event lands in m.events. */
function cast(m: MatchHandle, _id: number, slot: number, x: number, y: number): void {
  step(m, [{ op: Op.Cast, slot: slot as 0 | 1 | 2 | 3, x, y, id: NO_TARGET }]);
}

const locked = (m: MatchHandle, id: number): boolean => m.world.stunT[id] > 0 || m.world.fearT[id] > 0;

describe('sim v17 telegraphs (§3.2)', () => {
  it('Cacklejaw W: a 9-tick windup; a victim that walks out of the cone is not feared, one that stays is feared 21', () => {
    const m = duel('cacklejaw');
    place(m, FOE, MID.x + 2000, MID.y, 0);
    cast(m, ME, 1, MID.x + 2000, MID.y);
    expect(windups(m, ME).map((e) => e.ticks)).toEqual([9]);
    expect(m.world.fearT[FOE]).toBe(0);
    steps(m, 9);
    expect(m.world.fearT[FOE]).toBeGreaterThanOrEqual(20);
    expect(m.world.fearT[FOE]).toBeLessThanOrEqual(21);

    const n = duel('cacklejaw');
    place(n, FOE, MID.x + 2000, MID.y, 0);
    cast(n, ME, 1, MID.x + 2000, MID.y);
    // It leaves the 3 m cone before the windup ends.
    place(n, FOE, MID.x + 5000, MID.y + 3000, 0);
    steps(n, 10);
    expect(n.world.fearT[FOE]).toBe(0);
  });

  it('Meatball W: the Loaf winds up 9 ticks, then the charm ring lands', () => {
    const m = duel('meatball');
    place(m, FOE, MID.x + 2000, MID.y, 0);
    cast(m, ME, 1, MID.x, MID.y);
    expect(windups(m, ME).map((e) => e.ticks)).toEqual([9]);
    expect(m.world.fearT[FOE]).toBe(0);
    steps(m, 9);
    expect(m.world.fearSrc[FOE]).toBe(ME);
  });

  it('Brutus E: a 9-tick windup, then 14 m/s: a 5 m charge reaches the target 9 + 11 ticks after the cast', () => {
    expect(travelTicks(5000, 14000)).toBe(11);
    const m = duel('brutus');
    const d = 5000;
    place(m, FOE, MID.x + d, MID.y, 2048);
    cast(m, ME, 2, MID.x + d, MID.y);
    expect(windups(m, ME).map((e) => [e.ticks, e.x, e.y])).toEqual([[9, MID.x + d, MID.y]]);
    let t = 1;
    while (!locked(m, FOE) && t < 60) {
      step(m);
      t++;
    }
    // The charge stops at the first hero (bodies touch a little before the 5 m mark).
    expect(t).toBeGreaterThanOrEqual(9 + 8);
    expect(t).toBeLessThanOrEqual(9 + 11);
  });

  it('Lambo E: a 12-tick windup whose event carries the landing point; the 1.8 m ring stuns there', () => {
    const m = duel('lambo');
    place(m, FOE, MID.x + 6500, MID.y, 2048);
    // Aimed 8 m out: he hops the full 5 m, so the ring is drawn at 5 m, not at the aim point.
    cast(m, ME, 2, MID.x + 8000, MID.y);
    const ev = windups(m, ME);
    expect(ev.map((e) => e.ticks)).toEqual([12]);
    expect([ev[0].x, ev[0].y]).toEqual([MID.x + 5000, MID.y]);
    steps(m, 12 + 13 + 2);
    expect([m.world.x[ME], m.world.y[ME]]).toEqual([MID.x + 5000, MID.y]);
    expect(m.world.stunT[FOE]).toBeGreaterThan(0);
  });

  it('Lambo E at a point 3 m away lands there; a foe 2 m past the landing (outside 1.8 m) is not stunned', () => {
    const m = duel('lambo');
    place(m, FOE, MID.x + 5200, MID.y, 2048);
    cast(m, ME, 2, MID.x + 3000, MID.y);
    const ev = windups(m, ME);
    expect([ev[0].x, ev[0].y]).toEqual([MID.x + 3000, MID.y]);
    steps(m, 40);
    expect(m.world.stunT[FOE]).toBe(0);
  });

  it('Frankie W: a windup event at the pop point for the whole burrow; cast at 1 m it pops at tick 9, not tick 2', () => {
    const m = duel('frankie');
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    cast(m, ME, 1, MID.x + 1000, MID.y);
    const ev = windups(m, ME);
    expect(ev.map((e) => [e.slot, e.ticks, e.x, e.y])).toEqual([[1, 9, MID.x + 1000, MID.y]]);
    let t = 1;
    while (m.world.stunT[FOE] === 0 && t < 40) {
      step(m);
      t++;
    }
    expect(t).toBeGreaterThanOrEqual(9);
    expect(t).toBeLessThanOrEqual(11);
    expect(m.world.untargT[ME]).toBeLessThanOrEqual(1);
  });

  it('Frankie W at max range pops after the travel (722 ms) and waits no extra', () => {
    const m = duel('frankie');
    cast(m, ME, 1, MID.x + 6500, MID.y);
    const ev = windups(m, ME);
    expect(ev[0].ticks).toBe(travelTicks(6500, 9000));
    expect(isqrt((ev[0].x - MID.x) ** 2 + (ev[0].y - MID.y) ** 2)).toBe(6500);
  });

  it('Hiss: fear 21 (0.7 s), still instant', () => {
    expect(TRICKS.hiss).toMatchObject({ fear: 21, radius: 3000 });
  });
});

describe('sim v17 Bengas W (§3.9)', () => {
  it('a 15-tick windup: a victim that turns away within it is slowed, not stunned; one that keeps facing him is stunned', () => {
    for (const [turn, stunned] of [[true, false], [false, true]] as const) {
      const m = duel('bengas');
      const w = m.world;
      // Facing Bengas (west, half a turn).
      place(m, FOE, MID.x + 3000, MID.y, 2048);
      cast(m, ME, 1, MID.x + 3000, MID.y);
      expect(windups(m, ME).map((e) => e.ticks)).toEqual([15]);
      steps(m, 10);
      if (turn) place(m, FOE, w.x[FOE], w.y[FOE], 0); // now facing east, away from him
      steps(m, 6);
      expect(w.stunT[FOE] > 0, `turn ${turn}`).toBe(stunned);
      if (turn) expect(w.slowT[FOE]).toBeGreaterThan(0);
    }
  });
});
