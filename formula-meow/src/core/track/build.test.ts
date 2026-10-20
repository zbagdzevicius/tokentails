import { describe, expect, it } from 'vitest';
import { Modifier, Surface } from '../../types';
import { PHYS, TRACK } from '../../tuning';
import { ALL_TRACKS, ARENAS, TRACKS } from './tracks';
import { buildTrack, gridSlot, outerWall, type BuiltTrack } from './build';
import { queryTrack, type TrackHit } from './query';
import { BARRIER_GAP, barrierPoint } from './mesh';
import { branchClear, inWindow } from './branch';
import { ovalTrack } from '../../test/fixtures';

const hit = (): TrackHit => ({ i: 0, s: 0, d: 0, y: 0, surface: Surface.Road });

/** Main samples where the plain one-road rules do not apply: a branch's window or an open bridge. */
const special = (t: BuiltTrack, i: number): boolean => t.voidMask[i] === 1 || t.junction[i] !== 0 || t.branches.some((b) => inWindow(t, b, i));

describe('track build (GDD 6.2)', () => {
  for (const def of TRACKS) {
    describe(def.name, () => {
      const t = buildTrack(def);

      it('has a 850–1100 m lap (iteration 2: ~35–40 s at 100cc) with even 0.5 m samples', () => {
        expect(t.length).toBeGreaterThan(840);
        expect(t.length).toBeLessThan(1100);
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
            const gap = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]) - outerWall(t, i) - outerWall(t, j);
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
          if (special(t, i)) continue;
          for (const d of [-4, 0, 3.5]) {
            const x = t.px[i] - t.tz[i] * d;
            const z = t.pz[i] + t.tx[i] * d;
            queryTrack(t, x, z, (i + 5) % t.n, h);
            expect(Math.abs(h.d - d)).toBeLessThan(0.05);
            let ds = Math.abs(h.s - i * t.step);
            ds = Math.min(ds, t.length - ds);
            expect(ds).toBeLessThan(0.3);
            expect(h.branch).toBe(-1);
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
          expect(special(t, g.si)).toBe(false);
        }
        const rows = def.features.filter((f) => f.kind === 'items').length;
        expect(rows).toBeGreaterThanOrEqual(2);
        expect(t.boxes.length).toBeGreaterThanOrEqual(rows * 4);
        for (const b of t.boxes) {
          const h = queryTrack(t, b.x, b.z, -1, hit());
          expect(Math.abs(h.d)).toBeLessThan(t.halfW[h.i]);
        }
        expect(t.features.length).toBe(def.features.length);
        expect(t.ramps.length).toBeGreaterThanOrEqual(2);
      });

      it('the barrier mesh sits just outside the collision wall (BARRIER_GAP), and the kerb band up to it is drivable kerb (B10)', () => {
        const h = hit();
        for (let i = 0; i < t.n; i += 23)
          for (const side of [-1, 1] as const) {
            if (special(t, i)) continue;
            const [x, , z] = barrierPoint(t, i, side);
            queryTrack(t, x, z, i, h);
            const wall = side > 0 ? t.wallR[h.i] : t.wallL[h.i];
            expect(Math.abs(Math.abs(h.d) - wall - BARRIER_GAP)).toBeLessThan(0.1);
            const kd = side * (t.halfW[i] + PHYS.curbWidth - 0.1);
            queryTrack(t, t.px[i] - t.tz[i] * kd, t.pz[i] + t.tx[i] * kd, i, h);
            expect(h.surface === Surface.Curb || h.surface === Surface.Road).toBe(true);
          }
      });

      it('has one alternative route, 1–2 hazards on the road, 3+ coin rows and an intro flyover', () => {
        expect(t.branches.length).toBe(1);
        expect(t.hazards.length).toBeGreaterThanOrEqual(1);
        expect(t.hazards.length).toBeLessThanOrEqual(2);
        for (const p of t.hazards) {
          expect(Math.abs(p.d)).toBeLessThan(p.halfW);
          expect(p.period).toBeGreaterThanOrEqual(30);
        }
        expect((def.coins ?? []).length).toBeGreaterThanOrEqual(3);
        for (const c of t.coins) {
          const h = queryTrack(t, c.x, c.z, c.i, hit());
          expect(Math.abs(h.d)).toBeLessThan(10);
          expect(Math.abs(c.y - 0.7 - h.y)).toBeLessThan(0.6);
        }
        const fly = def.flyover ?? [];
        expect(fly.length).toBeGreaterThanOrEqual(3);
        expect(fly.length).toBeLessThanOrEqual(5);
        for (let k = 1; k < fly.length; k++) expect(fly[k].t).toBeGreaterThan(fly[k - 1].t);
        expect(fly[fly.length - 1].t).toBeCloseTo(3.5, 1);
        expect(def.music).toBeTypeOf('number');
      });

      it('mirror mode flips the layout', () => {
        const m = buildTrack(def, Modifier.Mirror);
        expect(m.mirrored).toBe(true);
        expect(Math.abs(m.length - t.length)).toBeLessThan(1);
        expect(m.px[50]).toBeCloseTo(-t.px[50], 1);
        expect(m.branches.length).toBe(t.branches.length);
        if (t.branches.length) expect(Math.abs(m.branches[0].length - t.branches[0].length)).toBeLessThan(1);
      });
    });
  }
});

