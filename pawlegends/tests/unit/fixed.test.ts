import { describe, expect, it } from 'vitest';
import {
  ANGLE_STEPS,
  TRIG_ONE,
  angleDiff,
  applyBp,
  clamp,
  dist2,
  iatan2,
  icos,
  idiv,
  imod,
  isin,
  isqrt,
  moveToward,
  ticksOf,
} from '../../src/sim/fixed';
import { Rng } from '../../src/sim/rng';

describe('idiv / imod', () => {
  it('truncates toward zero like integer division', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(idiv(7, -2)).toBe(-3);
    expect(idiv(-7, -2)).toBe(3);
    expect(idiv(0, 5)).toBe(0);
    expect(imod(-7, 2)).toBe(-1);
  });
  it('is exact near 2^53 where a / b rounds', () => {
    const r = new Rng(42);
    for (let i = 0; i < 20000; i++) {
      const a = (r.next() * 0x200000 + (r.next() >>> 11)) * (r.int(2) ? 1 : -1);
      const b = (r.int(100000) + 1) * (r.int(2) ? 1 : -1);
      const q = idiv(a, b);
      const big = BigInt(a) / BigInt(b);
      expect(BigInt(q)).toBe(big);
    }
  });
  it('throws on zero', () => {
    expect(() => idiv(1, 0)).toThrow(RangeError);
  });
});

describe('isqrt', () => {
  it('is floor(sqrt(n)) across the range', () => {
    const r = new Rng(7);
    const check = (n: number) => {
      const x = isqrt(n);
      expect(BigInt(x) * BigInt(x) <= BigInt(n)).toBe(true);
      expect(BigInt(x + 1) * BigInt(x + 1) > BigInt(n)).toBe(true);
    };
    for (let n = 0; n < 2000; n++) check(n);
    for (let i = 0; i < 5000; i++) check(r.next() * 0x200000 + (r.next() >>> 11));
    check(Number.MAX_SAFE_INTEGER);
    expect(isqrt(-5)).toBe(0);
  });
});

describe('trig tables', () => {
  it('match Math.sin / Math.cos to one unit of Q16', () => {
    for (let a = 0; a < ANGLE_STEPS; a++) {
      const rad = (a * 2 * Math.PI) / ANGLE_STEPS;
      expect(Math.abs(isin(a) - Math.round(Math.sin(rad) * TRIG_ONE))).toBeLessThanOrEqual(1);
      expect(Math.abs(icos(a) - Math.round(Math.cos(rad) * TRIG_ONE))).toBeLessThanOrEqual(1);
    }
    expect(isin(0)).toBe(0);
    expect(isin(1024)).toBe(TRIG_ONE);
    expect(isin(2048)).toBe(0);
    expect(isin(3072)).toBe(-TRIG_ONE);
    expect(icos(0)).toBe(TRIG_ONE);
    expect(isin(-1024)).toBe(-TRIG_ONE);
  });
  it('iatan2 is within one step of Math.atan2', () => {
    const r = new Rng(3);
    for (let i = 0; i < 5000; i++) {
      const dx = r.range(-100000, 100000);
      const dy = r.range(-60000, 60000);
      if (dx === 0 && dy === 0) continue;
      const a = iatan2(dy, dx);
      let want = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * ANGLE_STEPS);
      want = ((want % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
      expect(Math.abs(angleDiff(a, want))).toBeLessThanOrEqual(1);
    }
    expect(iatan2(0, 1)).toBe(0);
    expect(iatan2(1, 0)).toBe(1024);
    expect(iatan2(0, -1)).toBe(2048);
    expect(iatan2(-1, 0)).toBe(3072);
    expect(iatan2(0, 0)).toBe(0);
  });
  it('angleDiff is the shortest signed turn', () => {
    expect(angleDiff(10, 20)).toBe(10);
    expect(angleDiff(4090, 5)).toBe(11);
    expect(angleDiff(5, 4090)).toBe(-11);
  });
});

describe('helpers', () => {
  it('clamp, dist2, applyBp, ticksOf', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(dist2(0, 0, 3000, 4000)).toBe(25000000);
    expect(applyBp(1000, 2500)).toBe(250);
    expect(applyBp(-999, 5000)).toBe(-499);
    // §4.2: 0.75 s → 23, 0.95 s → 29, 1.25 s → 38
    expect(ticksOf(75, 100, 30)).toBe(23);
    expect(ticksOf(95, 100, 30)).toBe(29);
    expect(ticksOf(125, 100, 30)).toBe(38);
  });
  it('moveToward carries the fraction: 4.9 m/s moves exactly 4,900 mm a second', () => {
    const out = new Int32Array(3);
    let x = 0;
    let carry = 0;
    for (let t = 0; t < 30; t++) {
      moveToward(x, 0, 100000, 0, 4900, carry, 30, out);
      x = out[0];
      carry = out[2];
    }
    expect(x).toBe(4900);
    expect(carry).toBe(0);
  });
  it('moveToward arrives without overshoot', () => {
    const out = new Int32Array(3);
    expect(moveToward(0, 0, 100, 50, 5000, 0, 30, out)).toBe(true);
    expect([out[0], out[1], out[2]]).toEqual([100, 50, 0]);
  });
});
