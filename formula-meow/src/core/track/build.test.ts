import { describe, expect, it } from 'vitest';
import { Modifier, Surface } from '../../types';
import { PHYS, TRACK } from '../../tuning';
import { TRACKS } from './tracks';
import { buildTrack, gridSlot } from './build';
import { queryTrack, type TrackHit } from './query';
import { barrierPoint } from './mesh';

const hit = (): TrackHit => ({ i: 0, s: 0, d: 0, y: 0, surface: Surface.Road });

describe('track build (GDD 6.2)', () => {
  for (const def of TRACKS) {
    describe(def.name, () => {
      const t = buildTrack(def);

      it('has an authored-length lap with even 0.5 m samples', () => {
        expect(t.length).toBeGreaterThan(640);
        expect(t.length).toBeLessThan(900);
        expect(Math.abs(t.step - TRACK.sample)).toBeLessThan(0.02);
        let sum = 0;
        for (let i = 0; i < t.n; i++) {
          const j = (i + 1) % t.n;
          sum += Math.hypot(t.px[j] - t.px[i], t.pz[j] - t.pz[i]);
        }
        expect(Math.abs(sum - t.length) / t.length).toBeLessThan(0.01);
      });

      it('passes the validator geometry rules: radius ≥ 9 m, climbs ≤ 25 %, no overlap between parts of the loop', () => {
        expect(t.minRadius).toBeGreaterThanOrEqual(9);
        expect(t.maxClimb).toBeLessThanOrEqual(0.25);
        let minGap = Infinity;
        for (let i = 0; i < t.n; i += 2)
          for (let j = i + 2; j < t.n; j += 2) {
            const sep = Math.min(j - i, t.n - (j - i)) * t.step;
            if (sep < 60) continue;
            const gap = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]) - Math.max(t.wallL[i], t.wallR[i]) - Math.max(t.wallL[j], t.wallR[j]);
            minGap = Math.min(minGap, gap);
          }
        expect(minGap).toBeGreaterThan(2);
      });

      it('banks within ±12° and keeps the racing line inside the road', () => {
        for (let i = 0; i < t.n; i++) {
          expect(Math.abs(t.bank[i])).toBeLessThanOrEqual(TRACK.maxBank + 1e-9);
          expect(Math.abs(t.line[i])).toBeLessThanOrEqual(t.halfW[i] - 1);
          expect(t.wallL[i]).toBeGreaterThan(t.halfW[i]);
          expect(t.wallR[i]).toBeGreaterThan(t.halfW[i]);
        }
      });

      it('query round-trips (s, d) and reports the surface', () => {
        const h = hit();
        for (let i = 0; i < t.n; i += 37) {
          for (const d of [-4, 0, 3.5]) {
            const x = t.px[i] - t.tz[i] * d;
            const z = t.pz[i] + t.tx[i] * d;
            queryTrack(t, x, z, (i + 5) % t.n, h);
            expect(Math.abs(h.d - d)).toBeLessThan(0.05);
            let ds = Math.abs(h.s - i * t.step);
            ds = Math.min(ds, t.length - ds);
            expect(ds).toBeLessThan(0.3);
          }
          const off = t.halfW[i] + PHYS.curbWidth + 0.2;
          queryTrack(t, t.px[i] - t.tz[i] * off, t.pz[i] + t.tx[i] * off, i, h);
          expect(h.surface).toBe(Surface.Offroad);
        }
        // grid fallback search (no hint) finds the same sample
        queryTrack(t, t.px[100], t.pz[100], -1, h);
        expect(h.i).toBe(100);
      });

      it('has a start grid behind the line, item rows on the road and every feature placed', () => {
        for (let k = 0; k < 8; k++) {
          const g = gridSlot(t, k);
          expect(g.dist).toBeLessThan(0);
          const h = queryTrack(t, g.x, g.z, g.si, hit());
          expect(Math.abs(h.d)).toBeLessThan(t.halfW[h.i]);
        }
        const rows = def.features.filter((f) => f.kind === 'items').length;
        expect(rows).toBeGreaterThan(0);
        expect(t.boxes.length).toBeGreaterThanOrEqual(rows * 4);
        for (const b of t.boxes) {
          const h = queryTrack(t, b.x, b.z, -1, hit());
          expect(Math.abs(h.d)).toBeLessThan(t.halfW[h.i]);
        }
        expect(t.features.length).toBe(def.features.length);
        expect(t.pads.length + t.ramps.length).toBeGreaterThan(0);
      });

      it('the barrier mesh sits on the collision wall, and the kerb band up to it is drivable kerb (B10)', () => {
        const h = hit();
        for (let i = 0; i < t.n; i += 23)
          for (const side of [-1, 1] as const) {
            const [x, , z] = barrierPoint(t, i, side);
            queryTrack(t, x, z, i, h);
            const wall = side > 0 ? t.wallR[h.i] : t.wallL[h.i];
            expect(Math.abs(Math.abs(h.d) - wall)).toBeLessThan(0.1);
            // just inside the kerb's outer edge: still kerb, not off-road
            const kd = side * (t.halfW[i] + PHYS.curbWidth - 0.1);
            queryTrack(t, t.px[i] - t.tz[i] * kd, t.pz[i] + t.tx[i] * kd, i, h);
            expect(h.surface === Surface.Curb || h.surface === Surface.Road).toBe(true);
          }
      });

      it('mirror mode flips the layout', () => {
        const m = buildTrack(def, Modifier.Mirror);
        expect(m.mirrored).toBe(true);
        expect(Math.abs(m.length - t.length)).toBeLessThan(1);
        expect(m.px[50]).toBeCloseTo(-t.px[50], 1);
      });
    });
  }
});
