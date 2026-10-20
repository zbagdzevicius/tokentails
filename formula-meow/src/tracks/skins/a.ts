/**
 * Set-piece skins of the tracks-A lane (Kitchen Counter, Neon Rooftops, Laundry Spin; SETPIECES.md section 12).
 * Render-only. Everything merges into the track's `track-solid` / `track-glow` meshes (no draw call), except the Laundry
 * drum's two spinning rims (one Object3D for the track, the budget's one moving part).
 *
 * | Theme | Loop | Wall ride | Jump gap | Tunnel |
 * |---|---|---|---|---|
 * | 0 Kitchen | tape measure (yellow tape and ticks under the ribbon, the tape case at its foot) | mixing bowl (glazed bowl, wooden spoon) | sink (steel basin, water, the tap) | bread bin (wooden roll top, loaves on the lid) |
 * | 1 Rooftops | neon ring (chasing neon under the ribbon, glowing pylons) | LED billboard (the lane is the screen) | roof to roof (chimneys on both lips, lit windows down the alley walls) | air duct (ribbed steel, magenta floor strips, roof vents) |
 * | 2 Laundry | drum (spinning rims and paddles round the loop) | dryer row (enamel fronts with portholes) | folding table (towel stacks, a laundry basket under the net) | shirt rack (shirts on the rail over the shell) |
 *
 * The generic geometry (core/track/stunt-mesh.ts) stays under the loop, jump and tunnel skins, which only add to it.
 * The wall skins replace it (the same curl via `curlPoint`, in the skin's colours).
 */
import { BufferAttribute, BufferGeometry, Color, Mesh, type Object3D } from 'three';
import { registerPieceSkin, type PieceSkinCtx } from './registry';
import type { BuiltPiece, BuiltTrack } from '../../core/track/build';
import type { TriBuilder, V } from '../../core/track/mesh';
import { curlPoint, laneSide } from '../../core/track/stunt-mesh';
import { ribbonLocalAt, ribbonPose, shadowToWorld, type StuntPose } from '../../core/render/stunt-pose';
import { LOOP_LP } from '../../core/track/stunt';
import { STUNT } from '../../tuning';
import { toonMaterial } from '../../core/render/toon';

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const wrap = (t: BuiltTrack, i: number) => ((i % t.n) + t.n) % t.n;

/** A point on the main road at sample i, lateral d (+ = right), `lift` above the deck (bank included). */
function P(t: BuiltTrack, i: number, d: number, lift = 0): V {
  const j = wrap(t, i);
  return [t.px[j] - t.tz[j] * d, t.py[j] + d * t.bank[j] + lift, t.pz[j] + t.tx[j] * d];
}

/** Wall distance on side s at sample i. */
const wallOf = (t: BuiltTrack, i: number, s: number) => (s > 0 ? t.wallR[wrap(t, i)] : t.wallL[wrap(t, i)]);

/** A box standing on y (5 faces), `w` across and `l` along the heading (tx, tz), `h` tall. */
function box(b: TriBuilder, x: number, y: number, z: number, w: number, h: number, l: number, tx: number, tz: number, color: number, top = color): void {
  const fx = tx * (l / 2);
  const fz = tz * (l / 2);
  const rx = -tz * (w / 2);
  const rz = tx * (w / 2);
  const c: Array<[number, number]> = [
    [x - fx - rx, z - fz - rz],
    [x + fx - rx, z + fz - rz],
    [x + fx + rx, z + fz + rz],
    [x - fx + rx, z - fz + rz],
  ];
  for (let q = 0; q < 4; q++) {
    const a = c[q];
    const d = c[(q + 1) % 4];
    b.quad([a[0], y, a[1]], [d[0], y, d[1]], [d[0], y + h, d[1]], [a[0], y + h, a[1]], color);
  }
  b.quad([c[0][0], y + h, c[0][1]], [c[1][0], y + h, c[1][1]], [c[2][0], y + h, c[2][1]], [c[3][0], y + h, c[3][1]], top);
}

/** A vertical cylinder (sides and top cap) of `segs` facets. */
function cyl(b: TriBuilder, x: number, y: number, z: number, r: number, h: number, color: number, segs = 8, top = color): void {
  for (let q = 0; q < segs; q++) {
    const a = (q / segs) * Math.PI * 2;
    const c = ((q + 1) / segs) * Math.PI * 2;
    const ax = x + Math.cos(a) * r;
    const az = z + Math.sin(a) * r;
    const cx = x + Math.cos(c) * r;
    const cz = z + Math.sin(c) * r;
    b.quad([ax, y, az], [cx, y, cz], [cx, y + h, cz], [ax, y + h, az], color);
    b.tri(x, y + h, z, ax, y + h, az, cx, y + h, cz, top);
  }
}

/** A flat disc facing `n` (unit), centre c, radius r: a ring from r0 to r (r0 = 0: a filled disc). */
function disc(b: TriBuilder, c: V, n: V, r: number, r0: number, color: number, segs = 12): void {
  // two axes across the normal
  const up: V = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ax: V = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  ax = [ax[0] / al, ax[1] / al, ax[2] / al];
  const ay: V = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
  const at = (a: number, rr: number): V => [c[0] + (ax[0] * Math.cos(a) + ay[0] * Math.sin(a)) * rr, c[1] + (ax[1] * Math.cos(a) + ay[1] * Math.sin(a)) * rr, c[2] + (ax[2] * Math.cos(a) + ay[2] * Math.sin(a)) * rr];
  for (let q = 0; q < segs; q++) {
    const a = (q / segs) * Math.PI * 2;
    const e = ((q + 1) / segs) * Math.PI * 2;
    if (r0 <= 0) {
      const p = at(a, r);
      const s = at(e, r);
      b.tri(c[0], c[1], c[2], p[0], p[1], p[2], s[0], s[1], s[2], color);
    } else b.quad(at(a, r0), at(a, r), at(e, r), at(e, r0), color);
  }
}

