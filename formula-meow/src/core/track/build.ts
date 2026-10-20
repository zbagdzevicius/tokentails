/**
 * TrackDef → BuiltTrack (GDD 6.2). Pure and sim-safe (LUT trig only, no randomness): the sim, the AI, the validator and
 * the mesh all read this one structure, so authored and UGC tracks behave the same everywhere.
 *
 * Steps: centripetal Catmull-Rom → even 0.5 m samples → planar frames (tangent, right = (-tz, tx)) → signed
 * curvature (+ = left turn) → banking → walls and zones from features → racing line → query grid → rotate so
 * sample 0 is the start line.
 *
 * Iteration 2 (tracks lane): alternative routes (`branches`, branch.ts, plus the UGC "shortcut" sticker), union walls
 * where a branch meets the main road, hazard placements (`hazards`, from `TrackDef.hazards` and the UGC "hazard"
 * sticker), milk puddles (low grip), open bridges without walls (`voidMask`, tracks/extras.ts), branch coin rows.
 */
import { HAZARD_KINDS, Modifier, type FeatureKind, type HazardKind, type TrackDef } from '../../types';
import { COINS, PHYS, RACE, TRACK } from '../../tuning';
import { atan2L, clamp, wrapAngle } from '../sim/fixed';
import { densePolyline, resample, type Vec3 } from './spline';
import { computeRacingLine } from './racing-line';
import { cellKey } from './grid';
import { branchClear, buildBranch, joinWalls, shortcutSpec, specOf, type BuiltBranch } from './branch';
import { HAZARD_PERIOD, hazardSpotsOf } from './hazard-spots';
import { extrasOf } from './tracks/extras';

export { cellKey };
export type { BuiltBranch };

/** A hazard placed on the track (resolved from a HazardSpot): the sim (src/tracks/hazards) and its view read it. */
export interface HazardPlace {
  /** index in hazardSpotsOf(def) (the `b` of `hazard` events) */
  id: number;
  kind: HazardKind;
  /** HAZARD_KINDS index (the `a` of `hazard` events) */
  k: number;
  /** -1 = main loop, else the branch id; `i` is the main sample (a branch's mapped one) */
  branch: number;
  i: number;
  /** centre of the hazard on the road, and the road frame there (tangent; right = (-tz, tx)) */
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  /** road half width at the spot and the lateral centre used */
  halfW: number;
  d: number;
  side: -1 | 0 | 1;
  /** cycle and phase in ticks */
  period: number;
  phase: number;
}

/** A milk puddle (low grip disc). */
export interface Puddle {
  x: number;
  z: number;
  r: number;
  /** hazard id */
  id: number;
}

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
  /** alternative routes (iteration 2): authored ones by `TrackDef.branches` index, then the UGC shortcuts */
  branches: BuiltBranch[];
  /** where a branch overlaps a main sample its wall was widened: bit 1 left, bit 2 right (no kerb or barrier there) */
  junction: Uint8Array;
  /** 1 on open bridge samples: no walls, and off the deck is a fall */
  voidMask: Uint8Array;
  hazards: HazardPlace[];
  puddles: Puddle[];
  /** solid round props karts bounce off (src/tracks/hazards/rules.ts) */
  blocks: Array<{ x: number; z: number; r: number }>;
  /** query grid: cell key → sample indices */
  cells: Map<number, number[]>;
  minRadius: number;
  maxClimb: number;
  mirrored: boolean;
}

