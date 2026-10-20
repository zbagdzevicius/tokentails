/**
 * Set-piece poses (render-only, SIM_VERSION 8; docs/plans/formula-meow/SETPIECES.md section 7). The sim keeps karts
 * on the flat "shadow" of a piece; this bends them into 3D:
 * - loop: the ribbon (core/track/stunt.ts LOOP_SHAPE) sampled at the kart's `su` (metres along the rail) and `sd`
 *   (across it), mapped onto the shadow's curvilinear frame so a loop on a gently bending road bends with it;
 * - wall ride: the lane past the road edge curls up a quarter pipe (radius `STUNT.wall.curlR`, up to `curlMax`°), the
 *   sim's lateral metres becoming arc length on the curl.
 * A pose is a position plus a basis: `u` the kart's up (the surface normal), `f` its forward. Math trig is fine here.
 */
import type { KartState } from '../../types';
import { STUNT } from '../../tuning';
import type { BuiltPiece, BuiltTrack } from '../track/build';
import { LOOP_LP, ribbonLocal } from '../track/stunt';

export interface StuntPose {
  x: number;
  y: number;
  z: number;
  /** up (surface normal), unit */
  ux: number;
  uy: number;
  uz: number;
  /** forward (travel direction on the surface), unit */
  fx: number;
  fy: number;
  fz: number;
}

/** The ribbon as a table over its arc length (render's own Math trig; scaled to the sim's LOOP_LP). */
interface RibbonTable {
  n: number;
  /** metres along the ribbon at each row (0..LOOP_LP) */
  u: Float64Array;
  f: Float64Array;
  h: Float64Array;
  l: Float64Array;
}

let table: RibbonTable | null = null;

function ribbonTable(): RibbonTable {
  if (table) return table;
  const segs: Array<[0 | 1 | 2, number, number]> = [
    [0, 1, 40],
    [1, Math.PI * 2, 400],
    [2, 1, 40],
  ];
  const rows = segs.reduce((a, s) => a + s[2], 0) + 1;
  const u = new Float64Array(rows);
  const f = new Float64Array(rows);
  const h = new Float64Array(rows);
  const l = new Float64Array(rows);
  const q = { f: 0, h: 0, l: 0 };
  let r = 0;
  ribbonLocal(0, 0, Math.sin, Math.cos, q);
  f[0] = q.f;
  h[0] = q.h;
  l[0] = q.l;
  for (const [seg, span, steps] of segs)
    for (let s = 1; s <= steps; s++) {
      ribbonLocal(seg, (span * s) / steps, Math.sin, Math.cos, q);
      r++;
      f[r] = q.f;
      h[r] = q.h;
      l[r] = q.l;
      u[r] = u[r - 1] + Math.hypot(f[r] - f[r - 1], h[r] - h[r - 1], l[r] - l[r - 1]);
    }
  const k = LOOP_LP / u[r];
  for (let i = 0; i <= r; i++) u[i] *= k;
  table = { n: rows, u, f, h, l };
  return table;
}

/**
 * The ribbon's local point (shadow frame: along, height, lateral) at `su` metres. Outside 0..LOOP_LP it runs on as the
 * flat shadow road before and after the piece (the ribbon starts at f 0 and ends at f = zone, both on the road), so a
 * camera rig 7.5 m behind a kart just past the zone start still gets a real frame (playtest: it collapsed to deck height).
 */
export function ribbonLocalAt(su: number, out: { f: number; h: number; l: number }): void {
  const tb = ribbonTable();
  if (su < 0) {
    out.f = tb.f[0] + su;
    out.h = 0;
    out.l = tb.l[0];
    return;
  }
  if (su > LOOP_LP) {
    out.f = tb.f[tb.n - 1] + (su - LOOP_LP);
    out.h = 0;
    out.l = tb.l[tb.n - 1];
    return;
  }
  const s = su;
  let lo = 0;
  let hi = tb.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tb.u[mid] <= s) lo = mid;
    else hi = mid;
  }
  const w = tb.u[hi] > tb.u[lo] ? (s - tb.u[lo]) / (tb.u[hi] - tb.u[lo]) : 0;
  out.f = tb.f[lo] + (tb.f[hi] - tb.f[lo]) * w;
  out.h = tb.h[lo] + (tb.h[hi] - tb.h[lo]) * w;
  out.l = tb.l[lo] + (tb.l[hi] - tb.l[lo]) * w;
}

