/**
 * Track query (GDD 3.2): for a position, the nearest sample, continuous arc length `s`, lateral offset `d`
 * (+ = right), the surface height, the surface type and the walls there. A continuity search from the kart's last
 * sample keeps it O(window) per kart per tick and stops a kart "teleporting" between close parts of a loop (B4: the
 * Kitchen hairpin once made `s` jump 4 m in a tick); a grid lookup is the fallback when there is no hint.
 *
 * `kart.ts` reads walls and surface only from this result (iteration 2 contract), so the tracks lane adds branches
 * here without touching the kart physics:
 * - Near a branch (the hint inside its window) the point is tested against the branch too. It is on the branch when
 *   it is on the branch's road and not the main road's, or on both and nearer the branch's centre line (the fork and
 *   the merge), or on neither and nearer the branch's edge (walls then push it back onto the branch).
 * - On a branch: `d`, walls, surface and height are the branch's; `s` maps linearly onto the main loop's range;
 *   `i` is the branch's direction-matched main sample (branch.ts `mapI`), so the main tangent at `i` is the branch's.
 * - Open bridges (`voidMask`): past the deck edge the ground is far below, so the kart falls (src/tracks/hazards
 *   rules.ts sends the respawn hand).
 * - Milk puddles (hazards) are low grip.
 */
import { Surface } from '../../types';
import { PHYS } from '../../tuning';
import { cellKey } from './grid';
import { branchFoot, inWindow, mainFootWindow, type BuiltBranch, type Foot } from './branch';
import type { BuiltTrack } from './build';

export interface TrackHit {
  i: number;
  s: number;
  d: number;
  /** surface height at (s, d), including banking and ramps */
  y: number;
  surface: Surface;
  /** wall distance from the centre line on each side at this point (positive numbers) */
  wallL?: number;
  wallR?: number;
  /** alternative route the point is on, -1 = the main loop */
  branch?: number;
  /** that branch's sample at the point (only meaningful while `branch` >= 0) */
  bj?: number;
  /** height of a ramp run-up under the point (0 off ramps) */
  ramp?: number;
}

/** Continuity window: the search never leaves ±WINDOW samples of the hint (a kart moves < 2 samples a tick). */
const WINDOW = 24;
/** Ramps slope up over this many metres at their sides */
const RAMP_BEVEL = 1.5;
/** How far below an open bridge's deck the canyon floor is reported (a fall, never a landing) */
export const VOID_DROP = 14;
/** Deck edge of an open bridge: past halfW + this, the kart is off the deck */
export const VOID_EDGE = 0.3;

function dist2(t: BuiltTrack, i: number, x: number, z: number, y: number): number {
  const dx = t.px[i] - x;
  const dz = t.pz[i] - z;
  let dd = dx * dx + dz * dz;
  if (y === y) {
    const dy = t.py[i] - y;
    dd += dy * dy * 4;
  }
  return dd;
}

/**
 * Nearest sample index to (x, z). With a hint it walks downhill from the hint (the local minimum next to where the
 * kart was, so `s` changes by the smallest amount), never further than ±WINDOW samples. `hint` < 0 searches the whole
 * track through the grid; `y` breaks ties on bridges.
 */
export function nearestSample(t: BuiltTrack, x: number, z: number, hint: number, y = NaN): number {
  if (hint >= 0) {
    const n = t.n;
    let i = hint % n;
    let d = dist2(t, i, x, z, y);
    const fwd = dist2(t, (i + 1) % n, x, z, y);
    const back = dist2(t, (i - 1 + n) % n, x, z, y);
    const dir = fwd < d && fwd <= back ? 1 : back < d ? -1 : 0;
    if (dir === 0) return i;
    for (let k = 0; k < WINDOW; k++) {
      const j = (i + dir + n) % n;
      const dj = dist2(t, j, x, z, y);
      if (dj >= d) break;
      i = j;
      d = dj;
    }
    return i;
  }
  let best = -1;
  let bestD = Infinity;
  const consider = (i: number) => {
    const dd = dist2(t, i, x, z, y);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  };
  for (let r = 1; r <= 6 && best < 0; r++) {
    for (let cx = -r; cx <= r; cx++)
      for (let cz = -r; cz <= r; cz++) {
        const list = t.cells.get(cellKey(x + cx * 8, z + cz * 8));
        if (list) for (const i of list) consider(i);
      }
  }
  if (best < 0) for (let i = 0; i < t.n; i++) consider(i);
  return best;
}