/**
 * Clearance of (x, z) from every road sample outside the piece's own stretch (from - 40 m .. to + 40 m) and from the
 * branches: a hand-placed prop beside a piece must not reach onto another part of the loop.
 */
function roadClear(t: BuiltTrack, x: number, z: number, from: number, to: number): number {
  const pad = Math.round(40 / t.step);
  const len = wrap(t, to - from) + 2 * pad;
  let best = Infinity;
  for (let i = 0; i < t.n; i += 2) {
    if (wrap(t, i - (from - pad)) <= len) continue;
    const c = Math.hypot(x - t.px[i], z - t.pz[i]) - Math.max(t.wallL[i], t.wallR[i]) - 0.6;
    if (c < best) best = c;
  }
  for (const b of t.branches)
    for (let j = 0; j < b.m; j += 2) {
      const c = Math.hypot(x - b.px[j], z - b.pz[j]) - Math.max(b.ownL[j], b.ownR[j]) - 0.6;
      if (c < best) best = c;
    }
  return best;
}

/** Place a prop of radius r beside sample i on side s, `out` m past the wall; null when it would touch another road. */
function beside(ctx: PieceSkinCtx, i: number, s: number, out: number, r: number): { x: number; z: number; y: number; tx: number; tz: number } | null {
  const t = ctx.track;
  const j = wrap(t, i);
  const d = s * (wallOf(t, j, s) + out + r);
  const p = P(t, j, d);
  if (roadClear(t, p[0], p[2], ctx.piece.i0, ctx.piece.end) < r) return null;
  return { x: p[0], z: p[2], y: Math.min(t.py[j], ctx.groundY + 40), tx: t.tx[j], tz: t.tz[j] };
}

/** The piece's length in samples. */
const span = (t: BuiltTrack, pc: BuiltPiece) => wrap(t, pc.i1 - pc.i0);

// ---------------------------------------------------------------------------------------------
// wall rides: the generic curl in the skin's colours, plus a decoration callback per stretch
// ---------------------------------------------------------------------------------------------

interface WallLook {
  /** facet colour: f = facet 0..facets-1 (0 at the road edge), m = metres along the piece */
  face(f: number, m: number): number;
  /** draw the facet in glow (unlit) instead of solid */
  glowFace?(f: number, m: number): boolean;
  lip: number;
  strip(m: number): number;
  skirt: number;
  /** extra per 2 m stretch (i → j) on side s; wi / wj = lane widths */
  deco?(ctx: PieceSkinCtx, s: number, i: number, j: number, wi: number, wj: number, m: number): void;
}