const RAMP_RUN = 7; // m
const RAMP_HEIGHT = 0.9;
const PAD_LEN = 7;
const PAD_W = 6;
/** racing-line coin trails (SIM_VERSION 7): one every LINE_COIN_GAP m, LINE_COIN_TRAIL coins LINE_COIN_STEP m apart */
const LINE_COIN_GAP = 70;
const LINE_COIN_TRAIL = 3;
const LINE_COIN_STEP = 3.5;
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
  const arena = def.kind === 'arena';
  // an arena is a flat floor (its ring is only the frame the query measures from)
  for (let i = 0; i < n; i++) bank[i] = arena ? 0 : clamp(TRACK.bankK * curv[i], -maxSlope, maxSlope);
  smooth(bank, 10, 3);
  // junctions are flat (iteration 2): no banking where a branch leaves or rejoins, so the two surfaces meet level
  {
    const ends: number[] = [];
    for (const b of def.branches ?? []) ends.push(idx(b.from), -idx(b.to) - 1);
    for (const f of def.features) {
      if (f.kind !== 'shortcut') continue;
      const c = idx(f.s);
      ends.push((c - Math.round(26 / step) + n) % n, -((c + Math.round(26 / step)) % n) - 1);
    }
    if (ends.length) {
      const flat = new Float64Array(n).fill(1);
      const near = Math.round(18 / step);
      const far = Math.round(48 / step);
      const ramp = Math.round(16 / step);
      for (const e of ends) {
        // a fork flattens from `near` before to `far` after it, a merge from `far` before to `near` after
        const at = e >= 0 ? e : -e - 1;
        const lo = e >= 0 ? -near : -far;
        const hi = e >= 0 ? far : near;
        for (let k = lo - ramp; k <= hi + ramp; k++) {
          const i = (((at + k) % n) + n) % n;
          const out = k < lo ? (lo - k) / ramp : k > hi ? (k - hi) / ramp : 0;
          const w = out * out * (3 - 2 * out);
          flat[i] = Math.min(flat[i], w);
        }
      }
      for (let i = 0; i < n; i++) bank[i] *= flat[i];
    }
  }
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
        widenZone(halfW, wallL, wallR, i, side, ZONE_LEN.offroad / step);
        break;
      default:
        // 'shortcut' becomes a branch below; 'hazard' a hazard spot (hazard-spots.ts)
        break;
    }
  }
  // walls taper back in (never a step the kart could snag on)
  taper(wallL, step * 0.45);
  taper(wallR, step * 0.45);
  if (arena) {
    // an open floor: the inner wall reaches past the ring's centre, the outer one is the room's edge
    for (let i = 0; i < n; i++) {
      const inner = 1 / Math.max(1e-3, Math.abs(curv[i])) + 8;
      const outer = halfW[i] + ARENA_RIM;
      if (curv[i] >= 0) {
        wallL[i] = inner;
        wallR[i] = outer;
      } else {
        wallL[i] = outer;
        wallR[i] = inner;
      }
    }
  }

  const line = computeRacingLine(curv, halfW, step);

  // --- iteration 2: alternative routes ------------------------------------------------------------------------
  const main = { n, step, length: n * step, px, py, pz, tx, tz, curv, bank, halfW, wallL, wallR };
  const branches: BuiltBranch[] = [];
  (def.branches ?? []).forEach((b, k) => {
    const built = buildBranch(main, specOf(b, mirror, idx), k);
    if (built) branches.push(built);
  });
  // UGC shortcut stickers: a short off-road branch across the inside of the bend (v1 made them an off-road verge,
  // which is still the fallback when the branch would touch another part of the loop)
  let fallback = false;
  for (const f of features) {
    if (f.kind !== 'shortcut') continue;
    // the shortest reach whose chord is a real short cut (≤ 87 % of the road it skips) and clear of the loop
    const apart = Math.round(90 / step); // branch windows (±40 m) never overlap
    let built: BuiltBranch | null = null;
    for (const reach of [40, 55, 70]) {
      const spec = shortcutSpec(main, f.i, f.side, reach);
      const b = spec ? buildBranch(main, spec, (def.branches?.length ?? 0) + branches.length) : null;
      if (!b || b.length > 0.87 * b.span * step || !branchClear(main, b)) continue;
      if (!branches.every((o) => fwd(o.from, b.from, n) > o.span + apart && fwd(b.from, o.from, n) > b.span + apart)) continue;
      built = b;
      break;
    }
    if (built) branches.push(built);
    else {
      widenZone(halfW, wallL, wallR, f.i, f.side, ZONE_LEN.shortcut / step);
      fallback = true;
    }
  }
  if (fallback) {
    taper(wallL, step * 0.45);
    taper(wallR, step * 0.45);
  }
  const junction = new Uint8Array(n);
  joinWalls(main, branches, junction);

  // --- authored extras (tracks/extras.ts): open bridges, branch gaps and pads, solid props --------------------
  const extras = extrasOf(def.id);
  const voidMask = new Uint8Array(n);
  for (const [a, b] of extras.voids ?? []) {
    const i0 = idx(a);
    const len = fwd(i0, idx(b), n);
    for (let k = 0; k <= len; k++) {
      const j = (i0 + k) % n;
      voidMask[j] = 1;
      wallL[j] = wallR[j] = halfW[j] + VOID_WALL;
    }
  }

  const branchById = (id: number | undefined): BuiltBranch | null => (id == null ? null : (branches.find((b) => b.id === id) ?? null));
  for (const g of extras.gaps ?? []) {
    const b = branchById(g.branch);
    if (!b) continue;
    const j0 = clamp(Math.round(g.at * (b.m - 1)), 1, b.m - 2);
    const j1 = Math.min(b.m - 2, j0 + Math.max(1, Math.round(g.len / b.step)));
    // the far side starts `drop` lower and climbs back to the merge over GAP_CLIMB metres
    for (let j = j1; j < b.m; j++) b.py[j] -= g.drop * Math.max(0, 1 - ((j - j1) * b.step) / GAP_CLIMB);
    b.gap = { j0, j1, y1: b.py[j1] };
  }
  for (const p of extras.branchPads ?? []) {
    const b = branchById(p.branch);
    if (!b) continue;
    const j = clamp(Math.round(p.at * (b.m - 1)), 0, b.m - 1);
    b.pads.push({ j, halfLen: Math.round(PAD_LEN / 2 / b.step), halfW: Math.min(PAD_W / 2, b.halfW[j] * 0.6) });
    b.tBranch -= PAD_GAIN;
  }
  const blocks = (extras.blocks ?? []).map((k) => ({ x: mirror ? -k.x : k.x, z: k.z, r: k.r }));

  // fish coins: rows across the road, `count` coins `COINS.spacing` apart around `d` (clamped inside the road); a
  // branch row's `s` is the fraction (0..255) along that branch
  const coins: CoinSpot[] = [];
  for (const row of def.coins ?? []) {
    const dc = mirror ? -row.d : row.d;
    const b = branchById(row.branch);
    if (row.branch != null && !b) continue;
    const f = b ? frameOnBranch(b, row.s) : frameOnMain(main, idx(row.s));
    for (let c = 0; c < row.count; c++) {
      const lim = f.hw - 0.8;
      const d = clamp(dc + (c - (row.count - 1) / 2) * COINS.spacing, -lim, lim);
      coins.push({ x: f.x - f.tz * d, y: f.y + d * f.bank + 0.7, z: f.z + f.tx * d, i: f.i, d });
    }
  }
  // SIM_VERSION 7: short trails of coins on the racing line every ~LINE_COIN_GAP metres, so a player who drives well
  // collects them (the authored rows sit across the road and were rarely driven through); clear of the start, the
  // authored rows, item rows and ramps
  if (def.kind !== 'arena' && def.lineCoins !== false) {
    const authored = coins.map((c) => c.i);
    const busy = features.filter((f) => f.kind === 'items' || f.kind === 'ramp' || f.kind === 'start').map((f) => f.i);
    const near = (list: number[], i: number, m: number): boolean => list.some((j) => Math.min(fwd(i, j, n), fwd(j, i, n)) * step < m);
    const gap = Math.max(1, Math.round(LINE_COIN_GAP / step));
    const along = Math.max(1, Math.round(LINE_COIN_STEP / step));
    for (let i0 = Math.round(40 / step); i0 + gap / 2 < n; i0 += gap) {
      if (near(authored, i0, 25) || near(busy, i0, 14)) continue;
      for (let c = 0; c < LINE_COIN_TRAIL; c++) {
        const f = frameOnMain(main, (i0 + c * along) % n);
        const lim = f.hw - 0.8;
        const d = clamp(line[f.i], -lim, lim);
        coins.push({ x: f.x - f.tz * d, y: f.y + d * f.bank + 0.7, z: f.z + f.tx * d, i: f.i, d });
      }
    }
  }

  // hazards: placed on the main loop or a branch, centred or on one side
  const hazards: HazardPlace[] = [];
  const puddles: Puddle[] = [];
  hazardSpotsOf(def).forEach((spot, id) => {
    const b = branchById(spot.branch);
    if (spot.branch != null && !b) return;
    const f = b ? frameOnBranch(b, spot.s) : frameOnMain(main, idx(spot.s));
    const side = (mirror ? -(spot.side ?? 0) : (spot.side ?? 0)) as -1 | 0 | 1;
    const d = spot.kind === 'roomba' || spot.kind === 'drum' || spot.kind === 'laundry' ? 0 : side * f.hw * 0.45;
    const period = Math.max(30, Math.round((spot.period ?? HAZARD_PERIOD[spot.kind]) * 60));
    const place: HazardPlace = {
      id,
      kind: spot.kind,
      k: HAZARD_KINDS.indexOf(spot.kind),
      branch: b ? b.id : -1,
      i: f.i,
      x: f.x - f.tz * d,
      y: f.y + d * f.bank,
      z: f.z + f.tx * d,
      tx: f.tx,
      tz: f.tz,
      halfW: f.hw,
      d,
      side,
      period,
      phase: Math.round(clamp(spot.phase ?? 0, 0, 1) * period),
    };
    hazards.push(place);
    if (spot.kind === 'milk') puddles.push({ x: place.x, z: place.z, r: MILK_R, id });
  });

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
    branches,
    junction,
    voidMask,
    hazards,
    puddles,
    blocks,
    cells,
    minRadius: maxK > 0 ? 1 / maxK : Infinity,
    maxClimb,
    mirrored: mirror,
  };
}

