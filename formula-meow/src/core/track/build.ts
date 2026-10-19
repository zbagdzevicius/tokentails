/**
 * TrackDef → BuiltTrack (GDD 6.2). Pure and sim-safe (LUT trig only, no randomness): the sim, the AI, the validator and
 * the mesh all read this one structure, so authored and UGC tracks behave the same everywhere.
 *
 * Steps: centripetal Catmull-Rom → even 0.5 m samples → planar frames (tangent, right = (-tz, tx)) → signed
 * curvature (+ = left turn) → banking → walls and zones from features → racing line → query grid → rotate so
 * sample 0 is the start line.
 */
import { Modifier, type FeatureKind, type TrackDef } from '../../types';
import { COINS, PHYS, RACE, TRACK } from '../../tuning';
import { atan2L, clamp, wrapAngle } from '../sim/fixed';
import { densePolyline, resample, type Vec3 } from './spline';
import { computeRacingLine } from './racing-line';

export interface PadZone {
  /** sample index of the pad centre */
  i: number;
  /** lateral centre */
  d: number;
  halfLen: number;
  halfW: number;
}

export interface RampZone {
  /** sample index of the lip (launch point) */
  i: number;
  d: number;
  halfW: number;
  /** run-up length in samples */
  len: number;
  height: number;
}

export interface BoxSpot {
  x: number;
  y: number;
  z: number;
  s: number;
}

export interface FeatureSpot {
  i: number;
  kind: FeatureKind;
  side: -1 | 0 | 1;
}

/** One fish coin (iteration 2), expanded from TrackDef.coins rows. */
export interface CoinSpot {
  x: number;
  y: number;
  z: number;
  /** sample index and lateral offset */
  i: number;
  d: number;
}

export interface BuiltTrack {
  def: TrackDef;
  /** sample count, spacing (m), lap length (m) */
  n: number;
  step: number;
  length: number;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  /** planar unit tangent; right vector is (-tz, tx) */
  tx: Float64Array;
  tz: Float64Array;
  /** signed curvature 1/m, + = turning left (heading increasing) */
  curv: Float64Array;
  /** bank slope: surface y = centre y + d × bank */
  bank: Float64Array;
  halfW: Float64Array;
  /** wall distance from the centre on each side (positive numbers) */
  wallL: Float64Array;
  wallR: Float64Array;
  /** per-sample flags: 1 = low grip on the road */
  lowgrip: Uint8Array;
  /** racing line lateral offset (GDD 5.2) */
  line: Float64Array;
  pads: PadZone[];
  ramps: RampZone[];
  boxes: BoxSpot[];
  features: FeatureSpot[];
  /** fish coins (iteration 2), in row order */
  coins: CoinSpot[];
  /** 'arena': no laps, no wrong way, no distance watchdog (battle) */
  arena: boolean;
  /** query grid: cell key → sample indices */
  cells: Map<number, number[]>;
  minRadius: number;
  maxClimb: number;
  mirrored: boolean;
}

export const cellKey = (x: number, z: number): number => (Math.floor(x / TRACK.cell) + 2048) * 4096 + (Math.floor(z / TRACK.cell) + 2048);

const RAMP_RUN = 7; // m
const RAMP_HEIGHT = 0.9;
const PAD_LEN = 7;
const PAD_W = 6;
const ZONE_LEN = { lowgrip: 36, offroad: 46, shortcut: 46 } as const;

