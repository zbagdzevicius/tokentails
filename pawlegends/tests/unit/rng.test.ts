import { describe, expect, it } from 'vitest';
import { Rng, forkSeed } from '../../src/sim/rng';

describe('mulberry32 Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const c = new Rng(124);
    const sa = Array.from({ length: 16 }, () => a.next());
    expect(Array.from({ length: 16 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 16 }, () => c.next())).not.toEqual(sa);
  });
  it('matches the reference mulberry32 sequence', () => {
    // Reference: the canonical JS mulberry32 (seed 1).
    const ref = (seed: number) => {
      let a = seed;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (t ^ (t >>> 14)) >>> 0;
      };
    };
    const r = ref(1);
    const ours = new Rng(1);
    for (let i = 0; i < 100; i++) expect(ours.next()).toBe(r());
  });
  it('int and range stay in bounds and cover them', () => {
    const r = new Rng(9);
    const seen = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen[v]++;
    }
    for (const n of seen) expect(n).toBeGreaterThan(800);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-3, 3);
      expect(v >= -3 && v <= 3).toBe(true);
    }
  });
  it('fork depends on the root seed and label only, not on draws', () => {
    const a = new Rng(55);
    const before = a.fork('picks').next();
    a.next();
    a.next();
    expect(a.fork('picks').next()).toBe(before);
    expect(a.fork('coin').next()).not.toBe(before);
    expect(forkSeed(55, 'picks')).toBe(forkSeed(55, 'picks'));
    expect(forkSeed(55, 'picks')).not.toBe(forkSeed(56, 'picks'));
  });
  it('chanceBp is roughly calibrated', () => {
    const r = new Rng(77);
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.chanceBp(2500)) hits++;
    expect(hits).toBeGreaterThan(4500);
    expect(hits).toBeLessThan(5500);
  });
});
