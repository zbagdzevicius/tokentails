/**
 * Set pieces (SIM_VERSION 8, iteration 3; docs/plans/formula-meow/SETPIECES.md): `TrackDef.setPieces` → the
 * `BuiltTrack` fields the sim, the AI, the render and the validator read. Sim-safe math only (GDD 3.1): this runs
 * inside `buildTrack`.
 *
 * "Shadow zones": the sim stays 2.5D. Each piece is a stretch of the main loop (its shadow) with special rules
 * (core/sim/stunt.ts); the render bends it into 3D (core/render/stunt-pose.ts, the meshes in core/track/mesh.ts):
 * - loop: a zone `STUNT.loop.zone` m long after a full-width boost strip. A kart crossing the zone start rides a rail
 *   (`su` m along the ribbon, `sd` m across it) whose length is the ribbon's arc length `LOOP_LP`; its planar position
 *   sits on the shadow at `su × LOOP_K` (LOOP_K = zone / LOOP_LP ≤ 1, so progress never runs ahead of the speed).
 * - wall: an extra lane `STUNT.wall.lane` m wide past the road edge on one side (`laneL` / `laneR`), tapered at both
 *   ends, with a soft outer rail. The query reports `Surface.WallRide` on it.
 * - jump: no deck for `gap` m after the lip (`gapMask`: the query reports the canyon floor); the far deck sits `drop` m
 *   lower and climbs back after the landing window. `gap` 0 is a kicker: a full-width ramp, no void.
 * - tunnel: `tunnelMask` only (render and juice read it; no sim rule).
 *
 * A piece the build cannot place (inside a fork or merge window, too near the start, overlapping another piece, a loop
 * on a bend, a wall or loop on an arena) is skipped and listed in `BuiltTrack.pieceIssues`; authored tracks are
 * tested to have none (stunt.test.ts).
 */
import { SET_PIECE_KINDS, type SetPiece, type SetPieceKind, type TrackDef } from '../../types';
import { STUNT } from '../../tuning';
import { clamp, cosL, sinL, TAU } from '../sim/fixed';

/** One placed set piece. Sample indices are main-loop samples (after the start-line rotation). */
export interface BuiltPiece {
  /** index in `BuiltTrack.pieces` (the `b` of stuntEnter, the `rail` / `gapLaunch` values are this + 1) */
  id: number;
  kind: SetPieceKind;
  /** SET_PIECE_KINDS index (the `a` of stunt events) */
  k: number;
  /** loop: zone start / end; jump: lip / far lip; wall, tunnel: start / end (inclusive) */
  i0: number;
  i1: number;
  /** metres from i0 to i1 */
  lenM: number;
  /** wall: -1 left, +1 right, 0 both (after Mirror and the auto side) */
  side: -1 | 0 | 1;
  gap: number;
  drop: number;
  skin: number;
  /** loop: first sample of the boost strip */
  strip: number;
  /** jump: landing window (samples), the landing target sample, the lip height, the far deck height at the target */
  land0: number;
  land1: number;
  aimI: number;
  lipY: number;
  landY: number;
  /** last sample the piece affects (loop zone end, jump landing end + climb, wall/tunnel end) */
  end: number;
}

/** What `buildTrack` adds to a BuiltTrack (SIM_VERSION 8). */
export interface StuntFields {
  pieces: BuiltPiece[];
  /** per main sample: piece id + 1 over its footprint (loop strip + zone, jump lip..landing end, wall, tunnel), else 0 */
  pieceAt: Int8Array;
  /** 1 over a jump's missing deck */
  gapMask: Uint8Array;
  /** 1 inside a tunnel (render and juice only) */
  tunnelMask: Uint8Array;
  /** wall-ride lane width (m) past the road edge on the left / right, tapers included */
  laneL: Float32Array;
  laneR: Float32Array;
  /** pieces the build skipped, with the reason (authored tracks: none, by test) */
  pieceIssues: string[];
}