function wallSkin(ctx: PieceSkinCtx, look: WallLook): boolean {
  const { track: t, piece: pc, solid, glow, groundY } = ctx;
  const len = span(t, pc) + 2;
  const stride = 2;
  const facets = 8;
  for (const s of pc.side === 0 ? [-1, 1] : [pc.side]) {
    for (let k = -2; k < len; k += stride) {
      const i = pc.i0 + k;
      const j = i + stride;
      if (!laneSide(t, i, s) && !laneSide(t, j, s)) continue;
      const wi = wallOf(t, i, s) - t.halfW[wrap(t, i)];
      const wj = wallOf(t, j, s) - t.halfW[wrap(t, j)];
      const m = k * t.step;
      for (let f = 0; f < facets; f++) {
        const a0 = curlPoint(t, i, s, (wi * f) / facets, 0.02);
        const a1 = curlPoint(t, i, s, (wi * (f + 1)) / facets, 0.02);
        const b0 = curlPoint(t, j, s, (wj * f) / facets, 0.02);
        const b1 = curlPoint(t, j, s, (wj * (f + 1)) / facets, 0.02);
        const into = look.glowFace?.(f, m) ? glow : solid;
        if (s > 0) into.quad(a0, a1, b1, b0, look.face(f, m));
        else into.quad(a1, a0, b0, b1, look.face(f, m));
      }
      const ti = curlPoint(t, i, s, wi, 0.02);
      const tj = curlPoint(t, j, s, wj, 0.02);
      const li = curlPoint(t, i, s, wi + 0.6, 0.02);
      const lj = curlPoint(t, j, s, wj + 0.6, 0.02);
      solid.quad(ti, tj, lj, li, look.lip);
      glow.quad(curlPoint(t, i, s, wi - 0.3, 0.05), curlPoint(t, j, s, wj - 0.3, 0.05), curlPoint(t, j, s, wj - 0.62, 0.05), curlPoint(t, i, s, wi - 0.62, 0.05), look.strip(m));
      solid.quad(li, lj, [lj[0], groundY, lj[2]], [li[0], groundY, li[2]], look.skirt);
      look.deco?.(ctx, s, i, j, wi, wj, m);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// loops: ribbon bounds, an underside band
// ---------------------------------------------------------------------------------------------

const pA: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
const pB: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
const loc = { f: 0, h: 0, l: 0 };

/** The loop's circle in its shadow frame: centre (f, h), radius, and the ribbon's widest lateral reach. */
function loopCircle(): { f: number; h: number; r: number; lat: number } {
  let f0 = Infinity;
  let f1 = -Infinity;
  let h1 = 0;
  let lat = 0;
  for (let u = 0; u <= LOOP_LP; u += 0.5) {
    ribbonLocalAt(u, loc);
    lat = Math.max(lat, Math.abs(loc.l));
    if (loc.h < 1) continue;
    f0 = Math.min(f0, loc.f);
    f1 = Math.max(f1, loc.f);
    h1 = Math.max(h1, loc.h);
  }
  const f = (f0 + f1) / 2;
  const h = h1 / 2;
  let r = 0;
  for (let u = 0; u <= LOOP_LP; u += 0.5) {
    ribbonLocalAt(u, loc);
    if (loc.h < 0.5) continue;
    r = Math.max(r, Math.hypot(loc.f - f, loc.h - h));
  }
  return { f, h, r, lat: lat + STUNT.loop.deckHalfW };
}

/** Quads on the outside (under) face of the ribbon, from u0 to u1 m, across d0..d1, `color(u)`. */
function underBand(t: BuiltTrack, pc: BuiltPiece, b: TriBuilder, d0: number, d1: number, color: (u: number) => number, du = 0.9, lift = -0.48): void {
  for (let u = 0; u < LOOP_LP - 1e-6; u += du) {
    const u1 = Math.min(LOOP_LP, u + du);
    ribbonPose(t, pc, u, d0, lift, pA);
    const a0: V = [pA.x, pA.y, pA.z];
    ribbonPose(t, pc, u, d1, lift, pA);
    const a1: V = [pA.x, pA.y, pA.z];
    ribbonPose(t, pc, u1, d0, lift, pB);
    const b0: V = [pB.x, pB.y, pB.z];
    ribbonPose(t, pc, u1, d1, lift, pB);
    const b1: V = [pB.x, pB.y, pB.z];
    b.quad(a0, a1, b1, b0, color(u));
  }
}

const wp = { x: 0, y: 0, z: 0 };
const W = (t: BuiltTrack, pc: BuiltPiece, f: number, h: number, l: number): V => {
  shadowToWorld(t, pc, f, h, l, wp);
  return [wp.x, wp.y, wp.z];
};

// =============================================================================================
// Kitchen Counter (theme 0)
// =============================================================================================

const K = { wood: 0xc98a4b, woodB: 0xb0723a, woodD: 0x8a5428, crust: 0xd99a4e, crumb: 0xf3d7a0, steel: 0xc8d2db, steelD: 0x9aa7b3, water: 0x6fd0ff, waterB: 0xa8e8ff, glaze: 0xfaf3e6, bowl: 0x8fc4e6, bowlB: 0x6fb0dc, tape: 0xffd23f, ink: 0x2b2b2b, red: 0xe5484d };

// loop: a giant tape measure
registerPieceSkin(0, 'loop', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow } = ctx;
  const hw = STUNT.loop.deckHalfW;
  underBand(t, pc, solid, -hw + 0.2, hw - 0.2, () => K.tape);
  // tick marks every 0.5 m (a long one every 2.5 m), and a red number block every 5 m
  for (let u = 0; u < LOOP_LP - 0.2; u += 0.5) {
    const long = Math.round(u / 0.5) % 5 === 0;
    ribbonPose(t, pc, u, -hw + 0.2, -0.5, pA);
    ribbonPose(t, pc, u + 0.08, -hw + 0.2, -0.5, pB);
    const L = long ? 2.2 : 1.1;
    const q0: V = [pA.x, pA.y, pA.z];
    const q1: V = [pB.x, pB.y, pB.z];
    ribbonPose(t, pc, u, -hw + 0.2 + L, -0.5, pA);
    ribbonPose(t, pc, u + 0.08, -hw + 0.2 + L, -0.5, pB);
    solid.quad(q0, q1, [pB.x, pB.y, pB.z], [pA.x, pA.y, pA.z], K.ink);
    if (Math.round(u / 0.5) % 10 === 0) {
      ribbonPose(t, pc, u, hw - 1.4, -0.5, pA);
      ribbonPose(t, pc, u + 0.7, hw - 1.4, -0.5, pB);
      const r0: V = [pA.x, pA.y, pA.z];
      const r1: V = [pB.x, pB.y, pB.z];
      ribbonPose(t, pc, u, hw - 0.5, -0.5, pA);
      ribbonPose(t, pc, u + 0.7, hw - 0.5, -0.5, pB);
      solid.quad(r0, r1, [pB.x, pB.y, pB.z], [pA.x, pA.y, pA.z], K.red);
    }
  }
  // the tape case where the tape comes out (beside the loop's foot, past the sway), with a red lock button
  const c = loopCircle();
  for (const s of [-1, 1]) {
    const l = s * (c.lat + 3.2);
    const p = W(t, pc, c.f - c.r - 1, 0, l);
    if (roadClear(t, p[0], p[2], pc.strip, pc.end) < 3) continue;
    const i = wrap(t, pc.i0 + Math.round((c.f - c.r - 1) / t.step));
    const y = t.py[i] - 0.3;
    box(solid, p[0], y, p[2], 2.2, 4.6, 4.6, t.tx[i], t.tz[i], 0xe0e4ea, 0xd2d7de);
    box(solid, p[0], y + 4.6, p[2], 1.2, 0.5, 1.2, t.tx[i], t.tz[i], K.red);
    disc(glow, [p[0] - t.tz[i] * s * 1.15, y + 2.3, p[2] + t.tx[i] * s * 1.15], [-t.tz[i] * s, 0, t.tx[i] * s], 1.4, 1.0, K.tape, 14);
    break;
  }
});

// wall ride: the mixing bowl
registerPieceSkin(0, 'wall', 0, (ctx) =>
  wallSkin(ctx, {
    face: (f, m) => (f >= 6 ? (Math.floor(m / 3) % 2 === 0 ? K.bowl : K.bowlB) : f === 0 ? K.glaze : Math.floor(m / 6) % 2 === 0 ? 0xd9eef9 : 0xc6e4f5),
    lip: 0xffffff,
    strip: (m) => (Math.floor(m / 3) % 2 === 0 ? 0x3ae0ff : 0xffe14d),
    skirt: K.bowl,
    deco(c, s, i, j, wi, wj, m) {
      // batter splashes on the glaze, every 10 m
      if (Math.floor(m) % 10 === 0 && m >= 0) {
        const p = curlPoint(c.track, i, s, wi * 0.45, 0.04);
        const q = curlPoint(c.track, i, s, wi * 0.45 + 0.05, 0.6);
        const n: V = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        disc(c.solid, p, [n[0] / nl, n[1] / nl, n[2] / nl], 0.9, 0, K.crumb, 8);
      }
      void j;
      void wj;
    },
  }),
);

// jump gap: the sink
registerPieceSkin(0, 'jump', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow } = ctx;
  if (pc.gap <= 0) return;
  const n = span(t, pc);
  const yN = Math.min(pc.lipY, pc.landY) - 2.4;
  const floor = yN - 1.4;
  // the basin: a steel floor, its side walls up to the deck, and the water over the floor
  for (let k = 0; k < n; k += 2) {
    const i = pc.i0 + k;
    const j = pc.i0 + Math.min(n, k + 2);
    const wl = t.wallL[wrap(t, i)] + 0.3;
    const wr = t.wallR[wrap(t, i)] + 0.3;
    const wl2 = t.wallL[wrap(t, j)] + 0.3;
    const wr2 = t.wallR[wrap(t, j)] + 0.3;
    const a = P(t, i, -wl);
    const b = P(t, i, wr);
    const c = P(t, j, wr2);
    const d = P(t, j, -wl2);
    solid.quad([a[0], floor, a[2]], [b[0], floor, b[2]], [c[0], floor, c[2]], [d[0], floor, d[2]], K.steelD);
    glow.quad([a[0], floor + 0.25, a[2]], [b[0], floor + 0.25, b[2]], [c[0], floor + 0.25, c[2]], [d[0], floor + 0.25, d[2]], Math.floor(k / 3) % 2 === 0 ? K.water : K.waterB);
    for (const [p, q] of [
      [a, d],
      [b, c],
    ] as const) {
      solid.quad([p[0], floor, p[2]], [q[0], floor, q[2]], q, p, K.steel);
    }
  }
  // the plug hole (dark ring) in the middle of the water
  const mid = wrap(t, pc.i0 + Math.round(n / 2));
  const cm = P(t, mid, 0);
  disc(glow, [cm[0], floor + 0.28, cm[2]], [0, 1, 0], 1.1, 0.6, 0x3a4a58, 12);
  // the tap: a chrome column beside the gap, a spout bending over the basin's edge, and the water falling
  for (const s of [1, -1]) {
    const p = beside(ctx, mid, s, 0.8, 0.6);
    if (!p) continue;
    const top = Math.max(pc.lipY, pc.landY) + 5.5;
    cyl(solid, p.x, floor, p.z, 0.45, top - floor, K.steel, 10, 0xffffff);
    const rx = -t.tz[mid] * -s;
    const rz = t.tx[mid] * -s;
    // spout toward the gap, ending over the basin's side wall
    const reach = 1.0;
    box(solid, p.x + rx * reach * 0.5, top - 0.5, p.z + rz * reach * 0.5, 0.6, 0.55, reach + 0.6, rx, rz, K.steel, 0xffffff);
    const sx = p.x + rx * reach;
    const sz = p.z + rz * reach;
    glow.quad([sx - t.tx[mid] * 0.2, top - 0.5, sz - t.tz[mid] * 0.2], [sx + t.tx[mid] * 0.2, top - 0.5, sz + t.tz[mid] * 0.2], [sx + t.tx[mid] * 0.2, floor + 0.3, sz + t.tz[mid] * 0.2], [sx - t.tx[mid] * 0.2, floor + 0.3, sz - t.tz[mid] * 0.2], K.waterB);
    // hot and cold knobs
    box(solid, p.x + t.tx[mid] * 1.1, top - 1.6, p.z + t.tz[mid] * 1.1, 0.6, 0.45, 0.6, t.tx[mid], t.tz[mid], K.red);
    box(solid, p.x - t.tx[mid] * 1.1, top - 1.6, p.z - t.tz[mid] * 1.1, 0.6, 0.45, 0.6, t.tx[mid], t.tz[mid], 0x3a8cff);
    break;
  }
  // a sponge and a soap bottle on the counter beside the far lip
  const far = beside(ctx, pc.i1 + Math.round(8 / t.step), -1, 1.2, 1.4);
  if (far) {
    box(solid, far.x, far.y, far.z, 1.6, 0.6, 2.4, far.tx, far.tz, 0xffd84a);
    box(solid, far.x, far.y + 0.6, far.z, 1.6, 0.35, 2.4, far.tx, far.tz, 0x48b86a);
  }
  const soap = beside(ctx, pc.i0 - Math.round(6 / t.step), 1, 1.2, 1);
  if (soap) {
    cyl(solid, soap.x, soap.y, soap.z, 0.8, 3.2, 0x7fd6a8, 8);
    cyl(solid, soap.x, soap.y + 3.2, soap.z, 0.3, 0.9, 0xffffff, 6);
  }
});