const loc = { f: 0, h: 0, l: 0 };

/** World point of the shadow-frame coordinates (f metres from the piece's i0, h up, l to the right). */
export function shadowToWorld(t: BuiltTrack, pc: BuiltPiece, f: number, h: number, l: number, out: { x: number; y: number; z: number }): void {
  const fi = f / t.step;
  const a = Math.floor(fi);
  const w = fi - a;
  const i = (((pc.i0 + a) % t.n) + t.n) % t.n;
  const j = (i + 1) % t.n;
  const px = t.px[i] + (t.px[j] - t.px[i]) * w;
  const py = t.py[i] + (t.py[j] - t.py[i]) * w;
  const pz = t.pz[i] + (t.pz[j] - t.pz[i]) * w;
  let tx = t.tx[i] + (t.tx[j] - t.tx[i]) * w;
  let tz = t.tz[i] + (t.tz[j] - t.tz[i]) * w;
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  out.x = px - tz * l;
  out.y = py + h;
  out.z = pz + tx * l;
}

const pa = { x: 0, y: 0, z: 0 };
const pb = { x: 0, y: 0, z: 0 };
const fr0 = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, fx: 0, fy: 0, fz: 0 };
const frA = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, fx: 0, fy: 0, fz: 0 };
const frB = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, fx: 0, fy: 0, fz: 0 };
type Frame = typeof fr0;

/** The centre line's point, forward and deck-lateral axis at `su` (the shadow's right made perpendicular to forward). */
function centreFrame(t: BuiltTrack, pc: BuiltPiece, su: number, out: Frame): void {
  const e = 0.25;
  ribbonLocalAt(su - e, loc);
  shadowToWorld(t, pc, loc.f, loc.h, loc.l, pa);
  ribbonLocalAt(su + e, loc);
  shadowToWorld(t, pc, loc.f, loc.h, loc.l, pb);
  let fx = pb.x - pa.x;
  let fy = pb.y - pa.y;
  let fz = pb.z - pa.z;
  const fl = Math.hypot(fx, fy, fz);
  if (fl < 1e-9) {
    // degenerate (never with the extrapolated ribbon, kept as a guard): the road tangent
    const i = (((pc.i0 + Math.floor(Math.max(0, loc.f) / t.step)) % t.n) + t.n) % t.n;
    fx = t.tx[i];
    fy = 0;
    fz = t.tz[i];
  } else {
    fx /= fl;
    fy /= fl;
    fz /= fl;
  }
  ribbonLocalAt(su, loc);
  shadowToWorld(t, pc, loc.f, loc.h, loc.l, pa);
  shadowToWorld(t, pc, loc.f, loc.h, loc.l + 1, pb);
  let rx = pb.x - pa.x;
  let ry = 0;
  let rz = pb.z - pa.z;
  const dot = rx * fx + ry * fy + rz * fz;
  rx -= fx * dot;
  ry -= fy * dot;
  rz -= fz * dot;
  const rl = Math.hypot(rx, ry, rz) || 1;
  out.x = pa.x;
  out.y = pa.y;
  out.z = pa.z;
  out.rx = rx / rl;
  out.ry = ry / rl;
  out.rz = rz / rl;
  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
}

/**
 * Loop ribbon pose at `su` m along and `sd` m across (+ = right), `lift` m off the deck. Forward is the travel direction
 * of the offset path itself (the points `sd` across at su ± e), so a kart off the centre line through the corkscrew's
 * sway points where it goes (playtest: the nose was 24–28° off at the top with |sd| = 2). The deck's lateral axis is
 * the centre frame's, made perpendicular to that forward; up = lateral × forward (the inside of the loop).
 */
