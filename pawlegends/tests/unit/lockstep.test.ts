/** Party play N5 (MULTIPLAYER.md §4.2): the lockstep runner on a fake clock. */
import { describe, expect, it } from 'vitest';
import { LockstepRunner, MAX_B, TURN_MS } from '../../src/net/lockstep';

const slots = (r: LockstepRunner<number>, from: number, n: number, arrive?: (i: number) => number[]) => {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (const t of arrive?.(i) ?? []) r.push(t);
    out.push(r.due(from + i * TURN_MS));
  }
  return out;
};

describe('LockstepRunner', () => {
  it('B starts at 1: a queued turn steps in the next slot; an empty queue holds', () => {
    const r = new LockstepRunner<number>(0);
    expect(r.B).toBe(1);
    expect(r.due(0)).toEqual([]);
    r.push(0);
    expect(r.due(TURN_MS)).toEqual([0]);
  });

  it('grows B by 1 after more than 2 hold episodes in 5 s, at most one change per 3 s, up to 5', () => {
    const r = new LockstepRunner<number>(0);
    let turn = 0;
    // a turn every other slot: hold, step, hold, step...
    slots(r, 0, 20, (i) => (i % 2 === 0 ? [turn++] : []));
    expect(r.B).toBe(2);
    const at = 20 * TURN_MS;
    slots(r, at, 20, (i) => (i % 3 === 0 ? [turn++] : []));
    expect(r.B).toBeLessThanOrEqual(3);
    // never above MAX_B
    slots(r, 2 * at, 2000, (i) => (i % 7 === 0 ? [turn++] : []));
    expect(r.B).toBeLessThanOrEqual(MAX_B);
  });

  it('shrinks B after 20 s without a hold', () => {
    const r = new LockstepRunner<number>(0);
    r.B = 3;
    let t = 0;
    for (let i = 0; i < 6; i++) r.push(t++);
    // steady arrival: one turn per slot for 25 s
    slots(r, 0, Math.ceil(25_000 / TURN_MS), () => [t++]);
    expect(r.B).toBe(2);
  });

  it('catch-up: queue > B + 2 steps 2 turns per slot (never more than 10 ticks)', () => {
    const r = new LockstepRunner<number>(0);
    for (let i = 0; i < 20; i++) r.push(i);
    expect(r.due(0)).toEqual([0, 1]);
    expect(r.due(TURN_MS).length).toBeLessThanOrEqual(5);
  });

  it('waiting after 500 ms of holding, never while paused by vote', () => {
    const r = new LockstepRunner<number>(0);
    r.due(0);
    expect(r.waiting(400)).toBe(false);
    r.due(600);
    expect(r.waiting(600)).toBe(true);
    const p = new LockstepRunner<number>(0);
    p.paused = true;
    p.due(0);
    p.due(800);
    expect(p.waiting(800)).toBe(false);
  });
});
