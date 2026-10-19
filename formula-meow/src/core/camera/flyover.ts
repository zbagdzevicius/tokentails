/**
 * Intro flyover keys (feel lane): the track's own `TrackDef.flyover` (tracks lane), mirrored with the track, or an
 * automatic 3.5 s sweep built from the track's samples for any track without keys (stubs, UGC doodles): high over
 * the road ahead looking back at the grid, a swoop down along the road, a low look at the karts from in front, and a
 * rise over the field to settle behind the grid, where the camera blends into the chase rig.
 */
import type { FlyoverKey } from '../../types';
import type { BuiltTrack } from '../track/build';

export const FLYOVER_TIME = 3.5;

export interface GridPose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export function flyoverKeys(t: BuiltTrack, grid: GridPose & { si?: number }): FlyoverKey[] {
  const own = t.def.flyover;
  if (own && own.length >= 2) {
    const m = t.mirrored ? -1 : 1;
    return own.map((k) => ({ ...k, x: k.x * m, lx: k.lx * m }));
  }
  return autoFlyover(t, grid);
}

export function autoFlyover(t: BuiltTrack, grid: GridPose & { si?: number }): FlyoverKey[] {
  // the keys stay over the road (the scenery lives outside the walls), so no building ever blocks the shot
  const si = grid.si ?? nearest(t, grid.x, grid.z);
  const at = (metres: number) => {
    const i = (((si + Math.round(metres / t.step)) % t.n) + t.n) % t.n;
    return { x: t.px[i], y: t.py[i], z: t.pz[i], tx: t.tx[i], tz: t.tz[i] };
  };
  let maxY = 0;
  for (let i = 0; i < t.n; i += 8) maxY = Math.max(maxY, t.py[i]);
  const far = at(95);
  const mid = at(45);
  const near = at(18);
  const fx = Math.sin(grid.heading);
  const fz = Math.cos(grid.heading);
  const top = Math.max(grid.y, maxY) + 42;
  return [
    // high over the road ahead, looking back down at the grid and the first bend
    { x: far.x, y: top, z: far.z, lx: grid.x, ly: grid.y, lz: grid.z, t: 0 },
    // swooping down along the road toward the grid
    { x: mid.x, y: mid.y + 12, z: mid.z, lx: grid.x, ly: grid.y + 0.5, lz: grid.z, t: 1.3 },
    // low over the road in front of the karts
    { x: near.x, y: near.y + 3.2, z: near.z, lx: grid.x, ly: grid.y + 0.8, lz: grid.z, t: 2.5 },
    // up and over the field to settle behind the grid, ready for the chase rig
    { x: grid.x - fx * 9, y: grid.y + 4.6, z: grid.z - fz * 9, lx: grid.x + fx * 8, ly: grid.y + 0.5, lz: grid.z + fz * 8, t: FLYOVER_TIME },
  ];
}

function nearest(t: BuiltTrack, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < t.n; i++) {
    const dx = t.px[i] - x;
    const dz = t.pz[i] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