// ---------------------------------------------------------------------------------------------
// the loop ribbon (shape shared with core/render/stunt-pose.ts, which draws it with Math trig)
// ---------------------------------------------------------------------------------------------

/**
 * Ribbon shape in the shadow's frame (F along the shadow, H up, Lt to the right, metres):
 * - lead-in `lead` m: F = lead·t, H = 0, Lt eases into the sway (cubic, slope 0 at the start);
 * - the loop, θ 0..2π: F = lead + R·sin θ + c·θ, H = R·(1 − cos θ), Lt = −A·sin θ (a teardrop loop that moves
 *   forward c·2π, and a corkscrew sway so the way up and the way down pass 2·A·sin θ₁ ≈ 8.5 m apart where they cross);
 * - lead-out `lead` m: back to Lt = 0 with slope 0.
 * `lead` is chosen so the ribbon ends at the shadow's end: 2·lead + 2π·c = zone.
 */
export interface LoopShape {
  R: number;
  c: number;
  A: number;
  lead: number;
  /** lateral slope at both ends of the loop part (dLt/dF) */
  s0: number;
}

export const LOOP_SHAPE: LoopShape = (() => {
  const R = STUNT.loop.radius;
  const c = STUNT.loop.drift * R;
  const A = STUNT.loop.sway;
  const lead = (STUNT.loop.zone - TAU * c) / 2;
  return { R, c, A, lead, s0: -A / (R + c) };
})();

/** Ribbon point at segment `seg` (0 lead-in, 1 loop, 2 lead-out) and parameter `p` (t 0..1, or θ 0..2π). */
export function ribbonLocal(seg: 0 | 1 | 2, p: number, sin: (a: number) => number, cos: (a: number) => number, out: { f: number; h: number; l: number }): void {
  const { R, c, A, lead, s0 } = LOOP_SHAPE;
  if (seg === 0) {
    out.f = lead * p;
    out.h = 0;
    out.l = s0 * lead * (p * p * p - p * p);
  } else if (seg === 1) {
    out.f = lead + R * sin(p) + c * p;
    out.h = R * (1 - cos(p));
    out.l = -A * sin(p);
  } else {
    out.f = lead + TAU * c + lead * p;
    out.h = 0;
    out.l = s0 * lead * (p * p * p - 2 * p * p + p);
  }
}

/** Arc length of the ribbon (sim-safe: LUT trig, fixed steps), m. */
function ribbonLength(): number {
  const q = { f: 0, h: 0, l: 0 };
  let len = 0;
  const segs: Array<[0 | 1 | 2, number, number]> = [
    [0, 1, 256],
    [1, TAU, 4096],
    [2, 1, 256],
  ];
  for (const [seg, span, steps] of segs) {
    ribbonLocal(seg, 0, sinL, cosL, q);
    let f = q.f;
    let h = q.h;
    let l = q.l;
    for (let s = 1; s <= steps; s++) {
      ribbonLocal(seg, (span * s) / steps, sinL, cosL, q);
      const df = q.f - f;
      const dh = q.h - h;
      const dl = q.l - l;
      len += Math.sqrt(df * df + dh * dh + dl * dl);
      f = q.f;
      h = q.h;
      l = q.l;
    }
  }
  return Math.round(len * 1e6) / 1e6;
}

/** The rail length (m) of every loop, and the shadow / rail ratio (≤ 1). */
export const LOOP_LP = ribbonLength();
export const LOOP_K = STUNT.loop.zone / LOOP_LP;

// ---------------------------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------------------------

/** The main-loop arrays the set pieces read and change (a BuiltTrack under construction). */
export interface StuntBuildArrays {
  n: number;
  step: number;
  py: Float64Array;
  curv: Float64Array;
  bank: Float64Array;
  halfW: Float64Array;
  wallL: Float64Array;
  wallR: Float64Array;
}

