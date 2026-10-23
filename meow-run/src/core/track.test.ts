import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PathBuilder } from './path';
import { newFrame, Track } from './track';

const build = (fn: (b: PathBuilder) => void) => {
  const t = new Track();
  fn(new PathBuilder(t, { x: 0, y: 0, z: 0, heading: 0, width: 10 }));
  return t;
};

describe('track', () => {
  it('a straight run is exactly its length and points along +z', () => {
    const t = build((b) => b.straight(100));
    expect(t.length).toBe(100);
    const f = t.sample(50, newFrame());
    expect(f.pos.z).toBeCloseTo(50, 5);
    expect(f.fwd.z).toBeCloseTo(1, 5);
    // + x = runner's right = -world x when facing +z
    expect(f.right.x).toBeCloseTo(-1, 5);
    expect(f.up.y).toBeCloseTo(1, 5);
  });

  it('a 90 degree right turn ends facing -x with the arc length kept', () => {
    const t = build((b) => b.run(Math.PI * 50, { turn: 90 })); // quarter circle, radius 100
    expect(t.length).toBeCloseTo(Math.PI * 50, 0);
    const f = t.sample(t.length, newFrame());
    expect(f.fwd.x).toBeCloseTo(-1, 1);
    expect(f.pos.x).toBeCloseTo(-100, 0);
    expect(f.pos.z).toBeCloseTo(100, 0);
  });

  it('frames are orthonormal, also on slopes and banks', () => {
    const t = build((b) => {
      b.run(40, { rise: 15 });
      b.run(40, { bank: 50, turn: -30 });
    });
    const f = newFrame();
    for (let s = 0; s <= t.length; s += 3.3) {
      t.sample(s, f);
      expect(f.fwd.length()).toBeCloseTo(1, 4);
      expect(f.right.length()).toBeCloseTo(1, 4);
      expect(f.up.length()).toBeCloseTo(1, 4);
      expect(Math.abs(f.fwd.dot(f.right))).toBeLessThan(0.02);
      expect(Math.abs(f.up.dot(f.right))).toBeLessThan(0.02);
    }
    t.sample(79, f);
    expect(f.bank).toBeCloseTo((50 * Math.PI) / 180, 2);
    // + bank = right side lower
    expect(f.right.y).toBeLessThan(-0.5);
  });

  it('rise is reached and steps stay 1 u long', () => {
    const t = build((b) => b.run(60, { rise: 20 }));
    const a = t.sample(30, newFrame()).pos.clone();
    const b = t.sample(31, newFrame()).pos.clone();
    expect(a.distanceTo(b)).toBeCloseTo(1, 2);
    expect(t.sample(60, newFrame()).pos.y).toBeCloseTo(20, 5);
  });

  it('segments and kinds follow the runs', () => {
    const t = build((b) => {
      b.straight(30);
      b.gap(10);
      b.run(20, { kind: 'bridge' });
      b.straight(5);
    });
    expect(t.segments.map((g) => [g.kind, g.s0, g.s1])).toEqual([
      ['ground', 0, 30],
      ['gap', 30, 40],
      ['bridge', 40, 60],
      ['ground', 60, 65],
    ]);
    expect(t.kindAt(29.9)).toBe('ground');
    expect(t.kindAt(30)).toBe('gap');
    expect(t.kindAt(39.9)).toBe('gap');
    expect(t.kindAt(40)).toBe('bridge');
    expect(t.segmentAt(45).kind).toBe('bridge');
    expect(t.nextSegment(0, 'gap')?.s0).toBe(30);
    expect(t.nextSegment(31, 'gap')).toBeNull();
  });

  it('width eases and toWorld offsets along right and up', () => {
    const t = build((b) => b.run(20, { width: 20 }));
    expect(t.widthAt(0)).toBeCloseTo(10);
    expect(t.widthAt(20)).toBeCloseTo(20);
    const v = t.toWorld(10, 2, 1, new THREE.Vector3());
    expect(v.x).toBeCloseTo(-2, 5);
    expect(v.y).toBeCloseTo(1, 5);
  });

  it('extends past the end straight ahead and fromPoints resamples', () => {
    const t = build((b) => b.straight(10));
    expect(t.sample(15, newFrame()).pos.z).toBeCloseTo(15, 5);
    const p = Track.fromPoints([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 50 },
      { x: 20, y: 0, z: 100 },
    ]);
    expect(p.length).toBeGreaterThan(100);
    expect(p.sample(0, newFrame()).pos.z).toBeCloseTo(0, 3);
  });

  it('trimBefore drops old samples and keeps every query after the cut identical', () => {
    const lay = (b: PathBuilder) => {
      b.run(300, { turn: 40, rise: 6 });
      b.gap(12);
      b.run(400, { turn: -30 });
    };
    const a = build(lay);
    const t = build(lay);
    const before = t.samples;
    t.trimBefore(250);
    expect(t.start).toBe(250);
    expect(t.samples).toBe(before - 250);
    expect(t.length).toBe(a.length);
    for (const s of [250, 260.5, 305, 400, 711.2, a.length]) {
      const fa = a.sample(s, newFrame());
      const ft = t.sample(s, newFrame());
      expect(ft.pos.distanceTo(fa.pos), `s ${s}`).toBeLessThan(1e-9);
      expect(ft.fwd.distanceTo(fa.fwd)).toBeLessThan(1e-9);
      expect(t.kindAt(s)).toBe(a.kindAt(s));
      expect(t.widthAt(s)).toBeCloseTo(a.widthAt(s), 9);
      expect(t.segmentAt(s)).toEqual(a.segmentAt(s));
    }
    expect(t.segments[0].s1).toBeGreaterThan(250);
    // the track keeps growing after a trim (endless): same result as an untrimmed one
    const ta = new Track();
    const tb = new Track();
    const ba = new PathBuilder(ta, { x: 0, y: 0, z: 0, heading: 0, width: 10 });
    const bb = new PathBuilder(tb, { x: 0, y: 0, z: 0, heading: 0, width: 10 });
    ba.run(500, { turn: 25 });
    bb.run(500, { turn: 25 });
    tb.trimBefore(400);
    ba.run(200, { turn: -60 });
    bb.run(200, { turn: -60 });
    expect(tb.length).toBe(ta.length);
    expect(tb.sample(650, newFrame()).pos.distanceTo(ta.sample(650, newFrame()).pos)).toBeLessThan(1e-9);
    expect(tb.segmentAt(650)).toEqual(ta.segmentAt(650));
    t.trimBefore(100); // never un-trims
    expect(t.start).toBe(250);
  });
});
