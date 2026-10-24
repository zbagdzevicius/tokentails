import { describe, expect, it } from 'vitest';
import { CHAIN_WINDOW, ComboChain, FREE_TIER } from './chain';

describe('combo chain', () => {
  it('adds weights, reports tier-ups once, tracks the best chain', () => {
    const c = new ComboChain();
    expect(c.add(3)).toBe(0);
    expect(c.add(2)).toBe(1); // 5 = NICE!
    expect(c.add(1)).toBe(0);
    expect(c.add(4)).toBe(2); // 10
    expect(c.add(0)).toBe(0);
    expect(c.add(Number.NaN)).toBe(0);
    expect(c.n).toBe(10);
    expect(c.bestChain).toBe(10);
  });
  it('the window is 3 s, refreshed by every event and held while airborne', () => {
    const c = new ComboChain();
    c.add(5);
    expect(c.tick(2, false)).toBeNull();
    c.add(1); // refresh
    expect(c.tick(2.5, false)).toBeNull();
    expect(c.tick(10, true)).toBeNull(); // airborne: held
    expect(c.fraction).toBeCloseTo(0.5 / CHAIN_WINDOW);
    const b = c.tick(0.6, false);
    expect(b).toEqual({ n: 6, tier: 1, points: 90 });
    expect(c.n).toBe(0);
    expect(c.stylePoints).toBe(90);
    expect(c.tick(5, false)).toBeNull();
  });
  it('a break loses the chain and banks nothing', () => {
    const c = new ComboChain();
    c.add(30);
    expect(c.break()).toBe(30);
    expect(c.stylePoints).toBe(0);
    expect(c.bestChain).toBe(30);
    expect(c.bank()).toBeNull();
  });
  it('banks at the finish with the tier multiplier', () => {
    const c = new ComboChain();
    c.add(36);
    c.add(4); // 40: tier 4
    expect(c.bank()).toEqual({ n: 40, tier: 4, points: 1200 });
    c.addStyle(500);
    expect(c.stylePoints).toBe(1700);
    c.resetRun();
    expect([c.n, c.bestChain, c.stylePoints, c.tricks]).toEqual([0, 0, 0, 0]);
  });
  it('pickups alone stop at CLAW-SOME!; each stylish add climbs one tier past it', () => {
    const c = new ComboChain();
    for (let i = 0; i < 400; i++) c.add(0.25, false); // 100 links of fish
    expect(c.links).toBe(100);
    expect(c.tier).toBe(FREE_TIER);
    expect(c.add(2)).toBe(4); // a near miss: FUR-OCIOUS!
    expect(c.add(1, false)).toBe(0);
    expect(c.add(2)).toBe(5);
    expect(c.add(2)).toBe(6);
    expect(c.bestChain).toBe(107);
    // a fish line is about 2-3 links
    const d = new ComboChain();
    for (let i = 0; i < 10; i++) d.add(0.25, false);
    expect(d.links).toBe(2);
    expect(d.tier).toBe(0);
  });
  it('force jumps to a chain length (test hook)', () => {
    const c = new ComboChain();
    expect(c.force(25)).toBe(3);
    expect(c.fraction).toBe(1);
    expect(c.add(10)).toBe(4);
  });
});
