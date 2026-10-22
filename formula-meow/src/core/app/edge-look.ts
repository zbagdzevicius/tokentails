/**
 * Edge look-ahead (iteration 4 contract, F2, integrator-owned): where the player's kart will be in `horizon` s at its
 * current speed and turn rate, and how far that point is from each road edge. The shell fills `MuxContext.edgeL /
 * edgeR / edgeHeading` from it every frame; the feel lane's Smart Steer reads only those numbers.
 *
 * Read-only on the sim (render side): it queries the track with its own scratch hit and never writes kart state, so
 * it cannot change a replay. The assist itself edits the TickInput before it is latched, so ghosts record it.
 */
import { Surface, type KartState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { queryTrack, type TrackHit } from '../track/query';

export interface EdgeLook {
  /** metres from the projected point to the left / right road edge (+ on the road, − past it) */
  edgeL: number;
  edgeR: number;
  /** road heading at the projected point minus the projected travel heading, radians (+ = the road turns left) */
  edgeHeading: number;
}

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };
const STEPS = 5;

const wrap = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/**
 * Project the kart `horizon` s ahead on an arc (its travel direction turning at `yawRate` rad/s, + = left, as the
 * sim's heading grows to the left) and measure the road edges there. `out` is filled and returned.
 */
export function edgeLook(t: BuiltTrack, k: Pick<KartState, 'x' | 'z' | 'vx' | 'vz' | 'si'>, yawRate: number, horizon: number, out: EdgeLook): EdgeLook {
  const v = Math.hypot(k.vx, k.vz);
  let th = v > 0.5 ? Math.atan2(k.vx, k.vz) : 0;
  let x = k.x;
  let z = k.z;
  const dt = horizon / STEPS;
  for (let s = 0; s < STEPS; s++) {
    th += yawRate * dt;
    x += Math.sin(th) * v * dt;
    z += Math.cos(th) * v * dt;
  }
  // a hint near the projected point (the query's continuity window is ±24 samples)
  const hint = t.n > 0 ? (k.si + Math.round((v * horizon) / Math.max(0.1, t.step))) % t.n : 0;
  queryTrack(t, x, z, hint, hit);
  const b = hit.branch ?? -1;
  const br = b >= 0 ? t.branches[b] : null;
  const hw = br && hit.bj != null ? br.halfW[hit.bj] : t.halfW[hit.i];
  out.edgeL = hw + hit.d;
  out.edgeR = hw - hit.d;
  out.edgeHeading = wrap(Math.atan2(t.tx[hit.i], t.tz[hit.i]) - th);
  return out;
}
