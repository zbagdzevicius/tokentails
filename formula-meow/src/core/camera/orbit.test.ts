/**
 * The finish orbit (and the attract orbit) keep the camera inside the track walls like the chase rig (B59): before, the
 * swing round a kart that finished next to a wall went up to 3.4 m through the barrier into the scenery (Rooftops).
 */
import { describe, expect, it } from 'vitest';
import { raceConfig, world } from '../../test/fixtures';
import { trackById } from '../track/tracks';
import { queryTrack, type TrackHit } from '../track/query';
import { placeOnTrack } from '../sim/kart';
import { ChaseCamera } from './chase-camera';

const hit = { i: 0, s: 0, d: 0, y: 0, surface: 0 } as unknown as TrackHit;

describe('orbit cameras stay inside the walls', () => {
  for (const id of ['rooftops', 'kitchen'])
    for (const mode of ['finishOrbit', 'attract'] as const)
      it(`${id}: ${mode} round a kart parked against either wall`, () => {
        const w = world(raceConfig(trackById(id), { humans: [0], solo: true }));
        const t = w.track;
        const k = w.st.karts[0];
        let worst = 0;
        for (let i = 0; i < t.n; i += Math.round(t.n / 12))
          for (const s of [-1, 1]) {
            if (t.pieces.some((pc) => (i - pc.i0 + t.n) % t.n < pc.i1 - pc.i0 + 20)) continue; // plain road only
            const wall = s > 0 ? t.wallR[i] : t.wallL[i];
            placeOnTrack(w.ctx, k, i, s * (wall - 1));
            k.vx = 0;
            k.vz = 0;
            const cam = new ChaseCamera(390 / 844);
            cam.source = { track: t, me: 0, displayPos: (_i, out) => Object.assign(out, { x: k.x, y: k.y, z: k.z, heading: k.heading }) };
            cam.snap(k.x, k.y, k.z, k.heading);
            // the race comes into the orbit from the (wall-clamped) chase rig
            cam.setMode('chase');
            for (let f = 0; f < 60 * 2; f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 24, 1 / 60);
            cam.setMode(mode);
            for (let f = 0; f < 60 * 3; f++) {
              cam.update(k, k.x, k.y, k.z, k.heading, 0, 24, 1 / 60);
              // the first half second blends out of the chase rig (its own clamp is the chase rig's business)
              if (f < 30) continue;
              const p = cam.cam.position;
              queryTrack(t, p.x, p.z, i, hit);
              const lim = hit.d > 0 ? (hit.wallR ?? t.wallR[hit.i]) : (hit.wallL ?? t.wallL[hit.i]);
              worst = Math.max(worst, Math.abs(hit.d) - lim);
            }
          }
        // parked 1 m off the wall the orbit cannot get fully inside without coming closer than ORBIT_MIN; it stays
        // within a hand's width of the wall line (it went 2–3.4 m through it before)
        expect(worst).toBeLessThan(0.35);
      });
});