// tunnel: the bread bin
registerPieceSkin(0, 'tunnel', 0, (ctx) => {
  const { track: t, piece: pc, solid } = ctx;
  const n = span(t, pc);
  const H = STUNT.tunnel.ceiling;
  const facets = 8;
  const arch = (i: number, f: number, out: number): V => {
    const k = wrap(t, i);
    const Wd = Math.max(t.wallL[k], t.wallR[k]) + 0.9 + out;
    const th = Math.PI * (f / facets);
    const lat = -Math.cos(th) * Wd;
    const h = 0.6 + Math.sin(th) * (H - 0.6 + out);
    return P(t, k, lat, h - lat * t.bank[k]);
  };
  // the wooden roll top: slats 1 m wide over the generic shell, a darker groove between them
  const slat = Math.max(1, Math.round(1 / t.step));
  for (let k = 0; k < n; k += slat) {
    const i = pc.i0 + k;
    const j = pc.i0 + Math.min(n, k + slat);
    const col = Math.floor(k / slat) % 2 === 0 ? K.wood : K.woodB;
    for (let f = 0; f < facets; f++) solid.quad(arch(i, f, 0.35), arch(j, f, 0.35), arch(j, f + 1, 0.35), arch(i, f + 1, 0.35), f === 0 || f === facets - 1 ? K.woodD : col);
  }
  // the bin's ends: thick wooden boards round the portals, and a brass handle over the entrance
  for (const [i, dir] of [
    [pc.i0, -1],
    [pc.i1, 1],
  ] as const) {
    for (let f = 0; f < facets; f++) {
      solid.quad(arch(i, f, 0.35), arch(i, f + 1, 0.35), arch(i, f + 1, 1.6), arch(i, f, 1.6), K.woodD);
      solid.quad(arch(i, f, 1.6), arch(i, f + 1, 1.6), arch(i + dir * 2, f + 1, 1.6), arch(i + dir * 2, f, 1.6), K.woodD);
    }
    if (dir < 0) {
      const a = arch(i - 2, facets / 2, 1.7);
      box(solid, a[0], a[1], a[2], 3.2, 0.5, 0.5, t.tx[wrap(t, i)], t.tz[wrap(t, i)], 0xe9b949);
    }
  }
  // loaves on the lid: crusty boxes with a pale top, a baguette across
  for (const [fr, lat, w, l, h] of [
    [0.3, -1.6, 2.6, 4.2, 1.7],
    [0.55, 1.4, 2.4, 3.4, 1.5],
    [0.78, -0.4, 1.0, 7.0, 0.9],
  ] as const) {
    const i = wrap(t, pc.i0 + Math.round(n * fr));
    const p = P(t, i, lat, H + 0.5);
    box(solid, p[0], p[1] - 0.2, p[2], w, h, l, t.tx[i], t.tz[i], K.crust, 0xe8b46a);
  }
  // crumbs round the entrance (flat discs beside the walls)
  for (let q = 0; q < 6; q++) {
    const i = pc.i0 - Math.round((2 + q * 1.7) / t.step);
    const s = q % 2 ? 1 : -1;
    const p = beside(ctx, i, s, 0.4 + (q % 3) * 0.6, 0.4);
    if (p) box(solid, p.x, p.y, p.z, 0.7, 0.35, 0.7, p.tx, p.tz, K.crumb);
  }
});

