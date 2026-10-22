import { describe, expect, it } from 'vitest';
import { camAt, ease, orbit, rampAt, rampTicks, scaleRamp } from './director.ts';

describe('trailer director', () => {
  it('eases from 0 to 1 and snaps within 6 frames', () => {
    for (const e of ['linear', 'ease', 'in', 'out', 'snap']) {
      expect(ease(e, 0)).toBeCloseTo(0);
      expect(ease(e, 1)).toBeCloseTo(1);
    }
    expect(ease('snap', 6 / 30, 30)).toBeCloseTo(1);
    expect(ease('hold', 0.99)).toBe(0);
  });

  it('holds camera fields between keys and cuts on a hold key', () => {
    const keys = [{ f: 0, dist: 0.5, pitch: 30 }, { f: 10, dist: 1 }, { f: 20, dist: 2, ease: 'hold' }];
    expect(camAt(keys, 5).dist).toBeCloseTo(0.75);
    expect(camAt(keys, 5).pitch).toBe(30);
    expect(camAt(keys, 19).dist).toBe(1);
    expect(camAt(keys, 20).dist).toBe(2);
  });

  it('integrates the ramp and scales one segment only', () => {
    const r = [[0, 0], [3, 0], [4, 0.2], [29, 1, 'out']];
    expect(rampAt(r, 2)).toBe(0);
    expect(rampAt(r, 29)).toBe(1);
    expect(rampTicks([[0, 1]], 0, 60)).toBe(30);
    const s = scaleRamp([[0, 1], [10, 1], [20, 1]], 5, 10, 2);
    expect(rampAt(s, 2)).toBe(1);
    expect(rampAt(s, 7)).toBeCloseTo(2);
    expect(rampAt(s, 15)).toBe(1);
  });

  it('orbits: yaw 0 looks north from the south, pitch raises the camera', () => {
    const p = orbit({ x: 0, y: 0, z: 0 }, 10, 90, 0);
    expect(p.y).toBeCloseTo(10);
    const q = orbit({ x: 0, y: 0, z: 0 }, 10, 0, 0);
    expect(q.z).toBeCloseTo(10);
  });
});
