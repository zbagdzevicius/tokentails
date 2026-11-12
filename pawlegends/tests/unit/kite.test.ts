/**
 * KITE-FIX (docs/plans/moba/KITE-FIX.md; player report 2026-11-11 "can't both run and attack"): Op.Kite attacks a
 * unit and walks toward the stick's goal while the attack timer runs. Headless sim at 30 Hz; every command goes
 * through the input gate (step), as a live match's would.
 */
import { describe, expect, it } from 'vitest';
import { Op, type Command, type HeroId } from '../../src/sim/api';
import { decodeCommand, encodeCommand, OP_SIZE, quantize } from '../../src/sim/commands';
import { createGate, gateCommand } from '../../src/sim/input';
import { KITE_MIN_GAP, LIMITS_BY_MAP, MOVE_MIN_GAP, setLimits } from '../../src/data/limits';
import { createMatch, fillPicks, hashTrail, replayRecord, result, step } from '../../src/sim/index';
import { runReplay } from '../../src/sim/replay';
import { Rng } from '../../src/sim/rng';
import { applyOrder } from '../../src/sim/units/hero';
import { Order, UnitState, type World } from '../../src/sim/world';
import { attackEvery, attackRange, radiusOf } from '../../src/sim/units/kinds';
import { heroMatch, hold, place, tanky } from './heroes/kit-helpers';
import { randomCommand } from './helpers';
import { SIM_VERSION } from '../../src/sim/version';
import { CMD_OP, CMD_SIZE } from '../../src/net/proto';

const ME = 0;
const FOE = 3;
const X0 = 30000;
const Y = 35000;
const SECONDS = 6;
const TICKS = 30 * SECONDS;

type Driver = (t: number, w: World) => Command | null;
/** Per tick, what the target does (it may walk). */
type Foe = (t: number, m: ReturnType<typeof heroMatch>) => void;

