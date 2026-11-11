/** LATENCY-PLAN N1: predicted action start (src/net/predict-action.ts). */
import { describe, expect, it } from 'vitest';
import { ActionPredictor, canPredict, confirmWindowMs } from '../../src/net/predict-action';
import { STALL_MS } from '../../src/net/predict';
import { BuffFlag, Op, type Command, type EntitySnap, type SimEvent } from '../../src/sim/api';

const hero = (o: Partial<EntitySnap> = {}): EntitySnap =>
  ({ id: 0, kind: 'hero', team: 0, slot: 0, hero: 'clem', x: 0, y: 0, hp: 500, maxHp: 500, shield: 0, state: 'idle', facing: 0, buffs: 0, cooldowns: [0, 0, 0, 0, 0], ...o }) as EntitySnap;
const castQ: Command = { op: Op.Cast, slot: 0, x: 1000, y: 2000, id: 255 };
const trick: Command = { op: Op.Trick, x: 10, y: 20 };
const attack: Command = { op: Op.Attack, id: 7 };
const windup = (slot: number, src = 0): SimEvent => ({ type: 'windup', tick: 100, src, slot: slot as 0, x: 0, y: 0, ticks: 6 });
const cast = (slot: number, src = 0): SimEvent => ({ type: 'cast', tick: 106, src, slot: slot as 0, x: 0, y: 0 }) as SimEvent;

describe('canPredict', () => {
  it('a ready, free hero: cast, trick and attack', () => {
    expect(canPredict(hero(), castQ)).toBe(true);
    expect(canPredict(hero(), trick)).toBe(true);
    expect(canPredict(hero(), attack)).toBe(true);
  });

  it('never for a move, stop or ping', () => {
    expect(canPredict(hero(), { op: Op.Move, x: 0, y: 0 })).toBe(false);
    expect(canPredict(hero(), { op: Op.Stop })).toBe(false);
  });

  it('locked or dead returns nothing', () => {
    expect(canPredict(hero({ state: 'dead', hp: 0 }), castQ)).toBe(false);
    expect(canPredict(hero({ hp: 0 }), castQ)).toBe(false);
    expect(canPredict(hero({ state: 'napping' }), castQ)).toBe(false);
    expect(canPredict(hero({ buffs: BuffFlag.Stunned }), castQ)).toBe(false);
    expect(canPredict(hero({ buffs: BuffFlag.Feared }), attack)).toBe(false);
    expect(canPredict(hero({ charmed: true }), trick)).toBe(false);
    expect(canPredict(hero({ channel: true }), castQ)).toBe(false);
    expect(canPredict(null, castQ)).toBe(false);
  });

  it('a slot on cooldown, or no cooldown table, is never predicted', () => {
    expect(canPredict(hero({ cooldowns: [12, 0, 0, 0, 0] }), castQ)).toBe(false);
    expect(canPredict(hero({ cooldowns: [0, 0, 0, 0, 30] }), trick)).toBe(false);
    expect(canPredict(hero({ cooldowns: undefined }), castQ)).toBe(false);
    // a rooted hero can still cast
    expect(canPredict(hero({ buffs: BuffFlag.Rooted }), castQ)).toBe(true);
  });
});

describe('ActionPredictor', () => {
  it('start: shown on the next frame, once', () => {
    const a = new ActionPredictor();
    const p = a.start(castQ, hero(), 0)!;
    expect(p).toMatchObject({ kind: 'cast', slot: 0, x: 1000, y: 2000, state: 'pending' });
    const shown = a.takeShown();
    expect(shown).toEqual([p]);
    expect(p.state).toBe('shown');
    expect(a.takeShown()).toEqual([]);
  });

  it('confirm: the own windup or cast of that slot inside the window; another hero or slot does not', () => {
    const a = new ActionPredictor();
    a.start(castQ, hero(), 0);
    a.takeShown();
    expect(a.confirm([windup(0, 3), windup(1)], 0)).toEqual([]);
    const c = a.confirm([windup(0)], 0);
    expect(c).toHaveLength(1);
    expect(c[0].state).toBe('confirmed');
    // the cast that follows the windup finds nothing left to confirm: never a second start
    expect(a.confirm([cast(0)], 0)).toEqual([]);
    a.expire(10_000, confirmWindowMs(100));
    expect(a.takeCancelled()).toEqual([]);
  });

  it('a confirmed cast does not restart, and a second press while pending is not a second prediction', () => {
    const a = new ActionPredictor();
    expect(a.start(castQ, hero(), 0)).not.toBeNull();
    expect(a.start(castQ, hero(), 30)).toBeNull();
    a.takeShown();
    a.confirm([cast(0)], 0);
    expect(a.size).toBe(0);
    expect(a.takeShown()).toEqual([]);
  });

  it('cancel: no sim event within the input latency + STALL_MS fades it out, once', () => {
    const a = new ActionPredictor();
    const p = a.start(castQ, hero(), 1000)!;
    a.takeShown();
    const w = confirmWindowMs(120);
    expect(w).toBe(120 + STALL_MS);
    a.expire(1000 + w, w);
    expect(a.takeCancelled()).toEqual([]);
    a.expire(1000 + w + 1, w);
    expect(a.takeCancelled()).toEqual([p]);
    expect(p.state).toBe('cancelled');
    expect(a.takeCancelled()).toEqual([]);
    // a late sim event no longer confirms it
    expect(a.confirm([windup(0)], 0)).toEqual([]);
  });

  it('an attack is confirmed by the own basic hit', () => {
    const a = new ActionPredictor();
    a.start(attack, hero(), 0);
    const hit = { type: 'hit', tick: 1, src: 0, dst: 7, amount: 30, kind: 'basic' } as unknown as SimEvent;
    expect(a.confirm([hit], 0)).toHaveLength(1);
  });

  it('reset (death, rejoin) cancels what is drawn', () => {
    const a = new ActionPredictor();
    const p = a.start(trick, hero(), 0)!;
    a.takeShown();
    a.reset();
    expect(a.takeCancelled()).toEqual([p]);
    expect(a.size).toBe(0);
  });
});
