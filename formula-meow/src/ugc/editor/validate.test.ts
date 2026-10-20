import { describe, expect, it } from 'vitest';
import type { TrackDef, TrackPoint } from '../../types';
import { TRACKS } from '../../core/track/tracks';
import { ovalTrack } from '../../test/fixtures';
import { validateTrack, lapsFor } from './validate';
import { doodleToPoints, sampleToS, sToSample, starterFeatures, type P2 } from './doodle';
import { decodeTrackCode, encodeTrack } from '../codec/track-code';

const withItems = (def: TrackDef): TrackDef => ({ ...def, features: [...def.features, { s: 120, kind: 'items' }] });

function ring(r: number, n = 20, cx = 0, cz = 0): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.round((cx + Math.cos(a) * r) / 4) * 4, z: Math.round((cz + Math.sin(a) * r) / 4) * 4, h: 0, w: 2 });
  }
  return pts;
}

/** A finger stroke in world metres around an ellipse, with a little wobble, ending near its start. */
function stroke(rx: number, rz: number, wobble = 0, gap = 0.04): P2[] {
  const out: P2[] = [];
  const steps = 160;
  for (let i = 0; i <= steps * (1 - gap); i++) {
    const a = (i / steps) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(a * 5);
    out.push({ x: Math.cos(a) * rx * w, z: Math.sin(a) * rz * w });
  }
  return out;
}

const codes = (def: TrackDef) => validateTrack(def).issues.map((i) => i.code);

describe('track validator (GDD 6.4)', () => {
  it('passes every authored track', () => {
    // SIM_VERSION 8: an authored track's set pieces follow the authored rules (setpieces.test.ts)
    for (const def of TRACKS) expect(validateTrack(def, { pieces: 'authored' }).issues, def.id).toEqual([]);
  });

  it('passes the test oval once it has an item row', () => {
    expect(codes(ovalTrack())).toEqual(['items']);
    expect(validateTrack(withItems(ovalTrack())).ok).toBe(true);
  });

  it('fails a loop that is too short or too long', () => {
    const small: TrackDef = { ...withItems(ovalTrack()), points: ring(36) };
    expect(codes(small)).toContain('short');
    const huge: TrackDef = {
      ...withItems(ovalTrack()),
      points: [
        ...ring(124, 32).map((p) => ({ ...p, x: Math.max(-128, Math.min(124, p.x)), z: Math.max(-128, Math.min(124, p.z)) })),
      ],
    };
    // a 124 m ring is ~780 m: fine. Squash a long zigzag instead.
    expect(validateTrack(huge).issues.map((i) => i.code)).not.toContain('long');
    const zig: TrackPoint[] = [];
    for (let i = 0; i < 8; i++) zig.push({ x: -112 + i * 32, z: i % 2 ? 120 : 40, h: 0, w: 0 });
    for (let i = 7; i >= 0; i--) zig.push({ x: -112 + i * 32, z: i % 2 ? -40 : -120, h: 0, w: 0 });
    expect(codes({ ...withItems(ovalTrack()), points: zig })).toContain('long');
  });

  it('fails a figure-eight (the road crosses itself)', () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push({ x: Math.round((Math.sin(a) * 100) / 4) * 4, z: Math.round((Math.sin(2 * a) * 60) / 4) * 4, h: 0, w: 2 });
    }
    const v = validateTrack({ ...withItems(ovalTrack()), points: pts });
    expect(v.issues.map((i) => i.code)).toContain('overlap');
    const o = v.issues.find((i) => i.code === 'overlap')!;
    expect(o.from).toBeTypeOf('number');
    expect(o.message).toMatch(/touch/);
  });

  it('fails parallel roads that run too close', () => {
    // a long thin U: the two legs are 16 m apart centre to centre
    const pts: TrackPoint[] = [
      { x: -100, z: -8, h: 0, w: 2 },
      { x: -40, z: -8, h: 0, w: 2 },
      { x: 20, z: -8, h: 0, w: 2 },
      { x: 80, z: -8, h: 0, w: 2 },
      { x: 108, z: 0, h: 0, w: 2 },
      { x: 80, z: 8, h: 0, w: 2 },
      { x: 20, z: 8, h: 0, w: 2 },
      { x: -40, z: 8, h: 0, w: 2 },
      { x: -100, z: 8, h: 0, w: 2 },
      { x: -120, z: 0, h: 0, w: 2 },
    ];
    expect(codes({ ...withItems(ovalTrack()), points: pts })).toContain('overlap');
  });

  it('fails a hairpin tighter than 9 m and a wall-like climb', () => {
    const def = withItems(ovalTrack());
    const sharp = { ...def, points: def.points.map((p, i) => (i === 3 ? { ...p, x: -60, z: 124 } : i === 4 ? { ...p, x: 60, z: 124 } : p)) };
    sharp.points.splice(4, 0, { x: 0, z: 40, h: 0, w: 3 });
    expect(codes(sharp)).toContain('tight');
    const steep = { ...def, points: [def.points[0], { x: -40, z: -76, h: 7, w: 3 as const }, ...def.points.slice(1)] };
    expect(codes(steep)).toContain('steep');
  });

  it('needs exactly one start on a straight, an item row, and ramps off the corners', () => {
    const def = TRACKS[0];
    expect(codes({ ...def, features: def.features.filter((f) => f.kind !== 'start') })).toContain('start');
    expect(codes({ ...def, features: [...def.features, { s: 60, kind: 'start' }] })).toContain('start');
    // the Kitchen hairpin: a start there has no room for the grid, a ramp there launches into the bend
    const t = validateTrack(def).built!;
    let tight = 0;
    for (let i = 0; i < t.n; i++) if (Math.abs(t.curv[i]) > Math.abs(t.curv[tight])) tight = i;
    const bendS = sampleToS(def, t, tight);
    const bent = { ...def, features: def.features.map((f) => (f.kind === 'start' ? { ...f, s: bendS } : f)) };
    expect(codes(bent)).toContain('startBend');
    const ramp = { ...def, features: [...def.features, { s: bendS, kind: 'ramp' as const, side: 0 as const }] };
    expect(codes(ramp)).toContain('rampBend');
    expect(codes({ ...def, features: [...def.features, { s: 30, kind: 'ramp', side: 0 }] })).not.toContain('rampBend');
  });

  it('rejects off-grid, out-of-range and duplicate points', () => {
    const def = withItems(ovalTrack());
    expect(codes({ ...def, points: def.points.map((p, i) => (i === 0 ? { ...p, x: -41 } : p)) })).toContain('grid');
    expect(codes({ ...def, points: def.points.map((p, i) => (i === 0 ? { ...p, x: 200 } : p)) })).toContain('grid');
    expect(codes({ ...def, points: [def.points[0], ...def.points] })).toContain('grid');
    expect(codes({ ...def, points: def.points.slice(0, 6) })).toContain('points');
  });

  it('uses 5 laps under 450 m', () => {
    expect(lapsFor(449)).toBe(5);
    expect(lapsFor(450)).toBe(3);
  });
});

