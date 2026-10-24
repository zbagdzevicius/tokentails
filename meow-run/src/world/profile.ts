// Side terrain cross-sections (WORLD-ART). Pure: node-importable.
// The landscape beside the path is a grid in track space: rows along s, columns at fixed distances `LAT` outward
// from the path edge. Each row's heights come from sideProfile(): a blend of three styles (rising sandstone cliff,
// rolling hills, a ledge that drops to the valley floor), chosen by slow noise along s, plus overrides per segment
// kind (chasms under gaps / bridges / the cloud canyon, river banks, the banked wall-run cliff).
// Heights are relative to the path edge point; `floorRel` is where the valley floor sits relative to that edge.
import type { SegmentKind } from '../core/types';
import { fbm1, lerp, smoothstep, vnoise1, vnoise2 } from './noise';
import type { StyleMix } from './palette';

/** column distances outward from the path edge (u) */
export const LAT = [0, 0.7, 1.6, 2.8, 4, 5.2, 6.5, 8, 9.8, 12, 14.8, 18, 22, 27, 33, 40, 48, 57, 67];
export const NL = LAT.length;
/** the camera corridor beside the path: |x| < width/2 + CORRIDOR must stay clear */
export const CORRIDOR = 1.5;

export interface ProfileIn {
  s: number;
  side: -1 | 1;
  kind: SegmentKind;
  /** track bank in degrees (+ lowers the right side) */
  bankDeg: number;
  /** valley floor height relative to the path edge (negative = below) */
  floorRel: number;
  mix: StyleMix;
  seed: number;
  /** 0..1, 1 at a gap or bridge: the side cliffs step back so the chasm opens into a wide ravine */
  open?: number;
}

export interface StyleW {
  cliff: number;
  hill: number;
  drop: number;
}

/** how much of each style the side terrain at (s, side) uses; sums to 1 */
export function styleWeights(s: number, side: number, mix: StyleMix, seed: number, out: StyleW): StyleW {
  // one noise for both sides, mirrored: when the left is a cliff the right opens to hills or the valley drop and
  // vice versa, so the path mostly has a wall on one side and a vista on the other (the cliff side swaps on its own
  // every few bends). Both sides are cliffs only where the mix asks for more than half cliff.
  const v = fbm1(s / 170 + seed * 0.37, seed);
  const u0 = smoothstep(0.24, 0.76, v);
  const u = side > 0 ? 1 - u0 : u0;
  const total = mix.cliff + mix.hill + mix.drop || 1;
  const c1 = mix.cliff / total;
  const c2 = (mix.cliff + mix.hill) / total;
  const k = 0.05;
  out.cliff = mix.cliff > 0 ? 1 - smoothstep(c1 - k, c1 + k, u) : 0;
  out.drop = mix.drop > 0 ? smoothstep(c2 - k, c2 + k, u) : 0;
  out.hill = Math.max(0, 1 - out.cliff - out.drop);
  return out;
}

const W: StyleW = { cliff: 0, hill: 0, drop: 0 };
/** true when chunk scenery under this kind is a chasm (no ground) */
export const isChasm = (k: SegmentKind) => k === 'gap' || k === 'cloud' || k === 'bridge';