const foot: Foot = { j: 0, along: 0, d: 0 };
const mfoot: Foot = { j: 0, along: 0, d: 0 };

/** The branch whose window holds main sample `i`, or null (branches never overlap each other's windows). */
function branchNear(t: BuiltTrack, i: number): BuiltBranch | null {
  const bs = t.branches;
  for (let k = 0; k < bs.length; k++) if (inWindow(t, bs[k], i)) return bs[k];
  return null;
}

export function queryTrack(t: BuiltTrack, x: number, z: number, hint: number, out: TrackHit, y = NaN): TrackHit {
  // near a branch the hint may be a branch's mapped sample (not a local minimum of the main loop): scan the window
  const near = t.branches.length && hint >= 0 ? branchNear(t, hint) : null;
  let i: number;
  if (near) {
    const pad = Math.round(60 / t.step);
    mainFootWindow(t, x, z, near.from - pad, near.from + near.span + pad, mfoot);
    i = mfoot.j;
  } else i = nearestSample(t, x, z, hint, y);
  const ox = x - t.px[i];
  const oz = z - t.pz[i];
  const along = ox * t.tx[i] + oz * t.tz[i];
  const d = ox * -t.tz[i] + oz * t.tx[i];
  let s = i * t.step + along;
  if (s < 0) s += t.length;
  else if (s >= t.length) s -= t.length;
  out.i = i;
  out.s = s;
  out.d = d;
  out.y = surfaceY(t, i, along, d);
  out.surface = surfaceAt(t, i, along, d, x, z);
  out.ramp = rampHeight(t, i, along, d);
  out.wallL = t.wallL[i];
  out.wallR = t.wallR[i];
  out.branch = -1;
  // an arena is one open floor out to its walls (the ring is only the frame)
  if (t.arena && (out.surface === Surface.Offroad || out.surface === Surface.Curb)) out.surface = Surface.Road;
  if (t.voidMask[i] && Math.abs(d) > t.halfW[i] + VOID_EDGE) {
    out.y = t.py[i] - VOID_DROP;
    out.surface = Surface.Offroad;
  }
  // SIM_VERSION 8: a jump gap's missing deck (the catch net is the sim rule, core/sim/stunt.ts)
  if (t.gapMask[i]) {
    out.y = t.py[i] - VOID_DROP;
    out.surface = Surface.Offroad;
    out.ramp = 0;
  }
  const b = near ?? (t.branches.length ? branchNear(t, i) : null);
  if (b) onBranch(t, b, x, z, out);
  return out;
}

/** Re-target `out` to branch `b` when the point belongs to it (see the header). */
function onBranch(t: BuiltTrack, b: BuiltBranch, x: number, z: number, out: TrackHit): void {
  if (!branchFoot(b, x, z, foot)) return;
  const j = foot.j;
  if (Math.abs(foot.along) > b.step * 2) return;
  const db = foot.d;
  const hwb = b.halfW[j] + PHYS.curbWidth;
  const hwm = t.halfW[out.i] + PHYS.curbWidth;
  const dm = out.d;
  const inB = Math.abs(db) <= hwb;
  const inM = Math.abs(dm) <= hwm;
  const take = inB ? !inM || Math.abs(db) < Math.abs(dm) : !inM && Math.abs(db) - hwb < Math.abs(dm) - hwm;
  if (!take) return;
  const u = j * b.step + foot.along;
  let s = b.s0 + u * b.sk;
  s -= t.length * Math.floor(s / t.length);
  out.i = b.mapI[j];
  out.s = s;
  out.d = db;
  const k = foot.along >= 0 ? Math.min(b.m - 1, j + 1) : Math.max(0, j - 1);
  const f = Math.min(1, Math.abs(foot.along) / b.step);
  // still over the main road (the fork, the merge): its surface; fading into the branch's own deck over 2 m past
  // the main road's kerb (the branch is built to match the main road there, so the blend only hides rounding)
  const yb = b.py[j] + (b.py[k] - b.py[j]) * f + db * (b.bank[j] + (b.bank[k] - b.bank[j]) * f);
  const w = Math.min(1, Math.max(0, (Math.abs(dm) - hwm) / 2));
  out.y = out.y + (yb - out.y) * w;
  const ad = Math.abs(db);
  if (!inM) out.surface = ad > b.halfW[j] + PHYS.curbWidth ? Surface.Offroad : b.surface !== Surface.Road ? b.surface : ad > b.halfW[j] ? Surface.Curb : puddleAt(t, x, z) ? Surface.LowGrip : Surface.Road;
  for (let p = 0; p < b.pads.length; p++) {
    const pad = b.pads[p];
    if (Math.abs(j - pad.j) <= pad.halfLen && ad <= pad.halfW) out.surface = Surface.Boost;
  }
  // a gap in the deck: nothing to stand on (src/tracks/hazards/rules.ts lifts a kart that cannot clear it)
  if (b.gap && j >= b.gap.j0 && j < b.gap.j1) {
    out.y = b.py[j] - VOID_DROP;
    out.surface = Surface.Offroad;
  }
  out.ramp = 0;
  out.wallL = b.wallL[j];
  out.wallR = b.wallR[j];
  out.branch = b.id;
  out.bj = j;
}