describe('Track Doodle (GDD 6.4 step 1)', () => {
  it('turns a rough closed stroke into a drivable, shareable track', () => {
    for (const [rx, rz, wob] of [
      [90, 60, 0],
      [60, 110, 0.12],
      [30, 20, 0.05], // small drawing: scaled up to a raceable length
      [140, 40, 0.1], // too wide: fitted into the map
    ] as const) {
      const d = doodleToPoints(stroke(rx, rz, wob));
      expect(d.ok).toBe(true);
      if (!d.ok) continue;
      expect(d.points.length).toBeGreaterThanOrEqual(12);
      expect(d.points.length).toBeLessThanOrEqual(24);
      for (const p of d.points) {
        expect(Math.abs(p.x % 4)).toBe(0);
        expect(Math.abs(p.z % 4)).toBe(0);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(128);
      }
      const def = starterFeatures(d.points, 0);
      const v = validateTrack(def);
      expect(v.issues, `${rx}x${rz}`).toEqual([]);
      const back = decodeTrackCode(encodeTrack({ ...def, name: 'Doodle' }));
      expect(back.ok).toBe(true);
    }
  });

  it('refuses an open stroke and a scribble', () => {
    expect(doodleToPoints(stroke(90, 60, 0, 0.3))).toEqual({ ok: false, reason: 'open' });
    expect(doodleToPoints([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual({ ok: false, reason: 'tiny' });
  });

  it('maps sticker positions both ways', () => {
    const def = TRACKS[0];
    const t = validateTrack(def).built!;
    for (const f of def.features) {
      const i = sToSample(def, t, f.s);
      expect(Math.abs(sampleToS(def, t, i) - f.s)).toBeLessThanOrEqual(1);
    }
  });
});