/** Forward distance in samples from a to b (0..n-1). */
function fwd(a: number, b: number, n: number): number {
  return (((b - a) % n) + n) % n;
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

/** A piece's footprint in samples (first .. last, inclusive, may run past n: callers wrap). */
export interface Plan {
  p: SetPiece;
  kind: SetPieceKind;
  i0: number;
  i1: number;
  first: number;
  last: number;
  side: -1 | 0 | 1;
  gap: number;
  drop: number;
}

/**
 * Step 1 (after frames and curvature, before banking is applied): where each piece goes. `idx` maps a lap fraction to a
 * main sample; `forbid` lists fork / merge samples a piece must keep clear of.
 */
export function planPieces(def: TrackDef, a: { n: number; step: number; curv: Float64Array }, idx: (s: number) => number, mirror: boolean, forbid: number[], issues: string[]): Plan[] {
  const { n, step } = a;
  const out: Plan[] = [];
  const m = (metres: number) => Math.max(1, Math.round(metres / step));
  const arena = def.kind === 'arena';
  for (const p of def.setPieces ?? []) {
    if (SET_PIECE_KINDS.indexOf(p.kind) < 0) {
      issues.push(`unknown kind ${String(p.kind)}`);
      continue;
    }
    const i0 = idx(p.s);
    let i1 = i0;
    let first = i0;
    let last = i0;
    let side: -1 | 0 | 1 = 0;
    const gap = p.kind === 'jump' ? clamp(p.gap ?? STUNT.jump.gap, 0, 14) : 0;
    const drop = p.kind === 'jump' && gap > 0 ? clamp(p.drop ?? 0, 0, 2.5) : 0;
    if (p.kind === 'loop') {
      i1 = i0 + m(STUNT.loop.zone);
      first = i0 - m(STUNT.loop.strip);
      last = i1;
    } else if (p.kind === 'jump') {
      i1 = i0 + (gap > 0 ? m(gap) : 0);
      first = i0 - m(8);
      last = i1 + m(STUNT.jump.aim + STUNT.jump.land);
    } else {
      const len = clamp(p.len ?? (p.kind === 'wall' ? 14 : 16), 4, 40);
      i1 = i0 + Math.max(m(STUNT.wall.taper * 2), Math.round((len / 256) * n));
      first = i0;
      last = i1;
      if (p.kind === 'wall') {
        if (p.side === -1 || p.side === 1) side = (mirror ? -p.side : p.side) as -1 | 1;
        else if (p.side === 0) side = 0;
        else {
          // the outer side of the bend: curvature + = a left turn, so its outside is the right (+1)
          let c = 0;
          for (let k = i0; k <= i1; k++) c += a.curv[wrap(k, n)];
          side = c >= 0 ? 1 : -1;
        }
      }
    }
    const tag = `${p.kind}@${p.s}`;
    if (arena && !(p.kind === 'jump' && gap === 0)) {
      issues.push(`${tag}: arenas take only kickers (jump, gap 0)`);
      continue;
    }
    if (!arena) {
      // the start line (sample 0) stays clear by 30 m
      const clear = m(30);
      if (fwd(wrap(first, n), 0, n) <= last - first + clear || fwd(0, wrap(first, n), n) < clear) {
        issues.push(`${tag}: too near the start line`);
        continue;
      }
      // fork and merge windows (± 20 m): the query there may hand the kart to a branch
      const win = m(20);
      if (forbid.some((f) => fwd(wrap(first - win, n), f, n) <= last - first + 2 * win)) {
        issues.push(`${tag}: inside a fork or merge window`);
        continue;
      }
    }
    if (p.kind === 'loop') {
      // the shadow must be nearly straight: R ≥ 60 m over the zone
      let bad = false;
      for (let k = i0; k <= i1; k++) if (Math.abs(a.curv[wrap(k, n)]) > 1 / 60) bad = true;
      if (bad) {
        issues.push(`${tag}: the loop's zone bends (R < 60 m)`);
        continue;
      }
    }
    const pl: Plan = { p, kind: p.kind, i0, i1, first, last, side, gap, drop };
    // pieces never overlap (10 m apart)
    const gapS = m(10);
    if (out.some((o) => fwd(wrap(o.first - gapS, n), wrap(first, n), n) <= o.last - o.first + 2 * gapS || fwd(wrap(first - gapS, n), wrap(o.first, n), n) <= last - first + 2 * gapS)) {
      issues.push(`${tag}: overlaps another piece`);
      continue;
    }
    out.push(pl);
  }
  return out;
}

/**
 * Step 2 (on the bank before it lifts the road): flat banking over a loop's strip and zone (± 10 m) and a jump's
 * run-up, gap and landing window, eased in and out over 16 m.
 */
export function flattenForPieces(plans: Plan[], a: { n: number; step: number; bank: Float64Array }): void {
  const { n, step } = a;
  if (!plans.length) return;
  const m = (metres: number) => Math.round(metres / step);
  const flat = new Float64Array(n).fill(1);
  const ease = m(16);
  for (const pl of plans) {
    let lo: number;
    let hi: number;
    if (pl.kind === 'loop') {
      lo = pl.first - m(10);
      hi = pl.last + m(10);
    } else if (pl.kind === 'jump') {
      lo = pl.i0 - m(STUNT.jump.runUp);
      hi = pl.last;
    } else continue;
    for (let k = lo - ease; k <= hi + ease; k++) {
      const u = k < lo ? (lo - k) / ease : k > hi ? (k - hi) / ease : 0;
      const w = u * u * (3 - 2 * u);
      const i = wrap(k, n);
      flat[i] = Math.min(flat[i], w);
    }
  }
  for (let i = 0; i < n; i++) a.bank[i] *= flat[i];
}

/**
 * Step 3 (after the walls are final and the road is lifted): masks, wall lanes, jump drops. Returns the stunt fields
 * and the loop strips as full-width pads (the caller adds them to `pads`).
 */
export function placePieces(plans: Plan[], a: StuntBuildArrays, issues: string[]): { fields: StuntFields; strips: Array<{ i: number; halfLen: number; halfW: number }> } {
  const { n, step } = a;
  const m = (metres: number) => Math.max(1, Math.round(metres / step));
  const pieces: BuiltPiece[] = [];
  const pieceAt = new Int8Array(n);
  const gapMask = new Uint8Array(n);
  const tunnelMask = new Uint8Array(n);
  const laneL = new Float32Array(n);
  const laneR = new Float32Array(n);
  const strips: Array<{ i: number; halfLen: number; halfW: number }> = [];
  plans.forEach((pl, id) => {
    const i0 = wrap(pl.i0, n);
    const i1 = wrap(pl.i1, n);
    const bp: BuiltPiece = {
      id,
      kind: pl.kind,
      k: SET_PIECE_KINDS.indexOf(pl.kind),
      i0,
      i1,
      lenM: (pl.i1 - pl.i0) * step,
      side: pl.side,
      gap: pl.gap,
      drop: pl.drop,
      skin: clamp(Math.floor(pl.p.skin ?? 0), 0, 15),
      strip: wrap(pl.first, n),
      land0: i1,
      land1: i1,
      aimI: i1,
      lipY: a.py[i0],
      landY: a.py[i1],
      end: wrap(pl.last, n),
    };
    for (let k = pl.first; k <= pl.last; k++) pieceAt[wrap(k, n)] = id + 1;
    if (pl.kind === 'loop') {
      const half = (pl.i0 - pl.first) / 2;
      const c = wrap(Math.round(pl.first + half), n);
      strips.push({ i: c, halfLen: (half * step), halfW: a.halfW[c] + 0.6 });
    } else if (pl.kind === 'tunnel') {
      for (let k = pl.i0; k <= pl.i1; k++) tunnelMask[wrap(k, n)] = 1;
      // SIM_VERSION 9: a full-width boost pad at the tunnel's middle (speed under the neon rings)
      const c = wrap(Math.round((pl.i0 + pl.i1) / 2), n);
      strips.push({ i: c, halfLen: STUNT.tunnel.padHalfLen, halfW: a.halfW[c] + 0.6 });
    } else if (pl.kind === 'wall') {
      const W = STUNT.wall.lane;
      const tap = m(STUNT.wall.taper);
      const len = pl.i1 - pl.i0;
      for (let k = 0; k <= len; k++) {
        const i = wrap(pl.i0 + k, n);
        const w = W * Math.min(1, k / tap, (len - k) / tap);
        if (pl.side >= 0) {
          laneR[i] = Math.max(laneR[i], w);
          a.wallR[i] = Math.max(a.wallR[i], a.halfW[i] + w + STUNT.wall.rail);
        }
        if (pl.side <= 0) {
          laneL[i] = Math.max(laneL[i], w);
          a.wallL[i] = Math.max(a.wallL[i], a.halfW[i] + w + STUNT.wall.rail);
        }
      }
    } else if (pl.kind === 'jump') {
      bp.land0 = wrap(pl.i1 + 1, n);
      bp.land1 = wrap(pl.last, n);
      bp.aimI = wrap(pl.i1 + m(STUNT.jump.aim), n);
      if (pl.gap > 0) {
        for (let k = pl.i0 + 1; k < pl.i1; k++) gapMask[wrap(k, n)] = 1;
        // the far deck: `drop` lower from the gap through the landing window, then climbs back
        const climb = m(STUNT.jump.climb);
        for (let k = pl.i0 + 1; k <= pl.last + climb; k++) {
          const u = k <= pl.last ? 1 : 1 - (k - pl.last) / climb;
          const w = u * u * (3 - 2 * u);
          a.py[wrap(k, n)] -= pl.drop * w;
        }
      }
      bp.lipY = a.py[i0];
      bp.landY = a.py[bp.aimI];
    }
    pieces.push(bp);
  });
  void issues;
  return { fields: { pieces, pieceAt, gapMask, tunnelMask, laneL, laneR, pieceIssues: issues }, strips };
}

/** Empty stunt fields (tracks with no set pieces, and test fixtures that build a BuiltTrack by hand). */
export function noStunts(n: number): StuntFields {
  return { pieces: [], pieceAt: new Int8Array(n), gapMask: new Uint8Array(n), tunnelMask: new Uint8Array(n), laneL: new Float32Array(n), laneR: new Float32Array(n), pieceIssues: [] };
}

// ---------------------------------------------------------------------------------------------
// queries (sim-safe)
// ---------------------------------------------------------------------------------------------

/** The piece whose footprint holds main sample i, or null. */
export function pieceAtSample(t: StuntFields, i: number): BuiltPiece | null {
  const p = t.pieceAt[i];
  return p > 0 ? t.pieces[p - 1] : null;
}

/**
 * Where a respawn at main sample `si` sets the kart down (SETPIECES 3.5): before a loop's strip (8 m back), past a
 * jump's far lip (+ netPlace m), else `si`. Returns [sample, speed fraction of top or 0 = the normal respawn speed].
 */
export function respawnSampleOf(t: StuntFields & { n: number; step: number }, si: number): [number, number] {
  const pc = pieceAtSample(t, si);
  if (!pc) return [si, 0];
  const n = t.n;
  if (pc.kind === 'loop') return [wrap(pc.strip - Math.round(STUNT.loop.respawnBack / t.step), n), STUNT.loop.floor];
  if (pc.kind === 'jump' && pc.gap > 0 && fwd(pc.i0, si, n) <= fwd(pc.i0, pc.i1, n) + Math.round(STUNT.jump.netPlace / t.step)) return [wrap(pc.i1 + Math.round(STUNT.jump.netPlace / t.step), n), 0];
  return [si, 0];
}

/** Is main sample i inside a tunnel? (render, juice) */
export function inTunnel(t: StuntFields, i: number): boolean {
  return t.tunnelMask[i] === 1;
}