/** Ramp height at sample i (and lateral d) within a ramp's run-up, 0 elsewhere. */
export function rampHeight(t: BuiltTrack, i: number, along: number, d: number): number {
  for (const r of t.ramps) {
    let back = (r.i - i + t.n) % t.n; // samples before the lip
    if (back > t.n / 2) continue;
    const u = back * t.step - along;
    if (u < 0 || u > r.len * t.step) continue;
    const edge = r.halfW - Math.abs(d - r.d);
    if (edge < 0) continue;
    // bevelled sides (iteration 2): a kart crossing onto the ramp from the side climbs, it never pops up a step
    return r.height * (1 - u / (r.len * t.step)) * Math.min(1, edge / RAMP_BEVEL);
  }
  return 0;
}

export function surfaceY(t: BuiltTrack, i: number, along: number, d: number): number {
  const j = along >= 0 ? (i + 1) % t.n : (i - 1 + t.n) % t.n;
  const f = Math.min(1, Math.abs(along) / t.step);
  const cy = t.py[i] + (t.py[j] - t.py[i]) * f;
  const bank = t.bank[i] + (t.bank[j] - t.bank[i]) * f;
  return cy + d * bank + rampHeight(t, i, along, d);
}

/** Inside a milk puddle (iteration 2 hazard)? */
function puddleAt(t: BuiltTrack, x: number, z: number): boolean {
  const ps = t.puddles;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz <= p.r * p.r) return true;
  }
  return false;
}

export function surfaceAt(t: BuiltTrack, i: number, along: number, d: number, x = NaN, z = NaN): Surface {
  const hw = t.halfW[i];
  const ad = Math.abs(d);
  // SIM_VERSION 8: a set piece's wall-ride lane past the road edge (core/track/stunt.ts)
  if (ad > hw) {
    const lane = d > 0 ? t.laneR[i] : t.laneL[i];
    if (lane > 0.5) return Surface.WallRide;
  }
  if (ad > hw + PHYS.curbWidth) return Surface.Offroad;
  if (ad > hw) return Surface.Curb;
  for (const p of t.pads) {
    let ds = (i - p.i) * t.step + along;
    if (ds > t.length / 2) ds -= t.length;
    else if (ds < -t.length / 2) ds += t.length;
    if (Math.abs(ds) <= p.halfLen && Math.abs(d - p.d) <= p.halfW) return Surface.Boost;
  }
  if (t.lowgrip[i]) return Surface.LowGrip;
  if (t.puddles.length && x === x && puddleAt(t, x, z)) return Surface.LowGrip;
  return Surface.Road;
}

/** Signed distance along the lap from a to b in (-L/2, L/2]. */
export function wrapDs(t: BuiltTrack, ds: number): number {
  const L = t.length;
  if (ds > L / 2) return ds - L;
  if (ds <= -L / 2) return ds + L;
  return ds;
}