/** Heights (relative to the path edge) at each LAT column for one row. Writes NL values into out. */
export function sideProfile(out: Float32Array | number[], p: ProfileIn): void {
  const { s, side, mix, seed, floorRel } = p;
  if (p.kind === 'cloud') {
    // the big canyon: a deep corridor under the cloud ride, sheer walls back up to the plateau either side
    const sd = seed + (side > 0 ? 101 : 0);
    const dc = 9 + 7 * vnoise1(s / 40, sd + 41);
    const top = 1 + 6 * vnoise1(s / 55, sd + 43);
    for (let i = 0; i < NL; i++) {
      const d = LAT[i];
      const jit = vnoise2(s / 7 + sd, i * 1.7, 13) - 0.5;
      let h = lerp(floorRel - 1.5, top + 0.08 * (d - dc), smoothstep(dc, dc + 2.2, d));
      if (d > dc - 1 && d < dc + 4) h += jit * 2.5;
      h = lerp(h, floorRel - 3, smoothstep(40, 66, d));
      if (i === NL - 1) h = floorRel - 3;
      out[i] = h;
    }
    return;
  }
  // gaps and bridges: a trench cut across the path. Its walls stand well clear of the path (so the chase camera, which
  // rides the track over the chasm, looks down a ravine instead of into the far rim's cliffs), and the landscape
  // beside it carries on as on the ground either side.
  let trench = 0;
  if (isChasm(p.kind)) trench = 7 + 5 * vnoise1(s / 30, seed + (side > 0 ? 151 : 51));
  styleWeights(s, side, mix, seed, W);
  const sd = seed + (side > 0 ? 101 : 0);
  // cliff
  const H = lerp(mix.cliffMin, mix.cliffMax, fbm1(s / 90 + 3.1, sd + 11));
  const open = p.open ?? 0;
  const d0 = (p.kind === 'river' ? 5 : 3.6) + 3.2 * vnoise1(s / 55, sd + 5) + open * 10;
  const tiered = vnoise1(s / 75, sd + 9) > 0.48;
  // drop
  const dd = (p.kind === 'river' ? 4.5 : 3) + 4 * vnoise1(s / 60, sd + 21);
  // wall-run: the high side keeps rising like the banked rock face, the low side falls away
  const absBank = Math.abs(p.bankDeg);
  const wallW = smoothstep(10, 45, absBank);
  const high = wallW > 0 && Math.sign(p.bankDeg) === -side;
  const slope = Math.tan((Math.min(absBank, 72) * Math.PI) / 180);
  for (let i = 0; i < NL; i++) {
    const d = LAT[i];
    // jagged rock faces: per-row, per-column jitter
    // faceted rock: jitter that varies smoothly along s (big facets, no sawtooth)
    const jit = vnoise2(s / 7 + sd, i * 1.7, 13) - 0.5;
    let hc = 0.12 * d + 0.4 * vnoise2(s / 13, d / 5, sd + 2);
    if (tiered) {
      hc += H * 0.48 * smoothstep(d0, d0 + 1.4, d) + H * 0.52 * smoothstep(d0 + 6.5, d0 + 7.9, d);
    } else hc += H * smoothstep(d0, d0 + 1.5, d);
    if (d > d0 - 0.2) hc += jit * 0.14 * H * (1 - smoothstep(d0 + 10, d0 + 16, d)) + 1.6 * vnoise2(s / 30, d / 9, sd + 4);
    const hh = mix.hillAmp * (vnoise2(s / 46, d / 13, sd + 6) * 1.25 - 0.32) * smoothstep(1.5, 15, d) + 0.04 * d;
    let hd = 0.1 * d + 0.25 * vnoise2(s / 11, d / 4, sd + 8);
    hd = lerp(hd, floorRel - 1, smoothstep(dd, dd + 1.6, d));
    if (d > dd) hd += jit * 1.2;
    let h = W.cliff * hc + W.hill * hh + W.drop * hd;
    // river: low shelving banks so the water edge reads
    if (p.kind === 'river') {
      if (d < 1.2) h = -0.35;
      else if (d < 3) h = Math.min(h, lerp(-0.35, 0.55, (d - 1.2) / 1.8));
    }
    if (wallW > 0) {
      if (high) {
        const hw = d < 3.2 ? d * slope : 3.2 * slope + Math.max(14, H) * smoothstep(3.2, 5, d) + jit * 3;
        h = lerp(h, hw, wallW);
      } else {
        const hw = lerp(-d * slope, floorRel - 1, smoothstep(0.7, 2.6, d)) + (d > 1 ? jit * 1.5 : 0);
        h = lerp(h, hw, wallW);
      }
    }
    // the corridor next to the path stays low and clear
    if (d < CORRIDOR + 0.11 && wallW === 0) h = Math.min(h, 0.02 + 0.18 * d);
    // outer columns roll down into the valley floor
    const t = smoothstep(38, 66, d);
    h = lerp(h, floorRel - 3, t);
    if (i === NL - 1) h = floorRel - 3;
    if (trench > 0) {
      const cut = 1 - smoothstep(trench, trench + 1.4, d);
      if (cut > 0) h = lerp(Math.max(h, 0.3), floorRel - 1.5, cut) + (cut < 1 ? jit * 1.5 : 0);
    }
    out[i] = h;
  }
}

/** linear interpolation of a profile at distance d (matches the mesh between columns) */
export function profileAt(prof: ArrayLike<number>, d: number): number {
  if (d <= 0) return prof[0];
  for (let i = 1; i < NL; i++) {
    if (d <= LAT[i]) {
      const u = (d - LAT[i - 1]) / (LAT[i] - LAT[i - 1]);
      return prof[i - 1] + (prof[i] - prof[i - 1]) * u;
    }
  }
  return prof[NL - 1];
}

/** steepness (height change per u) of the profile around d */
export function profileSlope(prof: ArrayLike<number>, d: number): number {
  return Math.abs(profileAt(prof, d + 0.8) - profileAt(prof, Math.max(0, d - 0.8))) / 1.6;
}