// =============================================================================================
// Neon Rooftops (theme 1, night)
// =============================================================================================

const R = { cyan: 0x3ae0ff, pink: 0xff3ea5, magenta: 0xd23cff, yellow: 0xffe14d, orange: 0xff8a3d, brick: 0x8a3f3a, brickD: 0x6d302c, steel: 0x6f7b8c, steelB: 0x8a96a8, dark: 0x1d2233, win: 0xffd98a };

// loop: the neon ring (chasing neon round its outside, glowing pylons)
registerPieceSkin(1, 'loop', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow } = ctx;
  const hw = STUNT.loop.deckHalfW;
  const chase = [R.pink, R.magenta, R.cyan, R.yellow];
  underBand(t, pc, glow, -hw + 0.1, -hw + 0.7, (u) => chase[Math.floor(u / 1.8) % chase.length], 0.9, -0.5);
  underBand(t, pc, glow, hw - 0.7, hw - 0.1, (u) => chase[(Math.floor(u / 1.8) + 2) % chase.length], 0.9, -0.5);
  underBand(t, pc, solid, -hw + 0.7, hw - 0.7, () => R.dark, 0.9, -0.49);
  // glowing pylons under the two support points, and a ring of light beacons on the ground round the loop
  const c = loopCircle();
  for (const s of [-1, 1]) {
    const p = W(t, pc, c.f, 0, s * (c.lat + 2.4));
    if (roadClear(t, p[0], p[2], pc.strip, pc.end) < 1.5) continue;
    const i = wrap(t, pc.i0 + Math.round(c.f / t.step));
    const y = t.py[i] - 2;
    box(solid, p[0], y, p[2], 1.2, c.h + 2 + c.r + 1, 1.2, t.tx[i], t.tz[i], R.dark);
    for (let h = 2; h < c.h + c.r + 2; h += 2.2) box(glow, p[0], y + h, p[2], 1.3, 0.35, 1.3, t.tx[i], t.tz[i], h % 4.4 < 2.2 ? R.pink : R.cyan);
  }
});

// wall ride: the LED billboard (the lane's face is the screen)
registerPieceSkin(1, 'wall', 0, (ctx) => {
  const bands = [0x1e1440, 0x3a1f7a, R.magenta, R.pink, R.orange, R.yellow, 0xfff4b0, 0xffffff];
  return wallSkin(ctx, {
    face: (f, m) => {
      // a sunset gradient up the curl, scrolled by stripes of dark scan lines every 1.5 m
      if (Math.floor(m / 1.5) % 4 === 3) return 0x120c26;
      return bands[Math.min(bands.length - 1, f + (Math.floor(m / 6) % 2))];
    },
    glowFace: (f) => f >= 1,
    lip: R.dark,
    strip: (m) => (Math.floor(m / 2) % 2 === 0 ? R.cyan : R.pink),
    skirt: R.dark,
    deco(c, s, i, j, wi, wj, m) {
      // truss legs behind the screen every 8 m
      if (Math.floor(m) % 8 !== 0 || m < 0) return;
      const top = curlPoint(c.track, i, s, wi + 0.6, 0.02);
      box(c.solid, top[0], c.groundY, top[2], 0.5, top[1] - c.groundY, 0.5, c.track.tx[wrap(c.track, i)], c.track.tz[wrap(c.track, i)], R.steel);
      void j;
      void wj;
    },
  });
});