function run(hero: HeroId, drive: Driver, foe: Foe = () => {}): { hits: number; walked: number; every: number } {
  const m = heroMatch([hero, 'clem', 'clem', 'clem', 'clem', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
  hold(m, 1, 2, 4, 5, FOE);
  tanky(m, FOE);
  const w = m.world;
  place(m, ME, X0, Y, 0);
  place(m, FOE, X0 + attackRange(w, ME) + radiusOf(w, ME) + radiusOf(w, FOE) - 200, Y, 0);
  let hits = 0;
  let walked = 0;
  for (let t = 0; t < TICKS; t++) {
    foe(t, m);
    const c = drive(t, w);
    const x = w.x[ME];
    const y = w.y[ME];
    step(m, c ? [c] : []);
    walked += Math.hypot(w.x[ME] - x, w.y[ME] - y);
    for (const e of m.events) if (e.type === 'hit' && e.src === ME && e.dst === FOE && e.kind === 'basic') hits++;
  }
  return { hits, walked: Math.round(walked), every: attackEvery(w, ME) };
}

const stand: Driver = (t) => (t === 0 ? { op: Op.Attack, id: FOE } : null);

/** The touch client with ATK held and the stick held at angle `dir(t)` (rad): a kite 2 m ahead, re-sent every 100 ms. */
const kiteStick =
  (dir: (t: number) => number): Driver =>
  (t, w) => {
    if (t === 0) return { op: Op.Attack, id: FOE };
    if (t % 3 !== 0) return null;
    const a = dir(t);
    return { op: Op.Kite, x: w.x[ME] + Math.round(Math.cos(a) * 2000), y: w.y[ME] + Math.round(Math.sin(a) * 2000), id: FOE };
  };

/** The target walks toward the kiting hero every 200 ms (a melee chaser at the same speed). */
const chaser: Foe = (t, m) => {
  if (t % 6 === 0) applyOrder(m, FOE, { op: Op.Move, x: m.world.x[ME], y: m.world.y[ME] });
};

describe('KITE-FIX: commands and gate', () => {
  it('ships in sim v23 as op 12 (op 11 is the v21 Fire); the relay framing knows its size', () => {
    expect(SIM_VERSION).toBe(23);
    expect(Op.Kite).toBe(12);
    expect(CMD_OP.Kite).toBe(Op.Kite);
    expect(CMD_SIZE[Op.Kite]).toBe(OP_SIZE[Op.Kite]);
  });
  it('Op.Kite is 6 bytes and round-trips (quantised)', () => {
    const c: Command = { op: Op.Kite, x: 12345, y: 54321, id: 47 };
    const bytes = encodeCommand(c);
    expect(bytes.length).toBe(6);
    expect(OP_SIZE[Op.Kite]).toBe(6);
    expect(decodeCommand(bytes)).toEqual(quantize(c));
    expect(quantize(c)).toEqual({ op: Op.Kite, x: 12250, y: 54250, id: 47 });
  });
  it('a kite is gated as a move: spaced by KITE_MIN_GAP and waits behind a cast of its tick', () => {
    const g = createGate();
    const k = (x: number): Command => ({ op: Op.Kite, x, y: 1000, id: 3 });
    expect(gateCommand(g, 10, [k(1000)])?.op).toBe(Op.Kite);
    expect(gateCommand(g, 11, [k(2000)])).toBeNull();
    expect(gateCommand(g, 10 + MOVE_MIN_GAP, [])).toBeNull();
    expect(gateCommand(g, 10 + KITE_MIN_GAP, [])).toEqual(quantize(k(2000)));
    // a move after a kite keeps the move gap
    expect(gateCommand(g, 10 + KITE_MIN_GAP + MOVE_MIN_GAP, [{ op: Op.Move, x: 4000, y: 1000 }])?.op).toBe(Op.Move);
    const cast: Command = { op: Op.Cast, slot: 0, x: 0, y: 0, id: 255 };
    expect(gateCommand(g, 40, [cast, k(3000)])?.op).toBe(Op.Cast);
    expect(gateCommand(g, 41, [])).toEqual(quantize(k(3000)));
  });
  it('a held stick with ATK held for a whole match (a kite every tick) stays inside the input budget on every map', () => {
    for (const [map, l] of Object.entries(LIMITS_BY_MAP)) {
      setLimits(map as keyof typeof LIMITS_BY_MAP);
      const g = createGate();
      let applied = 0;
      for (let t = 0; t < l.maxTicks; t++) {
        // a move every 4th offer as well, so any mix of kites and moves is covered
        const c: Command = t % 9 === 0 ? { op: Op.Move, x: 10000 + (t % 50000), y: 30000 } : { op: Op.Kite, x: 10000 + (t % 50000), y: 30000, id: 3 };
        if (gateCommand(g, t, [c])) applied++;
      }
      // never refused for the budget (spend() failing drops the command), with room left for 60 pings (600 B) and Fire (60 B)
      expect(applied, map).toBeGreaterThan(l.maxTicks / KITE_MIN_GAP - 10);
      expect(g.bytes + 600 + 60, map).toBeLessThanOrEqual(l.maxInputBytes);
    }
    setLimits('crossing');
  });
});

describe('KITE-FIX: moving between basic attacks', () => {
  for (const hero of ['rocket', 'clem'] as const) {
    it(`${hero}: ATK held + stick straight away from a chasing target walks at full damage`, () => {
      const base = run(hero, stand);
      const away = run(hero, kiteStick(() => Math.PI), chaser);
      // the timer is never lost: as many swings as standing still (one short at most, the first chase step)
      expect(away.hits).toBeGreaterThanOrEqual(base.hits - 1);
      expect(base.hits).toBeGreaterThanOrEqual(Math.floor(TICKS / base.every) - 1);
      // and the hero walks between them (standing still it walks 0)
      expect(away.walked).toBeGreaterThan(4000);
    });
    it(`${hero}: ATK held + stick strafing beside a target standing still keeps every swing`, () => {
      const base = run(hero, stand);
      // up and down 0.5 s each: the target stays within reach
      const strafe = run(hero, kiteStick((t) => (Math.floor(t / 15) % 2 === 0 ? Math.PI / 2 : -Math.PI / 2)));
      expect(strafe.hits).toBeGreaterThanOrEqual(base.hits - 1);
      expect(strafe.walked).toBeGreaterThan(4000);
    });
  }
  it('a target out of reach is not chased: the stick wins, and the swing goes again once it is in reach', () => {
    const m = heroMatch(['rocket', 'clem', 'clem', 'clem', 'clem', 'clem']);
    for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
    hold(m, 1, 2, 4, 5, FOE);
    const w = m.world;
    place(m, ME, X0, Y, 0);
    place(m, FOE, X0 + 15000, Y, 0);
    applyOrder(m, ME, { op: Op.Kite, x: X0, y: Y - 4000, id: FOE });
    for (let t = 0; t < 20; t++) step(m);
    expect(w.order[ME]).toBe(Order.Kite);
    expect(w.windup[ME]).toBe(0);
    expect(w.x[ME]).toBe(X0); // walked the stick's way (-y), never toward the target (+x)
    expect(w.y[ME]).toBeLessThan(Y - 1000);
    // the target walks into reach: the next tick the timer allows, the hero swings
    place(m, FOE, w.x[ME] + attackRange(w, ME), w.y[ME], 0);
    step(m);
    expect(w.windup[ME] > 0 || w.state[ME] === UnitState.Attacking).toBe(true);
  });
  it('a re-sent kite on the same unit keeps the windup; another unit or a Move cancels it and gives the timer back', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'rocket', 'clem', 'clem']);
    for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
    hold(m, 1, 2, 4, 5);
    const w = m.world;
    place(m, ME, X0, Y, 0);
    place(m, FOE, X0 + attackRange(w, ME), Y, 0);
    place(m, 4, X0 + attackRange(w, ME), Y + 1000, 0);
    w.attackTimer[4] = 0;
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    step(m);
    expect(w.windup[ME]).toBeGreaterThan(1);
    const timer = w.attackTimer[ME];
    applyOrder(m, ME, { op: Op.Kite, x: X0 - 3000, y: Y, id: FOE });
    expect(w.windup[ME]).toBeGreaterThan(0);
    expect(w.attackTimer[ME]).toBe(timer);
    expect(w.order[ME]).toBe(Order.Kite);
    applyOrder(m, ME, { op: Op.Kite, x: X0 - 3000, y: Y, id: 4 });
    expect(w.windup[ME]).toBe(0);
    expect(w.attackTimer[ME]).toBe(0);
    // a plain Move mid-windup still cancels (v20 rule)
    applyOrder(m, ME, { op: Op.Attack, id: FOE });
    step(m);
    expect(w.windup[ME]).toBeGreaterThan(1);
    applyOrder(m, ME, { op: Op.Move, x: X0 - 3000, y: Y });
    expect(w.windup[ME]).toBe(0);
    expect(w.attackTimer[ME]).toBe(0);
  });
  it('a kite on a unit that is gone is a plain move', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'rocket', 'clem', 'clem']);
    const w = m.world;
    place(m, ME, X0, Y, 0);
    applyOrder(m, ME, { op: Op.Kite, x: X0 - 3000, y: Y, id: 200 });
    expect(w.order[ME]).toBe(Order.Move);
    expect(w.target[ME]).toBe(-1);
  });
});

describe('KITE-FIX: determinism', { timeout: 120000 }, () => {
  /** Random commands with kites mixed in (a quarter of them), through record and replay. */
  function playKites(seed: number, ticks: number) {
    const { picks, tricks } = fillPicks(seed, 'rocket', 'pounce');
    const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
    const r = new Rng(seed ^ 0x6b17e);
    for (let t = 0; t < ticks && !result(m); t++) {
      let c = randomCommand(r);
      if (c && r.int(4) === 0) c = { op: Op.Kite, x: r.range(0, 100000), y: r.range(0, 60000), id: r.int(63) };
      step(m, c ? [c] : []);
    }
    return m;
  }
  it('the same seed and kites give the same hash trail, and the replay matches it', () => {
    for (const seed of [3, 77]) {
      const a = playKites(seed, 3000);
      const b = playKites(seed, 3000);
      expect(hashTrail(a)).toEqual(hashTrail(b));
    }
    const full = playKites(5, 30000);
    const res = result(full);
    expect(res).not.toBeNull();
    const run2 = runReplay(replayRecord(full)!);
    expect(run2.trail).toEqual(hashTrail(full));
    expect(run2.result).toEqual(res);
  });
});
