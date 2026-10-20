/**
 * Loop pose (render-only): the drawn forward is the kart's real travel direction on the ribbon, also off the centre
 * line (playtest: at su 32–42 with |sd| = 2 the nose pointed 24–28° off, "crabbing" over the top of every loop), and
 * the rig behind a kart just past the zone start still has a frame (the ribbon runs on as the flat shadow road).
 */
import { describe, expect, it } from 'vitest';
import { buildTrack } from '../track/build';
import { trackById } from '../track/tracks';
import { LOOP_LP } from '../track/stunt';
import { ribbonPose, type StuntPose } from './stunt-pose';

const pose = (): StuntPose => ({ x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 });

describe('loop ribbon pose', () => {
  for (const id of ['kitchen', 'rooftops', 'laundry', 'cafe', 'shelter']) {
    it(`${id}: forward follows the motion within 4° at sd -2, 0, 2; the basis stays orthonormal`, () => {
      const t = buildTrack(trackById(id), 0);
      const loops = t.pieces.filter((p) => p.kind === 'loop');
      expect(loops.length).toBeGreaterThan(0);
      const a = pose();
      const b = pose();
      for (const pc of loops) {
        let worst = 0;
        for (let su = 0.5; su < LOOP_LP - 0.5; su += 0.5)
          for (const sd of [-2, 0, 2]) {
            ribbonPose(t, pc, su, sd, 0.03, a);
            ribbonPose(t, pc, su + 0.05, sd, 0.03, b);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dz = b.z - a.z;
            const l = Math.hypot(dx, dy, dz);
            const ang = (Math.acos(Math.min(1, (dx * a.fx + dy * a.fy + dz * a.fz) / l)) * 180) / Math.PI;
            worst = Math.max(worst, ang);
            expect(Math.abs(a.ux * a.fx + a.uy * a.fy + a.uz * a.fz)).toBeLessThan(1e-6);
            expect(Math.hypot(a.ux, a.uy, a.uz)).toBeCloseTo(1, 6);
          }
        expect(worst).toBeLessThan(4);
      }
    });
  }

  it('before the zone start (camera rig 7.5 m back) the frame is the road: forward along it, up the world up', () => {
    const t = buildTrack(trackById('kitchen'), 0);
    const pc = t.pieces.find((p) => p.kind === 'loop')!;
    const a = pose();
    for (const su of [-7.5, -3, -0.1]) {
      ribbonPose(t, pc, su, 1, 2.6, a);
      expect(a.uy).toBeGreaterThan(0.95);
      expect(Math.hypot(a.fx, a.fy, a.fz)).toBeCloseTo(1, 6);
      expect(a.y - t.py[pc.i0]).toBeGreaterThan(1.5);
    }
  });
});