// jump gap: roof to roof (chimneys on both lips, lit windows down the alley walls)
registerPieceSkin(1, 'jump', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow } = ctx;
  if (pc.gap <= 0) return;
  // lit windows on both lip faces (the buildings' walls facing the alley)
  for (const [i, dir] of [
    [pc.i0, 1],
    [pc.i1, -1],
  ] as const) {
    const k = wrap(t, i);
    const wl = t.wallL[k];
    const wr = t.wallR[k];
    for (let row = 0; row < 3; row++)
      for (let d = -wl + 0.8; d < wr - 0.8; d += 2.2) {
        if (hash(k * 31 + row * 7 + Math.round(d * 3)) < 0.35) continue;
        const y = 1.6 + row * 2.2;
        // just off the lip face, on the alley side
        const ox = t.tx[k] * dir * 0.06;
        const oz = t.tz[k] * dir * 0.06;
        const a = P(t, k, d, -y);
        const b = P(t, k, d + 1.1, -y);
        glow.quad([a[0] + ox, a[1], a[2] + oz], [b[0] + ox, b[1], b[2] + oz], [b[0] + ox, b[1] + 1.1, b[2] + oz], [a[0] + ox, a[1] + 1.1, a[2] + oz], hash(k + row + d) < 0.5 ? R.win : 0xffb36b);
      }
  }
  // chimneys at the corners of both lips, a glowing ember top and a neon arrow over the near lip
  for (const i of [pc.i0 - Math.round(2 / t.step), pc.i1 + Math.round(2 / t.step)])
    for (const s of [-1, 1]) {
      const p = beside(ctx, i, s, 0.3, 0.8);
      if (!p) continue;
      box(solid, p.x, p.y - 0.5, p.z, 1.5, 4.2, 1.5, p.tx, p.tz, R.brick, R.brickD);
      box(glow, p.x, p.y + 3.7, p.z, 1.1, 0.12, 1.1, p.tx, p.tz, R.orange);
    }
  // a neon "go" arch over the near lip
  const i0 = wrap(t, pc.i0 - Math.round(1 / t.step));
  const wl = t.wallL[i0] + 0.4;
  const wr = t.wallR[i0] + 0.4;
  const h = 5.2;
  for (const d of [-wl, wr]) {
    const p = P(t, i0, d);
    box(solid, p[0], p[1], p[2], 0.35, h, 0.35, t.tx[i0], t.tz[i0], R.dark);
  }
  const a = P(t, i0, -wl, h);
  const b = P(t, i0, wr, h);
  glow.quad(a, b, [b[0], b[1] + 0.35, b[2]], [a[0], a[1] + 0.35, a[2]], R.pink);
  glow.quad([a[0], a[1] - 0.6, a[2]], [b[0], b[1] - 0.6, b[2]], [b[0], b[1] - 0.45, b[2]], [a[0], a[1] - 0.45, a[2]], R.cyan);
});

// tunnel: the air duct (ribbed steel over the shell, magenta floor strips, roof vents)
registerPieceSkin(1, 'tunnel', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow } = ctx;
  const n = span(t, pc);
  const H = STUNT.tunnel.ceiling;
  // a squarer duct: a box section over the arch (side walls, roof), ribs every 2 m
  const rib = Math.max(1, Math.round(2 / t.step));
  for (let k = 0; k < n; k += rib) {
    const i = pc.i0 + k;
    const j = pc.i0 + Math.min(n, k + rib);
    const wi = Math.max(t.wallL[wrap(t, i)], t.wallR[wrap(t, i)]) + 1.3;
    const wj = Math.max(t.wallL[wrap(t, j)], t.wallR[wrap(t, j)]) + 1.3;
    const col = Math.floor(k / rib) % 2 === 0 ? R.steel : R.steelB;
    for (const s of [-1, 1]) solid.quad(P(t, i, s * wi, 0), P(t, j, s * wj, 0), P(t, j, s * wj, H + 0.6), P(t, i, s * wi, H + 0.6), col);
    solid.quad(P(t, i, -wi, H + 0.6), P(t, j, -wj, H + 0.6), P(t, j, wj, H + 0.6), P(t, i, wi, H + 0.6), col);
    // the rib: a thicker band
    for (const s of [-1, 1]) solid.quad(P(t, i, s * (wi + 0.25), 0), P(t, i + 1, s * (wi + 0.25), 0), P(t, i + 1, s * (wi + 0.25), H + 0.85), P(t, i, s * (wi + 0.25), H + 0.85), 0x4d5666);
    // magenta strips along the floor at both walls
    for (const s of [-1, 1]) {
      const di = s * (s > 0 ? t.wallR[wrap(t, i)] : t.wallL[wrap(t, i)]) * 0.97;
      const dj = s * (s > 0 ? t.wallR[wrap(t, j)] : t.wallL[wrap(t, j)]) * 0.97;
      glow.quad(P(t, i, di, 0.05), P(t, j, dj, 0.05), P(t, j, dj - s * 0.35, 0.05), P(t, i, di - s * 0.35, 0.05), R.magenta);
    }
  }
  // roof vents: a fan box with a glowing grille on top, twice
  for (const fr of [0.3, 0.72]) {
    const i = wrap(t, pc.i0 + Math.round(n * fr));
    const p = P(t, i, 0, H + 0.6);
    box(solid, p[0], p[1], p[2], 4, 1.4, 4, t.tx[i], t.tz[i], R.steelB, R.steel);
    disc(glow, [p[0], p[1] + 1.45, p[2]], [0, 1, 0], 1.6, 1.2, R.cyan, 12);
  }
});

// =============================================================================================
// Laundry Spin (theme 2)
// =============================================================================================

const L = { white: 0xfbfbf7, enamel: 0xeef3f6, chrome: 0xd5dde4, glass: 0xa9dcff, glassB: 0x7cc6f2, pink: 0xff8fb1, blue: 0x9fd3ff, mint: 0xbfe8c8, butter: 0xffe08a, lilac: 0xc9b6ff, basket: 0x7fb8e6, basketD: 0x5f9cd0 };
const PASTEL = [L.pink, L.blue, L.mint, L.butter, L.lilac];