export function buildTrack(def: TrackDef, modifiers = 0): BuiltTrack {
  const mirror = (modifiers & Modifier.Mirror) !== 0;
  const ctrl: Vec3[] = def.points.map((p) => ({ x: mirror ? -p.x : p.x, y: p.h * TRACK.heightStep, z: p.z }));
  const widths = def.points.map((p) => TRACK.widths[p.w] ?? 12);
  const dense = densePolyline(ctrl);
  const n0 = Math.max(16, Math.round(dense.total / TRACK.sample));
  const rs = resample(dense, n0);
  const step = rs.step;

  // width per sample: interpolate the control widths along the dense parameter
  const halfW0 = new Float64Array(n0);
  {
    const pa = dense.pointAt.map((k) => dense.len[k]);
    for (let i = 0; i < n0; i++) {
      const s = i * step;
      let k = 0;
      while (k < pa.length - 1 && pa[k + 1] <= s) k++;
      const a = pa[k];
      const b = k + 1 < pa.length ? pa[k + 1] : dense.total;
      const f = b > a ? (s - a) / (b - a) : 0;
      const w0 = widths[k];
      const w1 = widths[(k + 1) % widths.length];
      halfW0[i] = (w0 + (w1 - w0) * f) / 2;
    }
  }

  // start line: rotate so sample 0 is the start
  const startF = def.features.find((f) => f.kind === 'start');
  const startI = startF ? Math.round((startF.s / 256) * n0) % n0 : 0;
  const n = n0;
  const rot = <T extends Float64Array>(a: T): T => {
    const o = new (a.constructor as new (n: number) => T)(n);
    for (let i = 0; i < n; i++) o[i] = a[(i + startI) % n];
    return o;
  };
  const px = rot(rs.x);
  const py = rot(rs.y);
  const pz = rot(rs.z);
  const halfW = rot(halfW0);
  const idx = (fs: number): number => (((Math.round((fs / 256) * n) - startI) % n) + n) % n;

  // frames
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  const hd = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = px[b] - px[a];
    const dz = pz[b] - pz[a];
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
    hd[i] = atan2L(tx[i], tz[i]);
  }

  // curvature over ±4 samples, then smoothed
  const curv = new Float64Array(n);
  const K = 4;
  for (let i = 0; i < n; i++) {
    const dh = wrapAngle(hd[(i + K) % n] - hd[(i - K + n) % n]);
    curv[i] = dh / (2 * K * step);
  }
  smooth(curv, 3, 2);
  let maxK = 0;
  for (let i = 0; i < n; i++) maxK = Math.max(maxK, Math.abs(curv[i]));

  // banking (inner side lower), smoothed
  const bank = new Float64Array(n);
  const maxSlope = TRACK.maxBank; // radians ≈ slope for small angles
  for (let i = 0; i < n; i++) bank[i] = clamp(TRACK.bankK * curv[i], -maxSlope, maxSlope);
  smooth(bank, 10, 3);
  // tilt the road around its low edge (not its centre line), so the inner side of a banked turn never sinks
  // below the ground it was drawn on: lift the centre by the drop at the wall
  for (let i = 0; i < n; i++) py[i] += (halfW[i] + PHYS.wallMargin) * Math.abs(bank[i]);

  // climb
  let maxClimb = 0;
  for (let i = 0; i < n; i++) maxClimb = Math.max(maxClimb, Math.abs(py[(i + 1) % n] - py[i]) / step);

  // features
  const wallL = new Float64Array(n);
  const wallR = new Float64Array(n);
  const lowgrip = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    wallL[i] = halfW[i] + PHYS.wallMargin;
    wallR[i] = halfW[i] + PHYS.wallMargin;
  }
  const pads: PadZone[] = [];
  const ramps: RampZone[] = [];
  const boxes: BoxSpot[] = [];
  const features: FeatureSpot[] = [];
  for (const f of def.features) {
    const i = idx(f.s);
    const side = (mirror ? -(f.side ?? 0) : (f.side ?? 0)) as -1 | 0 | 1;
    features.push({ i, kind: f.kind, side });
    const hw = halfW[i];
    switch (f.kind) {
      case 'pad':
        pads.push({ i, d: side * hw * 0.5, halfLen: PAD_LEN / 2, halfW: side === 0 ? PAD_W / 2 : Math.min(PAD_W / 2, hw * 0.5) });
        break;
      case 'ramp':
        ramps.push({ i, d: side * hw * 0.5, halfW: side === 0 ? hw : hw * 0.5, len: Math.round(RAMP_RUN / step), height: RAMP_HEIGHT });
        break;
      case 'items': {
        const count = hw * 2 >= 13 ? 5 : 4;
        const rx = -tz[i];
        const rz = tx[i];
        for (let c = 0; c < count; c++) {
          const d = (c - (count - 1) / 2) * ((hw * 2 - 3) / (count - 1));
          boxes.push({ x: px[i] + rx * d, y: py[i] + d * bank[i] + 0.9, z: pz[i] + rz * d, s: i * step });
        }
        break;
      }
      case 'lowgrip':
        for (let k = 0; k < ZONE_LEN.lowgrip / step; k++) lowgrip[(i + k) % n] = 1;
        break;
      case 'offroad':
      case 'shortcut': {
        const len = ZONE_LEN[f.kind] / step;
        for (let k = 0; k < len; k++) {
          const j = (i + k) % n;
          const out = halfW[j] + PHYS.offroadMargin;
          if (side <= 0) wallL[j] = Math.max(wallL[j], out);
          if (side >= 0) wallR[j] = Math.max(wallR[j], out);
        }
        break;
      }
      default:
        break;
    }
  }
  // walls taper back in (never a step the kart could snag on)
  taper(wallL, step * 0.45);
  taper(wallR, step * 0.45);

  const line = computeRacingLine(curv, halfW, step);

  // fish coins: rows across the road, `count` coins `COINS.spacing` apart around `d` (clamped inside the road)
  const coins: CoinSpot[] = [];
  for (const row of def.coins ?? []) {
    if (row.branch != null) continue; // branch coins: tracks lane, with the branch primitive
    const i = idx(row.s);
    const hw = halfW[i];
    const dc = mirror ? -row.d : row.d;
    for (let c = 0; c < row.count; c++) {
      const lim = hw - 0.8;
      const d = clamp(dc + (c - (row.count - 1) / 2) * COINS.spacing, -lim, lim);
      coins.push({ x: px[i] - tz[i] * d, y: py[i] + d * bank[i] + 0.7, z: pz[i] + tx[i] * d, i, d });
    }
  }

  const cells = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const key = cellKey(px[i], pz[i]);
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(i);
  }

  return {
    def,
    n,
    step,
    length: n * step,
    px,
    py,
    pz,
    tx,
    tz,
    curv,
    bank,
    halfW,
    wallL,
    wallR,
    lowgrip,
    line,
    pads,
    ramps,
    boxes,
    features,
    coins,
    arena: def.kind === 'arena',
    cells,
    minRadius: maxK > 0 ? 1 / maxK : Infinity,
    maxClimb,
    mirrored: mirror,
  };
}