/** Milk puddle radius (m) and how far past an open bridge's deck the (never reached) wall sits. */
export const MILK_R = 3.4;
export const VOID_WALL = 60;
/** seconds a boost pad is worth to the AI's route choice (0.8 s at ×1.35) */
const PAD_GAIN = 0.3;
/** metres over which a gap's lowered far side climbs back to the branch's height */
const GAP_CLIMB = 24;
/** arena: the room's edge sits this far past the frame ring's road edge */
export const ARENA_RIM = 14;

/**
 * The farther wall of main sample i as the loop's own footprint: off-road verges count, but not the walls an open
 * bridge drops (`voidMask`) or a branch's overlap widens (`junction`). Overlap checks and prop placement use this.
 */
export function outerWall(t: BuiltTrack, i: number): number {
  const hw = t.halfW[i];
  if (t.voidMask[i]) return hw + PHYS.wallMargin;
  return Math.min(Math.max(t.wallL[i], t.wallR[i]), hw + PHYS.offroadMargin);
}

/** Push the wall out to the off-road margin over `len` samples from `i` on `side` (0 = both). */
function widenZone(halfW: Float64Array, wallL: Float64Array, wallR: Float64Array, i: number, side: number, len: number): void {
  const n = halfW.length;
  for (let k = 0; k < len; k++) {
    const j = (i + k) % n;
    const out = halfW[j] + PHYS.offroadMargin;
    if (side <= 0) wallL[j] = Math.max(wallL[j], out);
    if (side >= 0) wallR[j] = Math.max(wallR[j], out);
  }
}

interface Frame {
  i: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  hw: number;
  bank: number;
}

function frameOnMain(t: { px: Float64Array; py: Float64Array; pz: Float64Array; tx: Float64Array; tz: Float64Array; halfW: Float64Array; bank: Float64Array }, i: number): Frame {
  return { i, x: t.px[i], y: t.py[i], z: t.pz[i], tx: t.tx[i], tz: t.tz[i], hw: t.halfW[i], bank: t.bank[i] };
}

/** Frame at fraction `s` (0..255) along a branch; `i` is the branch's mapped main sample there. */
function frameOnBranch(b: BuiltBranch, s: number): Frame {
  const j = clamp(Math.round((s / 255) * (b.m - 1)), 0, b.m - 1);
  return { i: b.mapI[j], x: b.px[j], y: b.py[j], z: b.pz[j], tx: b.tx[j], tz: b.tz[j], hw: b.halfW[j], bank: b.bank[j] };
}

/** Main samples from `a` forward to `b` (0..n-1). */
function fwd(a: number, b: number, n: number): number {
  return (((b - a) % n) + n) % n;
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