describe('alternative routes (iteration 2)', () => {
  for (const def of TRACKS) {
    const t = buildTrack(def);
    for (const b of t.branches) {
      describe(`${def.name}: ${b.label}`, () => {
        it('is drivable: radius ≥ 10 m, climbs ≤ 25 %, its si matches its direction within 45°', () => {
          let maxK = 0;
          for (let j = 0; j < b.m; j++) maxK = Math.max(maxK, Math.abs(b.curv[j]));
          expect(1 / maxK).toBeGreaterThanOrEqual(10);
          for (let j = 1; j < b.m; j++) if (!b.gap || j !== b.gap.j1) expect(Math.abs(b.py[j] - b.py[j - 1]) / b.step).toBeLessThanOrEqual(0.25);
          expect(b.mapMis).toBeLessThan((45 * Math.PI) / 180);
          expect(b.length).toBeGreaterThan(40);
        });

        it('keeps clear of the rest of the loop, and of its own stretch away from the fork and the merge', () => {
          expect(branchClear(t, b)).toBe(true);
          // the middle of the branch is its own road: no union with the main road there
          for (let j = 0; j < b.m; j++) {
            const u = j * b.step;
            if (u < b.overlap + 12 || u > b.length - b.overlapEnd - 12) continue;
            expect(b.wallL[j]).toBeCloseTo(b.ownL[j], 5);
            expect(b.wallR[j]).toBeCloseTo(b.ownR[j], 5);
          }
        });

        it('the query puts its middle on the branch, with a lap position inside the stretch it replaces', () => {
          const h = hit();
          for (let j = Math.round(b.m / 3); j < (2 * b.m) / 3; j += 7) {
            queryTrack(t, b.px[j], b.pz[j], b.mapI[j], h);
            expect(h.branch).toBe(b.id);
            expect(Math.abs(h.d)).toBeLessThan(0.3);
            let ds = h.s - b.s0;
            if (ds < 0) ds += t.length;
            expect(ds).toBeLessThanOrEqual(b.span * t.step + 1);
          }
        });

        it('the surface is continuous where it meets the main road: no step a kart could snag on', () => {
          const h = hit();
          // sweep across the fork and the merge in 0.25 m steps
          for (const i0 of [b.from, b.to]) {
            for (let k = -60; k <= 60; k += 6) {
              const i = (i0 + k + t.n) % t.n;
              let prevY = NaN;
              for (let d = -t.wallL[i] + 0.9; d <= t.wallR[i] - 0.9; d += 0.25) {
                queryTrack(t, t.px[i] - t.tz[i] * d, t.pz[i] + t.tx[i] * d, i, h);
                if (h.y === h.y && prevY === prevY && h.surface !== Surface.Offroad) expect(Math.abs(h.y - prevY)).toBeLessThan(PHYS.stepUp + 0.05);
                prevY = h.surface === Surface.Offroad ? NaN : h.y;
              }
            }
          }
        });
      });
    }
  }

  it('a UGC shortcut sticker on a corner builds an off-road branch across its inside; on a straight it stays a verge', () => {
    const square = [[-80, -80], [0, -84], [80, -80], [84, 0], [80, 80], [0, 84], [-80, 80], [-84, 0]].map(([x, z]) => ({ x, z, h: 0, w: 2 as const }));
    const corner = buildTrack({ ...ovalTrack([{ s: 40, kind: 'items' }, { s: 64, kind: 'shortcut', side: 0 }]), points: square });
    expect(corner.branches.length).toBe(1);
    const b = corner.branches[0];
    expect(b.surface).toBe(Surface.Offroad);
    expect(b.length).toBeLessThan(0.87 * b.span * corner.step);
    const straight = buildTrack({ ...ovalTrack([{ s: 40, kind: 'items' }, { s: 32, kind: 'shortcut', side: 1 }]), points: square });
    expect(straight.branches.length).toBe(0);
    expect(Math.max(...straight.wallR)).toBeGreaterThan(straight.halfW[0] + PHYS.offroadMargin - 0.1);
  });
});

describe('the battle arena (iteration 2)', () => {
  for (const def of ARENAS) {
    it(`${def.name}: one flat open floor, eight item clusters, two ramps, solid cover inside the room`, () => {
      const t = buildTrack(def);
      expect(t.arena).toBe(true);
      const h = hit();
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < t.n; i++) {
        cx += t.px[i] / t.n;
        cz += t.pz[i] / t.n;
      }
      // drivable road everywhere from the centre to ~36 m out
      for (let a = 0; a < 16; a++)
        for (const r of [0.5, 8, 20, 32]) {
          const x = cx + Math.cos((a / 16) * Math.PI * 2) * r;
          const z = cz + Math.sin((a / 16) * Math.PI * 2) * r;
          queryTrack(t, x, z, -1, h);
          expect(h.surface === Surface.Road || h.surface === Surface.Boost).toBe(true);
          const wall = h.d > 0 ? h.wallR! : h.wallL!;
          expect(Math.abs(h.d)).toBeLessThan(wall);
        }
      for (let i = 0; i < t.n; i++) expect(t.bank[i]).toBe(0);
      expect(def.features.filter((f) => f.kind === 'items').length).toBe(8);
      expect(t.ramps.length).toBe(2);
      expect(t.blocks.length).toBeGreaterThanOrEqual(4);
      for (const bl of t.blocks) expect(Math.hypot(bl.x - cx, bl.z - cz) + bl.r).toBeLessThan(38);
    });
  }

  it('every frozen id builds', () => {
    for (const def of ALL_TRACKS) expect(buildTrack(def).n).toBeGreaterThan(100);
  });
});
