/**
 * Reduced-motion TV camera on a loop: the skins dress the loop's sides (Laundry's drum hubs and spokes, Shelter's wheel
 * and A-frame stand, Café's mug handle), so the old fixed spot (16 m to the left at the loop centre's height) looked
 * through the hub on Laundry and Shelter and into the handle on mirrored Café. The chosen spot must keep the kart in
 * view round the loop on every circuit with a loop, mirrored too.
 */
import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { buildTrack } from '../track/build';
import { trackById } from '../track/tracks';
import { buildWorldView } from '../render/world-view';
import { blockedSightLines, chooseTvSpot, segmentBlocked, trianglesNear, tvSpotAt, tvTargets } from './tv-spot';

const ALL = new Vector3(1e9, 1e9, 1e9);

describe('reduced-motion TV camera spot', () => {
  it('segmentBlocked hits a triangle crossing the segment and misses one beside it', () => {
    const tri = new Float32Array([-1, -1, 5, 1, -1, 5, 0, 1, 5]);
    expect(segmentBlocked(tri, new Vector3(0, 0, 0), new Vector3(0, 0, 10))).toBe(true);
    expect(segmentBlocked(tri, new Vector3(0, 0, 0), new Vector3(0, 0, 4))).toBe(false);
    expect(segmentBlocked(tri, new Vector3(3, 0, 0), new Vector3(3, 0, 10))).toBe(false);
  });

  for (const id of ['laundry', 'shelter', 'cafe', 'rooftops', 'kitchen'])
    it(`${id}: the chosen spot sees the kart round the loop (normal and mirrored)`, () => {
      for (const mods of [0, 1]) {
        const t = buildTrack(trackById(id), mods);
        const wv = buildWorldView(new Scene(), t);
        const tris = trianglesNear(wv.group, ALL.clone().negate(), ALL);
        for (const pc of t.pieces.filter((p) => p.kind === 'loop')) {
          const targets = tvTargets(t, pc);
          const spot = { x: 0, y: 0, z: 0 };
          chooseTvSpot(t, pc, wv.group, spot);
          const chosen = blockedSightLines(tris, new Vector3(spot.x, spot.y, spot.z), targets);
          // the old fixed spot, for the record: Laundry and Shelter lost a third of the loop behind the hub and spokes,
          // mirrored Café all of it
          const old = { x: 0, y: 0, z: 0 };
          tvSpotAt(t, pc, { side: -16, up: 0 }, old);
          const before = blockedSightLines(tris, new Vector3(old.x, old.y, old.z), targets);
          expect(chosen, `${id} mods ${mods}`).toBeLessThanOrEqual(Math.ceil(targets.length * 0.2));
          expect(chosen, `${id} mods ${mods}`).toBeLessThanOrEqual(before);
        }
      }
    });
});
