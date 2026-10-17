import { describe, expect, it } from 'vitest';
import { keysToDir, quantiseStick, sectorOf, stickAngle, STICK_REST, type StickState } from './quantise';
import { stickZoneHit } from './touch';

const R = 100;
/** Stick vector at `deg` (0 = up, clockwise) and fraction `f` of the radius. */
const at = (deg: number, f = 0.8): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * R * f, -Math.cos(a) * R * f];
};
const feed = (s: StickState, deg: number, f = 0.8): StickState => quantiseStick(s, ...at(deg, f), R);

describe('quantiseStick', () => {
  it('maps the 8 sector centres to Dir8 1..8 (N clockwise)', () => {
    for (let d = 0; d < 8; d++) expect(feed(STICK_REST, d * 45).dir).toBe(d + 1);
    expect(stickAngle(0, -1)).toBeCloseTo(0);
    expect(stickAngle(1, 0)).toBeCloseTo(90);
    expect(sectorOf(359)).toBe(1);
  });

  it('starts moving immediately from rest and stops immediately on release', () => {
    const s = feed(STICK_REST, 90);
    expect(s.dir).toBe(3);
    expect(quantiseStick(s, 0, 0, R)).toEqual(STICK_REST);
    expect(quantiseStick(s, 5, 0, R).dir).toBe(0); // inside the dead zone
  });

  it('jitter of ±10° around a sector border never flips the direction', () => {
    // Border between N (0°) and NE (45°) is 22.5°. Start on N, jitter 12.5°..32.5° for many ticks.
    let s = feed(STICK_REST, 0);
    expect(s.dir).toBe(1);
    for (let i = 0; i < 60; i++) {
      s = feed(s, 22.5 + (i % 2 === 0 ? 10 : -10));
      expect(s.dir).toBe(1);
    }
    // And the same from the other side (start NE, jitter around the same border).
    s = feed(STICK_REST, 45);
    for (let i = 0; i < 60; i++) {
      s = feed(s, 22.5 + (i % 3 === 0 ? -10 : 10));
      expect(s.dir).toBe(2);
    }
  });

  it('a new direction needs to be held for 3 ticks', () => {
    let s = feed(STICK_REST, 0); // N
    s = feed(s, 90); // E, tick 1
    expect(s.dir).toBe(1);
    s = feed(s, 90); // tick 2
    expect(s.dir).toBe(1);
    s = feed(s, 90); // tick 3 -> commit
    expect(s.dir).toBe(3);
  });

  it('an interrupted hold restarts the count', () => {
    let s = feed(STICK_REST, 0);
    s = feed(s, 90);
    s = feed(s, 90);
    s = feed(s, 180); // different candidate
    expect(s.dir).toBe(1);
    s = feed(s, 180);
    expect(s.dir).toBe(1);
    s = feed(s, 180);
    expect(s.dir).toBe(5);
  });

  it('speed: < 35 % sneak, > 45 % trot, in between keeps the previous speed', () => {
    let s = feed(STICK_REST, 0, 0.3);
    expect(s.speed).toBe(1);
    s = feed(s, 0, 0.4);
    expect(s.speed).toBe(1); // band keeps sneak
    s = feed(s, 0, 0.5);
    expect(s.speed).toBe(2);
    s = feed(s, 0, 0.4);
    expect(s.speed).toBe(2); // band keeps trot
    s = feed(s, 0, 0.3);
    expect(s.speed).toBe(1);
    expect(feed(STICK_REST, 0, 0.4).speed).toBe(1); // from rest the band starts as sneak
  });
});

describe('keysToDir', () => {
  it('combines held keys into 8 directions; opposite keys cancel', () => {
    expect(keysToDir(true, false, false, false)).toBe(1);
    expect(keysToDir(true, true, false, false)).toBe(2);
    expect(keysToDir(false, true, false, false)).toBe(3);
    expect(keysToDir(false, true, true, false)).toBe(4);
    expect(keysToDir(false, false, true, false)).toBe(5);
    expect(keysToDir(false, false, true, true)).toBe(6);
    expect(keysToDir(false, false, false, true)).toBe(7);
    expect(keysToDir(true, false, false, true)).toBe(8);
    expect(keysToDir(true, false, true, false)).toBe(0);
  });
});

describe('stickZoneHit', () => {
  it('accepts the left 55 % and rejects the 24 px edge strips', () => {
    expect(stickZoneHit(100, 0, 390, 390)).toBe(true);
    expect(stickZoneHit(10, 0, 390, 390)).toBe(false);
    expect(stickZoneHit(250, 0, 390, 390)).toBe(false);
    expect(stickZoneHit(380, 0, 390, 390)).toBe(false);
  });
});