/** Box-blur a closed array `passes` times with half window `r`. */
export function smooth(a: Float64Array, r: number, passes: number): void {
  const n = a.length;
  const tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[(i + k + n) % n];
      tmp[i] = s / (2 * r + 1);
    }
    a.set(tmp);
  }
}

/** Limit how fast a wall distance may shrink from one sample to the next (both directions, closed loop). */
function taper(w: Float64Array, maxStep: number): void {
  const n = w.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < 2 * n; k++) {
      const i = k % n;
      const p = (i - 1 + n) % n;
      if (w[i] < w[p] - maxStep) w[i] = w[p] - maxStep;
    }
    for (let k = 2 * n; k > 0; k--) {
      const i = k % n;
      const p = (i + 1) % n;
      if (w[i] < w[p] - maxStep) w[i] = w[p] - maxStep;
    }
  }
}

export interface GridSlot {
  x: number;
  z: number;
  heading: number;
  si: number;
  /** distance along the track (negative: behind the start line) */
  dist: number;
}

/** Starting grid slot k (0 = pole): two staggered columns behind the start line. */
export function gridSlot(t: BuiltTrack, k: number): GridSlot {
  const row = Math.floor(k / 2);
  const col = k % 2;
  const back = RACE.gridFirstRow + row * RACE.gridRowGap + col * (RACE.gridRowGap / 2);
  const si = (t.n - Math.round(back / t.step)) % t.n;
  const lat = (col === 0 ? -1 : 1) * (RACE.gridColGap / 2);
  const rx = -t.tz[si];
  const rz = t.tx[si];
  return { x: t.px[si] + rx * lat, z: t.pz[si] + rz * lat, heading: atan2L(t.tx[si], t.tz[si]), si, dist: -back };
}