// loop: the drum. Two rims with paddles spin round the loop (one Object3D for the track); a white washer front frames it
registerPieceSkin(2, 'loop', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow, group } = ctx;
  const c = loopCircle();
  const Rd = c.r + 2.2;
  const lat = c.lat + 1.8;
  const centre = W(t, pc, c.f, c.h, 0);
  const right = W(t, pc, c.f, c.h, 1);
  const ax: V = [right[0] - centre[0], right[1] - centre[1], right[2] - centre[2]];
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  ax[0] /= al;
  ax[1] /= al;
  ax[2] /= al;
  // the spinning cage, built in local space (x = the drum's axis) and placed at the centre
  const b = new LocalBuilder();
  const segs = 28;
  for (const s of [-1, 1]) {
    const x = s * lat;
    for (let q = 0; q < segs; q++) {
      const a0 = (q / segs) * Math.PI * 2;
      const a1 = ((q + 1) / segs) * Math.PI * 2;
      const col = q % 2 === 0 ? L.chrome : L.white;
      // the rim: a flat ring 1.1 m deep and a lip
      b.quad([x, Math.cos(a0) * Rd, Math.sin(a0) * Rd], [x, Math.cos(a1) * Rd, Math.sin(a1) * Rd], [x, Math.cos(a1) * (Rd + 0.9), Math.sin(a1) * (Rd + 0.9)], [x, Math.cos(a0) * (Rd + 0.9), Math.sin(a0) * (Rd + 0.9)], col);
      b.quad([x, Math.cos(a0) * (Rd + 0.9), Math.sin(a0) * (Rd + 0.9)], [x, Math.cos(a1) * (Rd + 0.9), Math.sin(a1) * (Rd + 0.9)], [x - s * 1.2, Math.cos(a1) * (Rd + 0.9), Math.sin(a1) * (Rd + 0.9)], [x - s * 1.2, Math.cos(a0) * (Rd + 0.9), Math.sin(a0) * (Rd + 0.9)], L.chrome);
    }
    // paddles: six ribs on the rim reaching in toward the loop (never over the road: they stop past the ribbon)
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const w = 0.5;
      const p0: V = [x, ca * Rd - sa * w, sa * Rd + ca * w];
      const p1: V = [x, ca * Rd + sa * w, sa * Rd - ca * w];
      const p2: V = [x - s * 1.6, ca * (Rd - 1.2) + sa * w, sa * (Rd - 1.2) - ca * w];
      const p3: V = [x - s * 1.6, ca * (Rd - 1.2) - sa * w, sa * (Rd - 1.2) + ca * w];
      b.quad(p0, p1, p2, p3, PASTEL[q % PASTEL.length]);
    }
    // spokes to a hub (outside the ribbon's reach: the rim's plane)
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2 + Math.PI / 4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const w = 0.22;
      b.quad([x, -sa * w, ca * w], [x, sa * w, -ca * w], [x, ca * Rd + sa * w, sa * Rd - ca * w], [x, ca * Rd - sa * w, sa * Rd + ca * w], L.chrome);
    }
  }
  const mesh = new Mesh(b.build(), toonMaterial({ vertexColors: true, side: 2 }));
  mesh.name = 'piece-drum';
  mesh.position.set(centre[0], centre[1], centre[2]);
  // local x → the drum's axis (the road's right at the loop)
  const yaw = Math.atan2(-ax[2], ax[0]);
  mesh.rotation.set(0, yaw, 0, 'YXZ');
  const spin = (): void => {
    mesh.rotation.x = -((performance.now() / 1000) * 0.9) % (Math.PI * 2);
  };
  (mesh as Object3D).onBeforeRender = spin;
  group.add(mesh);
  // the axle hubs (static) and the porthole's glass edge round each rim
  for (const s of [-1, 1]) {
    const hub = W(t, pc, c.f, c.h, s * (lat + 0.4));
    disc(solid, hub, [ax[0] * s, ax[1] * s, ax[2] * s], 1.2, 0, L.chrome, 10);
    disc(glow, [hub[0] + ax[0] * s * 0.9, hub[1], hub[2] + ax[2] * s * 0.9], [ax[0] * s, ax[1] * s, ax[2] * s], Rd + 1.3, Rd + 0.95, L.glassB, 28);
  }
});

// wall ride: the dryer row (enamel fronts, a porthole on every machine)
registerPieceSkin(2, 'wall', 0, (ctx) =>
  wallSkin(ctx, {
    face: (f, m) => (f === 0 ? L.chrome : Math.floor(m / 5) % 5 === 4 ? 0xdfe6ea : L.enamel),
    lip: L.chrome,
    strip: (m) => PASTEL[Math.floor(m / 5) % PASTEL.length],
    skirt: L.white,
    deco(c, s, i, j, wi, wj, m) {
      if (m < 0 || Math.floor(m) % 5 !== 2 || m - Math.floor(m) > 0.5) return;
      // a porthole high on the dryer front (a chrome ring and glass), a control strip over it
      const p = curlPoint(c.track, i, s, wi * 0.62, 0.04);
      const q = curlPoint(c.track, i, s, wi * 0.62, 0.6);
      const nrm: V = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
      const nn: V = [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl];
      disc(c.solid, p, nn, 1.25, 0.95, L.chrome, 14);
      disc(c.glow, [p[0] + nn[0] * 0.01, p[1] + nn[1] * 0.01, p[2] + nn[2] * 0.01], nn, 0.95, 0, (Math.floor(m / 5) % 2 === 0 ? L.glass : L.glassB), 14);
      void j;
      void wj;
    },
  }),
);

