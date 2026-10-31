/**
 * Sim v11 primitive 19, `stack` (effects/stack.ts): a count held by the victim hero (Duchess's Disdain). Capped at
 * `max`, lasts `ttl` from its last refresh, consumed into a lockout that refuses new stacks, hashed, and cleared on
 * death and respawn.
 */
import { describe, expect, it } from 'vitest';
import { addStack, consumeStack, stacksOf } from '../../src/sim/effects';
import { clearStatus, tickStatus } from '../../src/sim/effects/status';
import { hashWorld, hashedArrays, RANGE } from '../../src/sim/world';
import { heroMatch } from './heroes/kit-helpers';

const V = 3;
const arena = () => heroMatch(['duchess', 'clem', 'sage', 'clem', 'sage', 'clem']);

describe('stack (sim v11 primitive 19)', () => {
  it('adds up to the cap and reports reaching it', () => {
    const w = arena().world;
    expect(addStack(w, V, 1, 3, 120)).toBe(false);
    expect(stacksOf(w, V)).toBe(1);
    expect(addStack(w, V, 1, 3, 120)).toBe(false);
    expect(addStack(w, V, 5, 3, 120)).toBe(true);
    expect(stacksOf(w, V)).toBe(3);
    expect(addStack(w, V, 0, 3, 120)).toBe(false);
  });

  it('lasts ttl ticks from the last refresh, then resets', () => {
    const w = arena().world;
    addStack(w, V, 1, 3, 10);
    for (let i = 0; i < 6; i++) tickStatus(w);
    addStack(w, V, 1, 3, 10);
    for (let i = 0; i < 9; i++) tickStatus(w);
    expect(stacksOf(w, V)).toBe(2);
    tickStatus(w);
    expect(stacksOf(w, V)).toBe(0);
  });

  it('consuming starts a lockout that refuses new stacks until it runs out', () => {
    const w = arena().world;
    addStack(w, V, 3, 3, 120);
    consumeStack(w, V, 5);
    expect(stacksOf(w, V)).toBe(0);
    expect(addStack(w, V, 1, 3, 120)).toBe(false);
    expect(stacksOf(w, V)).toBe(0);
    for (let i = 0; i < 5; i++) tickStatus(w);
    addStack(w, V, 1, 3, 120);
    expect(stacksOf(w, V)).toBe(1);
  });

  it('only heroes carry stacks', () => {
    const w = arena().world;
    expect(addStack(w, RANGE.minions, 1, 3, 120)).toBe(false);
    expect(stacksOf(w, RANGE.minions)).toBe(0);
  });

  it('is hashed: the count, the timer and the lockout each change the world hash', () => {
    const w = arena().world;
    const arrays = hashedArrays(w);
    for (const a of [w.mkStack, w.mkT, w.mkLock]) expect(arrays).toContain(a);
    const h0 = hashWorld(w);
    addStack(w, V, 1, 3, 120);
    const h1 = hashWorld(w);
    expect(h1).not.toBe(h0);
    consumeStack(w, V, 60);
    expect(hashWorld(w)).not.toBe(h1);
  });

  it('death and respawn clear the stacks and the lockout', () => {
    const w = arena().world;
    addStack(w, V, 2, 3, 120);
    clearStatus(w, V);
    expect([w.mkStack[V], w.mkT[V], w.mkLock[V]]).toEqual([0, 0, 0]);
    consumeStack(w, V, 60);
    clearStatus(w, V);
    expect(w.mkLock[V]).toBe(0);
  });
});
