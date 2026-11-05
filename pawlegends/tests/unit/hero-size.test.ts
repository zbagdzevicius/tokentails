import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { HERO_BUILD, HERO_HEIGHT, HERO_TOP, makeHero } from '../../src/render/chars';
import { heroBodyScale, heroScale, heroTop, heroY, REF_HEIGHT } from '../../src/render/chars/visualSize';
import { HERO_RING, HERO_SCALE } from '../../src/render/views/models';
import { bodyRadius, layoutBodies, SEPARATION } from '../../src/render/views/heroView';

describe('per-hero visual size (render only)', () => {
  it('every hero has a build within the outline-safe girth band', () => {
    for (const h of HERO_IDS) {
      const b = HERO_BUILD[h];
      expect(b.w).toBeGreaterThanOrEqual(0.85);
      expect(b.w).toBeLessThanOrEqual(1.25);
      expect(b.h).toBeGreaterThan(0.8);
      expect(b.h).toBeLessThan(1.2);
      expect(HERO_RING[h]).toBe(b.ring);
    }
  });
  it('the drawn range is wide: tiny Pixel to big tanks (≥ 1.7× top to top)', () => {
    const tops = HERO_IDS.map((h) => HERO_TOP[h]);
    expect(Math.max(...tops) / Math.min(...tops)).toBeGreaterThan(1.7);
    expect(HERO_HEIGHT.pixel).toBeLessThan(HERO_HEIGHT.clem);
    expect(HERO_HEIGHT.brutus).toBeGreaterThan(HERO_HEIGHT.clem);
  });
  it('overhead plates sit above the scaled top', () => {
    for (const h of HERO_IDS) expect(HERO_SCALE[h] * 1.62).toBeGreaterThan(HERO_TOP[h]);
  });
  it('girth goes on the mesh width and depth only', () => {
    const c = makeHero('meatball', 0, null);
    expect(c.inner.scale.y).toBeCloseTo(HERO_HEIGHT.meatball, 5);
    expect(c.inner.scale.x).toBeCloseTo(HERO_HEIGHT.meatball * HERO_BUILD.meatball.w, 5);
    expect(c.height).toBe(HERO_HEIGHT.meatball);
    c.dispose();
  });
  it('anchor helpers: identity for the reference body and non-heroes', () => {
    expect(heroY(null, 0.9)).toBe(0.9);
    expect(heroScale(undefined)).toBe(1);
    expect(heroTop(null)).toBe(REF_HEIGHT);
    expect(heroY('clem', 0.9)).toBeCloseTo(0.9, 5);
    expect(heroY('pixel', 0.9)).toBeLessThan(0.9);
    expect(heroY('brutus', 0.9)).toBeGreaterThan(0.9);
    expect(heroBodyScale('meatball')).toBeGreaterThan(heroScale('meatball'));
  });
  it('push-apart keeps a wider gap for big bodies, the old gap for two Clems', () => {
    expect(bodyRadius('clem') * 2).toBeCloseTo(SEPARATION.min, 1);
    const pts = [{ x: 0, z: 0 }, { x: 1.4, z: 0 }];
    const gap = (r: number[] | null): number => {
      const o = layoutBodies(pts, [], null, SEPARATION.min, SEPARATION.cap, r);
      return pts[1].x + o[1].x - (pts[0].x + o[0].x);
    };
    const clems = gap([bodyRadius('clem'), bodyRadius('clem')]);
    const tanks = gap([bodyRadius('meatball'), bodyRadius('brutus')]);
    expect(tanks).toBeGreaterThan(clems);
    expect(gap(null)).toBeCloseTo(clems, 1);
  });
});
