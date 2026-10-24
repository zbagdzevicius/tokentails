import { describe, expect, it } from 'vitest';
import { easeOut, flipAngle, gait, hump, newGait, poleCurve, polyLength, smooth, springWobble, strideRate, tailCurve } from './anim';

describe('cat animation maths', () => {
  it('stride rate rises with speed and stays readable', () => {
    expect(strideRate(0)).toBeGreaterThan(0);
    expect(strideRate(20)).toBeGreaterThan(strideRate(10));
    expect(strideRate(100)).toBeLessThanOrEqual(9.5);
  });
  it('gait is periodic, bounded and silent at zero amplitude', () => {
    const a = gait(0.3, 1, newGait());
    const b = gait(1.3, 1, newGait());
    expect(a.fl).toBeCloseTo(b.fl, 6);
    expect(a.bob).toBeCloseTo(b.bob, 6);
    for (let ph = 0; ph < 1; ph += 0.05) {
      const g = gait(ph, 1, newGait());
      for (const v of [g.fl, g.fr, g.bl, g.br]) expect(Math.abs(v)).toBeLessThanOrEqual(0.96);
      expect(g.bob).toBeGreaterThanOrEqual(0);
      expect(g.bob).toBeLessThan(0.1);
    }
    const z = gait(0.4, 0, newGait());
    expect(z.fl).toBeCloseTo(0);
    expect(z.pitch).toBeCloseTo(0);
    expect(z.bob).toBeCloseTo(0);
  });
  it('front and back legs move in opposition (bound gait)', () => {
    const g = gait(0.25, 1, newGait());
    expect(Math.sign(g.fl)).not.toBe(Math.sign(g.bl));
  });
  it('the pounce flip turns exactly once', () => {
    expect(flipAngle(0, 0.4)).toBe(0);
    expect(flipAngle(0.2, 0.4)).toBeCloseTo(Math.PI, 5);
    expect(flipAngle(0.4, 0.4)).toBeCloseTo(Math.PI * 2);
    expect(flipAngle(9, 0.4)).toBeCloseTo(Math.PI * 2);
    let prev = -1;
    for (let t = 0; t <= 0.4; t += 0.01) {
      const a = flipAngle(t, 0.4);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
  it('easing helpers clamp to 0..1', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5);
    expect(hump(0)).toBe(0);
    expect(hump(0.5)).toBeCloseTo(1);
    expect(hump(1.2)).toBe(0);
    expect(springWobble(0)).toBeCloseTo(1);
    expect(Math.abs(springWobble(2))).toBeLessThan(0.01);
  });
  it('the tail curve keeps its length and starts at the base', () => {
    const n = 16;
    const out = new Float32Array(n * 3);
    const base: [number, number, number] = [0, 0.1, -0.3];
    tailCurve(base, n, { lift: 0.8, curl: 0.09, sway: 0.1, phase: 1.2, length: 0.78, bend: 0.02, yaw0: 0.9 }, out);
    expect([out[0], out[1], out[2]]).toEqual([0, expect.closeTo(0.1, 5), expect.closeTo(-0.3, 5)]);
    expect(polyLength(out, n)).toBeCloseTo(0.78, 4);
    // a lifted tail rises, a yawed tail leans to the rig's left (+x)
    expect(out[(n - 1) * 3 + 1]).toBeGreaterThan(0.3);
    expect(out[(n - 1) * 3]).toBeGreaterThan(0);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
  it('the vault pole runs from the tail base to the plant point', () => {
    const n = 16;
    const out = new Float32Array(n * 3);
    poleCurve([0, 0.1, -0.3], [0.2, -3, -6], n, 0.1, 0.5, out);
    expect(out[0]).toBeCloseTo(0);
    expect(out[(n - 1) * 3]).toBeCloseTo(0.2);
    expect(out[(n - 1) * 3 + 1]).toBeCloseTo(-3);
    expect(out[(n - 1) * 3 + 2]).toBeCloseTo(-6);
    expect(polyLength(out, n)).toBeGreaterThan(Math.hypot(0.2, 3.1, 5.7) - 0.01);
  });
});
