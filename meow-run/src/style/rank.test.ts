import { describe, expect, it } from 'vitest';
import { FINISH_SLOWMO, NEAR_MISS_SLOWMO, rankFor, slowmoLength, slowmoScale, stylePer100, SWING_ARRIVE, SWING_TIME, swingPose, type SwingPose } from './rank';

describe('style rank', () => {
  it('S/A/B/C from style points per 100 u', () => {
    expect(rankFor(0, 2000)).toBe('C');
    expect(rankFor(5000, 2000)).toBe('B'); // 250 / 100 u
    expect(rankFor(12000, 2000)).toBe('A');
    expect(rankFor(24000, 2000)).toBe('S');
  });
  it('short runs count as 200 u; bad input is safe', () => {
    expect(stylePer100(250, 10)).toBe(125);
    expect(rankFor(250, 10)).toBe('C');
    expect(rankFor(-5, Number.NaN)).toBe('C');
  });
});

describe('slow motion curve', () => {
  it('holds, eases back to 1 and stays under 0.8 s real time', () => {
    for (const s of [NEAR_MISS_SLOWMO, FINISH_SLOWMO]) {
      expect(slowmoScale(s, 0)).toBe(s.k);
      expect(slowmoScale(s, s.hold)).toBe(s.k);
      const mid = slowmoScale(s, s.hold + s.ease / 2);
      expect(mid).toBeGreaterThan(s.k);
      expect(mid).toBeLessThan(1);
      expect(slowmoScale(s, slowmoLength(s))).toBe(1);
      expect(slowmoLength(s)).toBeLessThan(800);
      expect(slowmoScale(s, Number.NaN)).toBe(1);
    }
    expect(NEAR_MISS_SLOWMO).toEqual({ k: 0.35, hold: 280, ease: 180 });
    expect(FINISH_SLOWMO.k).toBe(0.45);
    expect(FINISH_SLOWMO.hold).toBe(600);
  });
});

describe('finish swing', () => {
  it('starts on the chase camera, swings out to the side and ends on a close 3/4 front', () => {
    const p: SwingPose = { angle: 0, dist: 0, height: 0, look: 0, blend: 0 };
    swingPose(0, p);
    expect(p.blend).toBe(0);
    expect(p.angle).toBe(0);
    let peak = 0;
    for (let t = 0; t <= SWING_TIME; t += 0.05) peak = Math.max(peak, swingPose(t, p).angle);
    expect(peak).toBeGreaterThan(60);
    swingPose(SWING_TIME, p);
    expect(p.blend).toBe(1);
    expect(p.angle).toBeGreaterThan(25);
    expect(p.angle).toBeLessThan(50);
    expect(p.dist).toBeLessThan(4.5);
    expect(p.height).toBeLessThan(1.5);
    expect(SWING_TIME).toBeLessThan(2.2);
    // the 3/4 front is reached by SWING_ARRIVE and held until the release
    const at = swingPose(SWING_ARRIVE, p).angle;
    expect(Math.abs(at - swingPose(SWING_TIME, p).angle)).toBeLessThan(0.5);
  });
});
