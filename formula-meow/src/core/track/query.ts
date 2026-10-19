/**
 * Track query (GDD 3.2): for a position, the nearest sample, continuous arc length `s`, lateral offset `d`
 * (+ = right), the surface height and the surface type. A local window search from the kart's last sample keeps it
 * O(window) per kart per tick and stops a kart "teleporting" between close parts of a loop; a grid lookup is the
 * fallback when there is no hint.
 */
import { Surface } from '../../types';
import { PHYS } from '../../tuning';
import { cellKey, type BuiltTrack } from './build';

export interface TrackHit {
  i: number;
  s: number;
  d: number;
  /** surface height at (s, d), including banking and ramps */
  y: number;
  surface: Surface;
}

const WINDOW = 24;

/** Nearest sample index to (x, z). `hint` < 0 searches the whole track through the grid; `y` breaks ties on bridges. */
export function nearestSample(t: BuiltTrack, x: number, z: number, hint: number, y = NaN): number {
  let best = -1;
  let bestD = Infinity;
  const consider = (i: number) => {
    const dx = t.px[i] - x;
    const dz = t.pz[i] - z;
    let dd = dx * dx + dz * dz;
    if (y === y) {
      const dy = t.py[i] - y;
      dd += dy * dy * 4;
    }
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  };
  if (hint >= 0) {
    for (let k = -WINDOW; k <= WINDOW; k++) consider((hint + k + t.n) % t.n);
    return best;
  }
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

export function queryTrack(t: BuiltTrack, x: number, z: number, hint: number, out: TrackHit, y = NaN): TrackHit {
  const i = nearestSample(t, x, z, hint, y);
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
  out.surface = surfaceAt(t, i, along, d);
  return out;
}

/** Ramp height at sample i (and lateral d) within a ramp's run-up, 0 elsewhere. */
export function rampHeight(t: BuiltTrack, i: number, along: number, d: number): number {
  for (const r of t.ramps) {
    let back = (r.i - i + t.n) % t.n; // samples before the lip
    if (back > t.n / 2) continue;
    const u = back * t.step - along;
    if (u < 0 || u > r.len * t.step) continue;
    if (Math.abs(d - r.d) > r.halfW) continue;
    return r.height * (1 - u / (r.len * t.step));
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

export function surfaceAt(t: BuiltTrack, i: number, along: number, d: number): Surface {
  const hw = t.halfW[i];
  const ad = Math.abs(d);
  if (ad > hw + PHYS.curbWidth) return Surface.Offroad;
  if (ad > hw) return Surface.Curb;
  for (const p of t.pads) {
    let ds = (i - p.i) * t.step + along;
    if (ds > t.length / 2) ds -= t.length;
    else if (ds < -t.length / 2) ds += t.length;
    if (Math.abs(ds) <= p.halfLen && Math.abs(d - p.d) <= p.halfW) return Surface.Boost;
  }
  if (t.lowgrip[i]) return Surface.LowGrip;
  return Surface.Road;
}

/** Signed distance along the lap from a to b in (-L/2, L/2]. */
export function wrapDs(t: BuiltTrack, ds: number): number {
  const L = t.length;
  if (ds > L / 2) return ds - L;
  if (ds <= -L / 2) return ds + L;
  return ds;
}