export function ribbonPose(t: BuiltTrack, pc: BuiltPiece, su: number, sd: number, lift: number, out: StuntPose): StuntPose {
  const e = 0.3;
  centreFrame(t, pc, su, fr0);
  let fx = fr0.fx;
  let fy = fr0.fy;
  let fz = fr0.fz;
  if (sd !== 0) {
    centreFrame(t, pc, su - e, frA);
    centreFrame(t, pc, su + e, frB);
    const dx = frB.x + frB.rx * sd - (frA.x + frA.rx * sd);
    const dy = frB.y + frB.ry * sd - (frA.y + frA.ry * sd);
    const dz = frB.z + frB.rz * sd - (frA.z + frA.rz * sd);
    const dl = Math.hypot(dx, dy, dz);
    if (dl > 1e-6) {
      fx = dx / dl;
      fy = dy / dl;
      fz = dz / dl;
    }
  }
  let rx = fr0.rx;
  let ry = fr0.ry;
  let rz = fr0.rz;
  const dot = rx * fx + ry * fy + rz * fz;
  rx -= fx * dot;
  ry -= fy * dot;
  rz -= fz * dot;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // up = right × forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  out.x = fr0.x + fr0.rx * sd + ux * lift;
  out.y = fr0.y + fr0.ry * sd + uy * lift;
  out.z = fr0.z + fr0.rz * sd + uz * lift;
  out.ux = ux;
  out.uy = uy;
  out.uz = uz;
  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
  return out;
}

/** Curl of a wall-ride lane at lateral metres `dl` past the road edge (lane width `lane`): offset out and up, and the tilt. */
export function curlAt(dl: number, lane: number, out: { o: number; h: number; phi: number }): void {
  const R = STUNT.wall.curlR;
  const max = ((STUNT.wall.curlMax * Math.PI) / 180) * Math.min(1, Math.max(0, lane / STUNT.wall.lane));
  const arc = R * max;
  const d = Math.max(0, dl);
  if (d <= arc || max <= 0) {
    const phi = max > 0 ? d / R : 0;
    out.o = max > 0 ? R * Math.sin(phi) : d;
    out.h = max > 0 ? R * (1 - Math.cos(phi)) : 0;
    out.phi = phi;
    return;
  }
  out.o = R * Math.sin(max) + (d - arc) * Math.cos(max);
  out.h = R * (1 - Math.cos(max)) + (d - arc) * Math.sin(max);
  out.phi = max;
}

const curl = { o: 0, h: 0, phi: 0 };

/** A point on the curled lane at main sample i, lateral d (|d| > halfW on the lane's side), lifted `lift` along the normal. */
export function lanePose(t: BuiltTrack, i: number, d: number, lift: number, out: StuntPose): StuntPose | null {
  const side = d > 0 ? 1 : -1;
  const lane = side > 0 ? t.laneR[i] : t.laneL[i];
  const hw = t.halfW[i];
  if (!(lane > 0.05) || Math.abs(d) <= hw) return null;
  curlAt(Math.abs(d) - hw, lane, curl);
  const rx = -t.tz[i];
  const rz = t.tx[i];
  const ex = t.px[i] + rx * side * hw;
  const ey = t.py[i] + side * hw * t.bank[i];
  const ez = t.pz[i] + rz * side * hw;
  // the curl rises out of the banked road plane: tilt about the tangent by the bank plus the curl
  const bank = Math.atan(t.bank[i]) * side;
  const a = bank + curl.phi;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const o = curl.o;
  const h = curl.h;
  // lateral and up along the banked plane's own axes
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  const lat = o * cb - h * sb;
  const up = o * sb + h * cb;
  out.x = ex + rx * side * lat;
  out.y = ey + up;
  out.z = ez + rz * side * lat;
  // normal: tilted toward the road by a
  out.ux = -rx * side * sinA;
  out.uy = cosA;
  out.uz = -rz * side * sinA;
  out.x += out.ux * lift;
  out.y += out.uy * lift;
  out.z += out.uz * lift;
  out.fx = t.tx[i];
  out.fy = 0;
  out.fz = t.tz[i];
  return out;
}

/**
 * The drawn pose of a kart on a set piece (loop rail or wall lane), or null when it drives the normal road. `lift` is
 * how far the kart's origin sits off the surface (0 for the kart's wheels).
 */
export function kartStuntPose(t: BuiltTrack, k: KartState, out: StuntPose): StuntPose | null {
  if (!t.pieces.length) return null;
  if (k.rail > 0) {
    const pc = t.pieces[k.rail - 1];
    if (!pc) return null;
    return ribbonPose(t, pc, k.su, k.sd, 0.03, out);
  }
  if (k.air || k.respawnTicks > 0 || k.netTicks > 0) return null;
  const i = k.si;
  if (i < 0 || i >= t.n) return null;
  return lanePose(t, i, k.d, 0, out);
}