// jump gap: the end of the folding table (towel stacks on both lips, a laundry basket under the net)
registerPieceSkin(2, 'jump', 0, (ctx) => {
  const { track: t, piece: pc, solid, glow } = ctx;
  if (pc.gap <= 0) return;
  const n = span(t, pc);
  const yN = Math.min(pc.lipY, pc.landY) - 2.4;
  // the basket: four walls round the gap from the floor up to just over the net's rim, a woven band
  const yB = Math.max(ctx.groundY, yN - 3.5);
  const ends = [pc.i0 - 1, pc.i1 + 1];
  const corners: V[] = [];
  for (const [ii, s] of [
    [ends[0], -1],
    [ends[0], 1],
    [ends[1], 1],
    [ends[1], -1],
  ] as const) {
    const k = wrap(t, ii);
    corners.push(P(t, k, s * (wallOf(t, k, s) + 0.7)));
  }
  for (let q = 0; q < 4; q++) {
    const a = corners[q];
    const b = corners[(q + 1) % 4];
    const top = yN + 1.1;
    solid.quad([a[0], yB, a[2]], [b[0], yB, b[2]], [b[0], top, b[2]], [a[0], top, a[2]], q % 2 ? L.basket : L.basketD);
    glow.quad([a[0], top - 0.6, a[2]], [b[0], top - 0.6, b[2]], [b[0], top - 0.35, b[2]], [a[0], top - 0.35, a[2]], L.pink);
  }
  // a heap of towels in the basket under the net
  const mid = wrap(t, pc.i0 + Math.round(n / 2));
  for (let q = 0; q < 5; q++) {
    const p = P(t, mid + Math.round(((q - 2) * 2.2) / t.step), (q % 2 ? 1 : -1) * 1.8 * (q % 3));
    box(solid, p[0], yB, p[2], 3.4, Math.max(0.4, yN - 0.6 - yB - (q % 2) * 0.5), 2.6, t.tx[mid], t.tz[mid], PASTEL[q]);
  }
  // folded towel stacks on both lips, beside the road
  for (const i of [pc.i0 - Math.round(4 / t.step), pc.i1 + Math.round(6 / t.step)])
    for (const s of [-1, 1]) {
      const p = beside(ctx, i, s, 0.4, 1.2);
      if (!p) continue;
      for (let h = 0; h < 4; h++) box(solid, p.x, p.y + h * 0.45, p.z, 2.2, 0.42, 1.8, p.tx, p.tz, PASTEL[(h + (s > 0 ? 1 : 3)) % PASTEL.length]);
    }
});

// tunnel: the shirt rack (a chrome rail over the shell with pastel shirts hanging down its sides)
registerPieceSkin(2, 'tunnel', 0, (ctx) => {
  const { track: t, piece: pc, solid } = ctx;
  const n = span(t, pc);
  const H = STUNT.tunnel.ceiling;
  const every = Math.max(1, Math.round(1.1 / t.step));
  for (let k = 0; k <= n; k += every) {
    const i = wrap(t, pc.i0 + k);
    const Wd = Math.max(t.wallL[i], t.wallR[i]) + 1.15;
    const col = PASTEL[Math.floor(k / every) % PASTEL.length];
    for (const s of [-1, 1]) {
      // a shirt hanging on the outside of the shell: body, and the two sleeves
      const top = P(t, i, s * Wd, H - 1.4);
      const bot = P(t, i, s * Wd, 1.2);
      const fx = t.tx[i] * 0.45;
      const fz = t.tz[i] * 0.45;
      const ox = -t.tz[i] * s * 0.05;
      const oz = t.tx[i] * s * 0.05;
      solid.quad([top[0] - fx + ox, top[1], top[2] - fz + oz], [top[0] + fx + ox, top[1], top[2] + fz + oz], [bot[0] + fx + ox, bot[1], bot[2] + fz + oz], [bot[0] - fx + ox, bot[1], bot[2] - fz + oz], col);
      solid.quad([top[0] - fx * 2 + ox, top[1] - 0.2, top[2] - fz * 2 + oz], [top[0] + fx * 2 + ox, top[1] - 0.2, top[2] + fz * 2 + oz], [top[0] + fx * 2 + ox, top[1] - 1.3, top[2] + fz * 2 + oz], [top[0] - fx * 2 + ox, top[1] - 1.3, top[2] - fz * 2 + oz], col);
    }
  }
  // the rails the shirts hang from, along both sides, on uprights past both ends
  for (const s of [-1, 1]) {
    for (let k = 0; k < n; k += every) {
      const i = wrap(t, pc.i0 + k);
      const j = wrap(t, pc.i0 + Math.min(n, k + every));
      const a = P(t, i, s * (Math.max(t.wallL[i], t.wallR[i]) + 1.15), H - 1.3);
      const b = P(t, j, s * (Math.max(t.wallL[j], t.wallR[j]) + 1.15), H - 1.3);
      solid.quad(a, b, [b[0], b[1] + 0.22, b[2]], [a[0], a[1] + 0.22, a[2]], L.chrome);
    }
    for (const i of [pc.i0 - 2, pc.i1 + 2]) {
      const k = wrap(t, i);
      const p = P(t, k, s * (Math.max(t.wallL[k], t.wallR[k]) + 1.15), 0);
      cyl(solid, p[0], p[1] - 0.6, p[2], 0.2, H - 0.5, L.chrome, 6);
    }
  }
});

// ---------------------------------------------------------------------------------------------

/** Deterministic hash in [0, 1). */
function hash(n: number): number {
  let x = (Math.round(n * 1000) | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const _c = new Color();

/** A small vertex-coloured triangle collector in local space (the drum's own mesh). */
class LocalBuilder {
  pos: number[] = [];
  col: number[] = [];
  quad(a: V, b: V, c: V, d: V, color: number): void {
    _c.setHex(color);
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) this.col.push(_c.r, _c.g, _c.b);
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
