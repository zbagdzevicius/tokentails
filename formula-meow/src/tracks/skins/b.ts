/**
 * Set-piece skins of the tracks-B lane (Yarn Canyon, Cat Café Chaos, Pink Paw Shelter Sprint, Living Room Rug),
 * SETPIECES.md section 12. Every skin here ADDS to the generic look (core/track/stunt-mesh.ts keeps the deck, the
 * rails, the lips, the net and the neon) and merges into the track's `solid` / `glow` builders: no draw call.
 * Render-only, Math trig is fine.
 *
 * - Yarn Canyon (theme 3): the mesa tunnel (layered rock round the arch, yarn wound round the portals, a yarn ball
 *   on top), the broken needle-bridge strand (frayed yarn ends, strands slung over the gap, pom-poms on the lips),
 *   the canyon wall ride (rock strata behind the curl, a yarn rope and pegs along its top).
 * - Cat Café Chaos (theme 4, dark: bright emissive details): the cat-tree tunnel (sisal posts, carpeted walls and
 *   deck, a cubby on top, glowing cat eyes and warm strips inside), the coffee-cup half-pipe (a ceramic rim and shell,
 *   the handle, steam), the koi pond (water over the gap with ripples, lily pads and koi), the mug beside the
 *   mug-handle loop.
 * - Pink Paw Shelter Sprint (theme 5, cosy): the cat exercise wheel round the loop (rims, spokes, rungs over the top,
 *   a stand), the cat flap (a little house round the tunnel, the flap swung up over the door with a paw print), the
 *   carpet scratch wall (sisal rope, scratching posts with pom-poms), the cushion hop (a blanket over the gap,
 *   bolsters on the lips, sleeping baskets beside the landing).
 * - Living Room Rug (theme 6): the sofa-cushion kicker (a tufted cushion cover over the aimed ramp).
 */
import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import type { BuiltPiece, BuiltTrack } from '../../core/track/build';
import type { TriBuilder, V } from '../../core/track/mesh';
import { GeoBuilder, hash01 } from '../../core/render/geo';
import { curlAt } from '../../core/render/stunt-pose';
import { LOOP_SHAPE } from '../../core/track/stunt';
import { rampHeight } from '../../core/track/query';
import { STUNT } from '../../tuning';
import { registerPieceSkin, type PieceSkinCtx } from './registry';

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const wrap = (t: BuiltTrack, i: number) => ((i % t.n) + t.n) % t.n;
/** samples from a forward to b */
const span = (t: BuiltTrack, a: number, b: number) => (((b - a) % t.n) + t.n) % t.n;
/** metres → samples (at least 1) */
const ms = (t: BuiltTrack, m: number) => Math.max(1, Math.round(m / t.step));

/** A point at main sample i, lateral d (+ = the sim's +d side), `h` m above the road's centre height (no bank). */
function pt(t: BuiltTrack, i: number, d: number, h = 0): V {
  const k = wrap(t, i);
  return [t.px[k] - t.tz[k] * d, t.py[k] + h, t.pz[k] + t.tx[k] * d];
}

/** Yaw that turns a GeoBuilder part's local +z along the road at sample i (local +x is then the road's −d side). */
const yaw = (t: BuiltTrack, i: number) => Math.atan2(t.tx[wrap(t, i)], t.tz[wrap(t, i)]);

/** The half-width of a tunnel's arch at sample i (as core/track/stunt-mesh.ts draws it). */
const archW = (t: BuiltTrack, i: number) => Math.max(t.wallL[wrap(t, i)], t.wallR[wrap(t, i)]) + 0.9;

/** Append a GeoBuilder's triangles to a track builder (same vertex-colour space; normals are recomputed there). */
function flush(g: GeoBuilder, into: TriBuilder): void {
  if (!g.vertexCount) return;
  const geo = g.build();
  const p = geo.getAttribute('position').array;
  const c = geo.getAttribute('color').array;
  for (let i = 0; i < p.length; i++) into.pos.push(p[i]);
  for (let i = 0; i < c.length; i++) into.col.push(c[i]);
  geo.dispose();
}

const _m = new Matrix4();
const _q = new Quaternion();
const _a = new Vector3();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);

/** A round rod from a to b. */
function rod(g: GeoBuilder, a: V, b: V, r: number, color: number, seg = 6): void {
  _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _a.length();
  if (len < 1e-3) return;
  _q.setFromUnitVectors(_up, _a.multiplyScalar(1 / len));
  _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  g.add(new CylinderGeometry(r, r, len + r * 0.6, seg), color, _m.compose(_p, _q, _s), { vary: 0 });
}

/** A slung strand from a to b sagging `sag` m in the middle (`n` rods). */
function strand(g: GeoBuilder, a: V, b: V, sag: number, r: number, color: number, n = 8): void {
  let prev = a;
  for (let k = 1; k <= n; k++) {
    const u = k / n;
    const p: V = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u];
    rod(g, prev, p, r, color);
    prev = p;
  }
}

/** A flat disc (triangle fan) centred at c in the plane of unit vectors u, v. Seen from u × v (both sides if unlit). */
function disc(tb: TriBuilder, c: V, u: V, v: V, ru: number, rv: number, color: number, seg = 10): void {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2;
    const a1 = ((k + 1) / seg) * Math.PI * 2;
    const p = (a: number): [number, number, number] => [c[0] + u[0] * Math.cos(a) * ru + v[0] * Math.sin(a) * rv, c[1] + u[1] * Math.cos(a) * ru + v[1] * Math.sin(a) * rv, c[2] + u[2] * Math.cos(a) * ru + v[2] * Math.sin(a) * rv];
    tb.tri(c[0], c[1], c[2], ...p(a0), ...p(a1), color);
  }
}

/** A flat horizontal disc at c (y up). */
function flatDisc(tb: TriBuilder, c: V, r: number, color: number, seg = 10, sx = 1): void {
  disc(tb, c, [sx, 0, 0], [0, 0, 1], r, r, color, seg);
}

/** A vertical rectangle facing across the road at sample i: `len` m along it, from height y0 to y1, at lateral d. */
function sideQuad(tb: TriBuilder, t: BuiltTrack, i: number, d: number, along: number, len: number, y0: number, y1: number, color: number): void {
  const k = wrap(t, i);
  const cx = t.px[k] - t.tz[k] * d + t.tx[k] * along;
  const cz = t.pz[k] + t.tx[k] * d + t.tz[k] * along;
  const hx = (t.tx[k] * len) / 2;
  const hz = (t.tz[k] * len) / 2;
  const y = t.py[k];
  tb.quad([cx - hx, y + y0, cz - hz], [cx + hx, y + y0, cz + hz], [cx + hx, y + y1, cz + hz], [cx - hx, y + y1, cz - hz], color);
}

/**
 * How far (x, z) keeps from the walls of every OTHER stretch of road (main samples outside [skip0, skip1], and the
 * branches): props placed by hand next to a piece must not stand on another road.
 */
function roadGap(t: BuiltTrack, x: number, z: number, skip0: number, skip1: number): number {
  let best = Infinity;
  const skipLen = span(t, skip0, skip1);
  for (let i = 0; i < t.n; i += 3) {
    if (span(t, skip0, i) <= skipLen) continue;
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

const curl = { o: 0, h: 0, phi: 0 };

/** The top of a wall lane's curl at sample i on side s (stunt-mesh.ts `curlPoint` at the sim's wall), lifted `lift`. */
function curlTop(t: BuiltTrack, i: number, s: number, extra = 0, lift = 0): V | null {
  const k = wrap(t, i);
  const lane = s > 0 ? t.laneR[k] : t.laneL[k];
  if (!(lane > 0.3)) return null;
  const hw = t.halfW[k];
  const dl = (s > 0 ? t.wallR[k] : t.wallL[k]) - hw + extra;
  curlAt(dl, lane, curl);
  const bank = Math.atan(t.bank[k]) * s;
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  const lat = curl.o * cb - curl.h * sb;
  const up = curl.o * sb + curl.h * cb;
  const a = bank + curl.phi;
  const rx = -t.tz[k];
  const rz = t.tx[k];
  const ex = t.px[k] + rx * s * hw;
  const ey = t.py[k] + s * hw * t.bank[k];
  const ez = t.pz[k] + rz * s * hw;
  return [ex + rx * s * (lat - Math.sin(a) * lift), ey + up + Math.cos(a) * lift, ez + rz * s * (lat - Math.sin(a) * lift)];
}

/** Each lane side of a wall piece, with the samples along it (every `every` m) where the curl is up. */
function laneWalk(t: BuiltTrack, pc: BuiltPiece, every: number, fn: (i: number, s: -1 | 1, top: V, k: number) => void): void {
  const len = span(t, pc.i0, pc.i1);
  const st = ms(t, every);
  for (const s of pc.side === 0 ? ([-1, 1] as const) : ([pc.side] as Array<-1 | 1>)) {
    for (let k = 0; k <= len; k += st) {
      const i = wrap(t, pc.i0 + k);
      const top = curlTop(t, i, s);
      if (top) fn(i, s, top, k);
    }
  }
}

/** The outward horizontal unit vector on side s at sample i. */
const outward = (t: BuiltTrack, i: number, s: number): V => [-t.tz[wrap(t, i)] * s, 0, t.tx[wrap(t, i)] * s];

/**
 * A shell round a tunnel: side blocks from the arch's feet out `thick` m, `layers` bands up to the roof, and a roof
 * slab over the arch, in `colors` (a mesa, a cat tree's carpet, a cat house's walls).
 */
function tunnelShell(g: GeoBuilder, t: BuiltTrack, pc: BuiltPiece, opt: { thick: number; roof: number; layers: number; colors: number[]; roofColor?: number; every?: number }): void {
  const len = span(t, pc.i0, pc.i1);
  const H = STUNT.tunnel.ceiling;
  const st = ms(t, opt.every ?? 4);
  for (let k = 0; k < len; k += st) {
    const i = wrap(t, pc.i0 + Math.min(len, k + (st >> 1)));
    const seg = Math.min(st, len - k) * t.step + 0.3;
    const W = archW(t, i);
    const tilt = Math.abs(t.bank[i]) * W;
    const ry = yaw(t, i);
    const hTot = H + tilt + opt.roof;
    const lh = hTot / opt.layers;
    for (const s of [-1, 1]) {
      const d = s * (W + opt.thick / 2 - 0.2);
      const [x, , z] = pt(t, i, d);
      for (let l = 0; l < opt.layers; l++) g.boxUp(opt.thick, lh + 0.02, seg, opt.colors[(l + (s > 0 ? 1 : 0)) % opt.colors.length], { x, y: t.py[i] - 0.6 + l * lh, z, ry }, { vary: 0.04 });
    }
    const [x, , z] = pt(t, i, 0);
    g.boxUp(2 * (W + opt.thick) - 0.4, opt.roof, seg, opt.roofColor ?? opt.colors[0], { x, y: t.py[i] + H + tilt - 0.05, z, ry }, { vary: 0.03 });
  }
}

// ---------------------------------------------------------------------------------------------
// Yarn Canyon (theme 3)
// ---------------------------------------------------------------------------------------------

const ROCK = [0xc96a48, 0xd98258, 0xb85a3e, 0xe0956a];
const YARN = [0xff3ea5, 0x7b2cbf, 0xffc93c, 0x3aa8ff, 0xff8a3d];

// the mesa: the tunnel is cut through a layered rock mesa wound with yarn
registerPieceSkin(3, 'tunnel', 0, ({ track: t, piece: pc, solid }: PieceSkinCtx) => {
  const g = new GeoBuilder();
  tunnelShell(g, t, pc, { thick: 4, roof: 3.4, layers: 4, colors: ROCK });
  const H = STUNT.tunnel.ceiling;
  // yarn wound round both portals, and round the mesa's middle
  const len = span(t, pc.i0, pc.i1);
  for (const [k, c] of [
    [1, 0],
    [len - 1, 3],
    [len >> 1, 2],
  ] as const) {
    const i = wrap(t, pc.i0 + k);
    const W = archW(t, i);
    const [x, y, z] = pt(t, i, 0, 0.6);
    for (let r = 0; r < 3; r++) g.torus(W + 4.1 + r * 0.05, 0.42, YARN[(c + r) % YARN.length], { x: x + t.tx[i] * (r - 1) * 0.9, y, z: z + t.tz[i] * (r - 1) * 0.9, ry: yaw(t, i) }, { vary: 0 }, 5, 24);
  }
  // a giant ball of yarn on the mesa top
  const im = wrap(t, pc.i0 + Math.round(len * 0.35));
  const top = pt(t, im, 0, H + 3.4 + Math.abs(t.bank[im]) * archW(t, im) + 2.6);
  g.sphere(2.8, YARN[0], { x: top[0], y: top[1], z: top[2] }, { vary: 0.02 }, 12, 9);
  for (let k = 0; k < 4; k++) g.torus(2.85, 0.14, 0xffb3d6, { x: top[0], y: top[1], z: top[2], rx: k * 0.8, ry: k * 0.5 }, { vary: 0 }, 4, 18);
  strand(g, top, pt(t, wrap(t, pc.i1), -(archW(t, pc.i1) + 3.8), H + 3.6), 0.6, 0.14, YARN[0], 6);
  flush(g, solid);
});

// the broken strand of the needle bridge: frayed ends at both lips, yarn slung over the gap, pom-poms on the corners
registerPieceSkin(3, 'jump', 0, ({ track: t, piece: pc, solid }: PieceSkinCtx) => {
  if (pc.gap <= 0) return;
  const g = new GeoBuilder();
  for (const [i, dir] of [
    [pc.i0, 1],
    [pc.i1, -1],
  ] as const) {
    const k = wrap(t, i);
    // frayed yarn ends hanging off the broken deck
    for (let f = -3; f <= 3; f++) {
      const d = (f / 3) * (t.halfW[k] - 0.8);
      const a = pt(t, k, d, -0.25);
      const b: V = [a[0] + t.tx[k] * dir * (0.6 + hash01(f + 7) * 0.8), a[1] - 1.4 - hash01(f * 3 + 1) * 1.6, a[2] + t.tz[k] * dir * (0.6 + hash01(f + 7) * 0.8)];
      rod(g, a, b, 0.16, YARN[(f + 7) % YARN.length], 5);
    }
    // pom-poms on the lip corners, outside the rails
    for (const s of [-1, 1]) {
      const w = (s > 0 ? t.wallR[k] : t.wallL[k]) + 0.9;
      const p = pt(t, k, s * w, 0.8);
      g.sphere(0.85, YARN[(s > 0 ? 2 : 3) + (dir > 0 ? 0 : 1)], { x: p[0], y: p[1], z: p[2] }, { vary: 0.03 }, 9, 7);
    }
  }
  // two strands slung over the gap beside the rails, and a sagging yarn hammock under it (the net's frame)
  const a0 = wrap(t, pc.i0);
  const a1 = wrap(t, pc.i1);
  for (const s of [-1, 1]) {
    const w0 = (s > 0 ? t.wallR[a0] : t.wallL[a0]) + 0.9;
    const w1 = (s > 0 ? t.wallR[a1] : t.wallL[a1]) + 0.9;
    strand(g, pt(t, a0, s * w0, 0.8), pt(t, a1, s * w1, 0.8), 0.9, 0.13, s > 0 ? YARN[0] : YARN[1]);
    strand(g, pt(t, a0, s * w0, -0.3), pt(t, a1, s * w1, -0.3), 2.2, 0.18, YARN[4], 8);
  }
  flush(g, solid);
});

// the canyon wall: rock strata behind the curl, a yarn rope along its top, yarn-wound pegs
registerPieceSkin(3, 'wall', 0, ({ track: t, piece: pc, solid, groundY }: PieceSkinCtx) => {
  const g = new GeoBuilder();
  let prev: V | null = null;
  laneWalk(t, pc, 3, (i, s, top, k) => {
    const o = outward(t, i, s);
    if (k % ms(t, 6) === 0) {
      const h = top[1] + 1.2 - groundY;
      const c: V = [top[0] + o[0] * 2.2, 0, top[2] + o[2] * 2.2];
      const layers = 3;
      for (let l = 0; l < layers; l++) g.boxUp(3.4, h / layers + 0.02, 6.4, ROCK[(l + (k >> 3)) % ROCK.length], { x: c[0], y: groundY + (l * h) / layers, z: c[2], ry: yaw(t, i) }, { vary: 0.05 });
    }
    const rope = curlTop(t, i, s, 0.3, 0.35);
    if (rope && prev) rod(g, prev, rope, 0.16, YARN[0], 5);
    prev = rope;
    if (rope && k % ms(t, 9) === 0) {
      g.cylUp(0.32, 0.38, 1.3, 7, 0xe0c8a0, { x: rope[0], y: rope[1] - 0.4, z: rope[2] }, { vary: 0 });
      for (let r = 0; r < 3; r++) g.torus(0.4, 0.12, YARN[(k + r) % YARN.length], { x: rope[0], y: rope[1] + r * 0.28, z: rope[2], rx: Math.PI / 2 }, { vary: 0 }, 4, 10);
    }
  });
  flush(g, solid);
});

// ---------------------------------------------------------------------------------------------
// Cat Café Chaos (theme 4, night)
// ---------------------------------------------------------------------------------------------

const SISAL = 0xd9b48a;
const SISAL_D = 0xb8935f;
const CARPET = [0x6b3f7a, 0x7b4a8a, 0x5a3468];

// the cat tree: sisal posts at the portals, carpeted walls and deck, a cubby on top; cat eyes glow inside
registerPieceSkin(4, 'tunnel', 0, ({ track: t, piece: pc, solid, glow }: PieceSkinCtx) => {
  const g = new GeoBuilder();
  const H = STUNT.tunnel.ceiling;
  tunnelShell(g, t, pc, { thick: 1.6, roof: 0.9, layers: 2, colors: CARPET, roofColor: 0x9b6aaa });
  const len = span(t, pc.i0, pc.i1);
  for (const k of [0, len]) {
    const i = wrap(t, pc.i0 + k);
    const W = archW(t, i);
    for (const s of [-1, 1]) {
      const p = pt(t, i, s * (W + 2.2));
      g.cylUp(0.95, 0.95, H + 4.5, 10, SISAL, { x: p[0], y: p[1] - 0.6, z: p[2] }, { vary: 0.02 });
      for (let r = 0; r < 12; r++) g.torus(0.98, 0.1, SISAL_D, { x: p[0], y: p[1] + r * 0.85, z: p[2], rx: Math.PI / 2 }, { vary: 0 }, 4, 10);
      g.boxUp(3.4, 0.5, 3.4, 0x9b6aaa, { x: p[0], y: p[1] + H + 3.9, z: p[2], ry: yaw(t, i) }, { vary: 0.02 });
    }
  }
  // the cubby on the deck (a round door with two eyes in it), and a feather toy dangling off the deck's edge
  const im = wrap(t, pc.i0 + (len >> 1));
  const deck = pt(t, im, 0, H + 0.9 + Math.abs(t.bank[im]) * archW(t, im) - 0.05);
  g.boxUp(5.4, 4.2, 5.4, 0x7b4a8a, { x: deck[0], y: deck[1], z: deck[2], ry: yaw(t, im) }, { vary: 0.03 });
  const f: V = [t.tx[im], 0, t.tz[im]];
  const doorC: V = [deck[0] - f[0] * 2.72, deck[1] + 2.1, deck[2] - f[2] * 2.72];
  const lat: V = [-t.tz[im], 0, t.tx[im]];
  disc(solid, doorC, lat, [0, 1, 0], 1.4, 1.4, 0x1a0f1e, 14);
  for (const s of [-1, 1]) disc(glow, [doorC[0] - f[0] * 0.03 + lat[0] * s * 0.45, doorC[1] + 0.2, doorC[2] - f[2] * 0.03 + lat[2] * s * 0.45], lat, [0, 1, 0], 0.2, 0.12, 0xb6ff4d, 8);
  const edge = pt(t, wrap(t, pc.i0 + Math.round(len * 0.2)), archW(t, pc.i0) + 1.2, H + 0.6);
  rod(g, edge, [edge[0], edge[1] - 2.6, edge[2]], 0.05, 0xfff3dc, 4);
  g.sphere(0.45, 0xff3ea5, { x: edge[0], y: edge[1] - 2.9, z: edge[2], sy: 1.6 }, { vary: 0 }, 6, 5);
  flush(g, solid);
  // inside: pairs of glowing cat eyes peeking from the walls, warm strips along the foot of the arch
  const ring = ms(t, 5);
  for (let k = ms(t, 3); k < len - 1; k += ring) {
    const i = wrap(t, pc.i0 + k);
    const s = (k / ring) % 2 < 1 ? -1 : 1;
    const W = archW(t, i);
    const th = Math.PI * 0.14;
    const d = s * (Math.cos(th) * (W - 0.18));
    const h = 0.6 + Math.sin(th) * (H - 0.78) + 0.4 * hash01(k);
    const tan: V = [t.tx[i], 0, t.tz[i]];
    for (const e of [-0.4, 0.4]) {
      const c = pt(t, i, d, h + d * t.bank[i]);
      disc(glow, [c[0] + tan[0] * e, c[1], c[2] + tan[2] * e], tan, [0, 1, 0], 0.2, 0.12, k % 3 ? 0xb6ff4d : 0xffe14d, 8);
    }
  }
  for (let k = 0; k < len; k += 2) {
    for (const s of [-1, 1]) {
      const i = wrap(t, pc.i0 + k);
      const W = archW(t, i);
      sideQuad(glow, t, i, s * (W - 0.12), t.step, 2 * t.step, 0.7 + s * W * t.bank[i], 0.86 + s * W * t.bank[i], 0xffa64d);
    }
  }
});

// the coffee-cup half-pipe: a ceramic rim and shell, the handle, steam rising off the rim
registerPieceSkin(4, 'wall', 0, ({ track: t, piece: pc, solid, glow, groundY }: PieceSkinCtx) => {
  const g = new GeoBuilder();
  let prev: V | null = null;
  let mid: { i: number; s: number; top: V } | null = null;
  const len = span(t, pc.i0, pc.i1);
  laneWalk(t, pc, 2, (i, s, top, k) => {
    const rim = curlTop(t, i, s, 0.25, 0.25);
    if (rim && prev) rod(g, prev, rim, 0.34, 0xfff3dc, 8);
    prev = rim;
    const o = outward(t, i, s);
    if (k % ms(t, 4) === 0) {
      const c: V = [top[0] + o[0] * 1.1, 0, top[2] + o[2] * 1.1];
      const h = top[1] + 0.2 - groundY;
      g.boxUp(1.2, h, 4.2, 0xfff3dc, { x: c[0], y: groundY, z: c[2], ry: yaw(t, i) }, { vary: 0.02 });
      g.boxUp(1.35, 0.9, 4.25, 0xff8fb1, { x: c[0], y: groundY + h * 0.55, z: c[2], ry: yaw(t, i) }, { vary: 0 });
    }
    if (!mid && k >= len / 2) mid = { i, s, top };
    // steam over the rim
    if (k % ms(t, 7) === 0 && rim) {
      for (let w = 0; w < 3; w++) {
        const x = rim[0] + o[0] * (0.2 + (w % 2) * 0.35);
        const z = rim[2] + o[2] * (0.2 + (w % 2) * 0.35);
        glow.quad([x - t.tx[i] * 0.25, rim[1] + 0.6 + w * 0.7, z - t.tz[i] * 0.25], [x + t.tx[i] * 0.25, rim[1] + 0.6 + w * 0.7, z + t.tz[i] * 0.25], [x + t.tx[i] * 0.18, rim[1] + 1.1 + w * 0.7, z + t.tz[i] * 0.18], [x - t.tx[i] * 0.18, rim[1] + 1.1 + w * 0.7, z - t.tz[i] * 0.18], 0xfff3dc);
      }
    }
  });
  // the handle: a ring sticking out of the cup's side, halfway along
  const m = mid as { i: number; s: number; top: V } | null;
  if (m) {
    const o = outward(t, m.i, m.s);
    const c: V = [m.top[0] + o[0] * 3.4, groundY + (m.top[1] - groundY) * 0.55, m.top[2] + o[2] * 3.4];
    g.torus(2.1, 0.5, 0xfff3dc, { x: c[0], y: c[1], z: c[2], ry: Math.atan2(-o[2], o[0]) + Math.PI / 2 }, { vary: 0.02 }, 6, 16);
  }
  flush(g, solid);
});

// the koi pond: water over the gap, ripples, lily pads (the net) and koi
registerPieceSkin(4, 'jump', 0, ({ track: t, piece: pc, solid, glow }: PieceSkinCtx) => {
  if (pc.gap <= 0) return;
  const gl = span(t, pc.i0, pc.i1);
  const y = Math.min(pc.lipY, pc.landY) - 0.012;
  for (let k = 0; k < gl; k += 2) {
    const i = wrap(t, pc.i0 + k);
    const j = wrap(t, pc.i0 + Math.min(gl, k + 2));
    const wi = Math.max(t.wallL[i], t.wallR[i]) + 0.3;
    const wj = Math.max(t.wallL[j], t.wallR[j]) + 0.3;
    const a = pt(t, i, -wi);
    const b = pt(t, i, wi);
    const c = pt(t, j, wj);
    const d = pt(t, j, -wj);
    glow.quad([a[0], y, a[2]], [b[0], y, b[2]], [c[0], y, c[2]], [d[0], y, d[2]], Math.floor(k / 6) % 2 ? 0x15607a : 0x1a6f8a);
  }
  const mid = wrap(t, pc.i0 + (gl >> 1));
  const W = Math.max(t.wallL[mid], t.wallR[mid]);
  // ripples
  for (let r = 0; r < 5; r++) {
    const c = pt(t, mid, (hash01(r * 5 + 2) - 0.5) * W * 1.4);
    const cc: V = [c[0] + t.tx[mid] * (hash01(r * 9) - 0.5) * pc.gap * 0.7, y + 0.004, c[2] + t.tz[mid] * (hash01(r * 9) - 0.5) * pc.gap * 0.7];
    const R = 0.9 + hash01(r) * 0.8;
    for (let q = 0; q < 16; q++) {
      const a0 = (q / 16) * Math.PI * 2;
      const a1 = ((q + 1) / 16) * Math.PI * 2;
      glow.quad([cc[0] + Math.cos(a0) * R, cc[1], cc[2] + Math.sin(a0) * R], [cc[0] + Math.cos(a1) * R, cc[1], cc[2] + Math.sin(a1) * R], [cc[0] + Math.cos(a1) * (R + 0.12), cc[1], cc[2] + Math.sin(a1) * (R + 0.12)], [cc[0] + Math.cos(a0) * (R + 0.12), cc[1], cc[2] + Math.sin(a0) * (R + 0.12)], 0x7fe8ff);
    }
  }
  // lily pads and koi
  for (let p = 0; p < 9; p++) {
    const i = wrap(t, pc.i0 + Math.round(hash01(p * 13 + 4) * gl));
    const c = pt(t, i, (hash01(p * 7 + 1) - 0.5) * 2 * (W - 0.4));
    flatDisc(solid, [c[0], y + 0.01, c[2]], 0.7 + hash01(p) * 0.5, p % 3 ? 0x3f9a5a : 0x58b870, 9);
    if (p % 3 === 0) flatDisc(glow, [c[0] + 0.3, y + 0.02, c[2]], 0.18, 0xff8fb1, 6);
  }
  for (let f = 0; f < 6; f++) {
    const i = wrap(t, pc.i0 + Math.round(hash01(f * 17 + 9) * gl));
    const c = pt(t, i, (hash01(f * 5 + 3) - 0.5) * 2 * (W - 0.8));
    const a = hash01(f * 31) * Math.PI * 2;
    disc(glow, [c[0], y + 0.008, c[2]], [Math.cos(a), 0, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], 0.55, 0.2, f % 2 ? 0xff8a3d : 0xfff3dc, 8);
    disc(glow, [c[0] - Math.cos(a) * 0.6, y + 0.009, c[2] - Math.sin(a) * 0.6], [Math.cos(a), 0, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], 0.2, 0.22, f % 2 ? 0xff8a3d : 0xfff3dc, 6);
  }
  // stone rims along both sides of the pond
  const g = new GeoBuilder();
  for (let k = 0; k <= gl; k += ms(t, 1.6)) {
    const i = wrap(t, pc.i0 + k);
    for (const s of [-1, 1]) {
      const p = pt(t, i, s * (Math.max(t.wallL[i], t.wallR[i]) + 0.9));
      g.ico(0.55 + hash01(k + s) * 0.3, 0x8a8a9a, { x: p[0], y: y + 0.1, z: p[2], sy: 0.55, ry: k }, { vary: 0.08 }, 0);
    }
  }
  flush(g, solid);
});

// the mug-handle loop: a giant mug beside the loop (the ribbon is its handle), a pink band, coffee and steam
registerPieceSkin(4, 'loop', 0, ({ track: t, piece: pc, solid, glow }: PieceSkinCtx) => {
  const { R, c, lead } = LOOP_SHAPE;
  const ic = wrap(t, pc.i0 + Math.round((lead + c * Math.PI) / t.step));
  const Rm = 6.2;
  const off = 12 + Rm;
  // the side with room for it
  let best: { x: number; z: number; gap: number } | null = null;
  for (const s of [-1, 1]) {
    const p = pt(t, ic, s * off);
    const gap = roadGap(t, p[0], p[2], wrap(t, pc.strip - ms(t, 30)), wrap(t, pc.end + ms(t, 30)));
    if (!best || gap > best.gap) best = { x: p[0], z: p[2], gap };
  }
  if (!best || best.gap < Rm + 1) return;
  const g = new GeoBuilder();
  const y0 = t.py[ic] - 0.6;
  const H = 2 * R + 2;
  g.cylUp(Rm, Rm * 0.92, H, 22, 0xfff3dc, { x: best.x, y: y0, z: best.z }, { vary: 0.015 });
  g.cylUp(Rm + 0.08, Rm * 0.99, 1.3, 22, 0xff8fb1, { x: best.x, y: y0 + H * 0.62, z: best.z }, { vary: 0 });
  g.cylUp(Rm - 0.45, Rm - 0.45, H + 0.02, 22, 0x5a3520, { x: best.x, y: y0 + 0.01, z: best.z }, { vary: 0 });
  flush(g, solid);
  // latte heart and steam
  flatDisc(solid, [best.x - 0.7, y0 + H + 0.04, best.z], 1.3, 0xf2dcc0, 10);
  flatDisc(solid, [best.x + 0.7, y0 + H + 0.04, best.z], 1.3, 0xf2dcc0, 10);
  const tb = solid;
  tb.tri(best.x - 1.95, y0 + H + 0.04, best.z + 0.35, best.x + 1.95, y0 + H + 0.04, best.z + 0.35, best.x, y0 + H + 0.04, best.z + 2.4, 0xf2dcc0);
  const ring = 28;
  for (let q = 0; q < ring; q++) {
    const a0 = (q / ring) * Math.PI * 2;
    const a1 = ((q + 1) / ring) * Math.PI * 2;
    const r0 = Rm + 0.02;
    glow.quad([best.x + Math.cos(a0) * r0, y0 + H + 0.02, best.z + Math.sin(a0) * r0], [best.x + Math.cos(a1) * r0, y0 + H + 0.02, best.z + Math.sin(a1) * r0], [best.x + Math.cos(a1) * r0, y0 + H - 0.3, best.z + Math.sin(a1) * r0], [best.x + Math.cos(a0) * r0, y0 + H - 0.3, best.z + Math.sin(a0) * r0], 0xffe14d);
  }
  for (let w = 0; w < 4; w++) {
    const x = best.x + (w - 1.5) * 1.6;
    const z = best.z + Math.sin(w * 2.1) * 1.2;
    for (let h = 0; h < 3; h++) {
      const yy = y0 + H + 1 + h * 1.4 + w * 0.3;
      const sx = Math.sin(h * 1.8 + w) * 0.5;
      glow.quad([x + sx - 0.3, yy, z], [x + sx + 0.3, yy, z], [x - sx + 0.2, yy + 1.1, z], [x - sx - 0.2, yy + 1.1, z], 0xfff3dc);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Pink Paw Shelter Sprint (theme 5)
// ---------------------------------------------------------------------------------------------

const SOFT = [0xff8fb1, 0xffc93c, 0x9fd3ff, 0xbfe8c8, 0xc9b6ff];

// the cat exercise wheel round the loop: two rims, spokes, rungs over the top half, a stand on each side
registerPieceSkin(5, 'loop', 0, ({ track: t, piece: pc, solid }: PieceSkinCtx) => {
  const { R, c, lead } = LOOP_SHAPE;
  const ic = wrap(t, pc.i0 + Math.round((lead + c * Math.PI) / t.step));
  const Rw = R + 2.6;
  const side = STUNT.loop.sway + 3.6 + 1.4;
  const T: V = [t.tx[ic], 0, t.tz[ic]];
  const L: V = [-t.tz[ic], 0, t.tx[ic]];
  const cy = t.py[ic] + R;
  const g = new GeoBuilder();
  const at = (s: number, phi: number, extra = 0): V => {
    const base = pt(t, ic, s * (side + extra));
    return [base[0] + T[0] * Math.cos(phi) * Rw, cy + Math.sin(phi) * Rw, base[2] + T[2] * Math.cos(phi) * Rw];
  };
  const seg = 28;
  for (const s of [-1, 1]) {
    // the rim, a tube round the circle (the part under the floor is hidden by it)
    for (let q = 0; q < seg; q++) {
      const a0 = (q / seg) * Math.PI * 2;
      const a1 = ((q + 1) / seg) * Math.PI * 2;
      if (Math.sin(a0) * Rw + R < -1 && Math.sin(a1) * Rw + R < -1) continue;
      rod(g, at(s, a0), at(s, a1), 0.42, q % 2 ? 0xff8fb1 : 0xff6f9a, 6);
    }
    // the hub and spokes
    const hub = pt(t, ic, s * side, R);
    g.sphere(0.9, 0xffc93c, { x: hub[0], y: hub[1], z: hub[2] }, { vary: 0 }, 10, 8);
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2 + Math.PI / 8;
      if (Math.sin(a) * Rw + R < 0.5) continue;
      rod(g, hub, at(s, a), 0.16, 0xfff4f8, 5);
    }
    // the stand: two legs from the hub to the floor, a foot bar
    const f0 = pt(t, ic, s * (side + 1.2), 0);
    for (const e of [-1, 1]) {
      const foot: V = [f0[0] + T[0] * e * 5.5, f0[1] - 0.1, f0[2] + T[2] * e * 5.5];
      rod(g, [hub[0] + L[0] * s * 0.6, hub[1], hub[2] + L[2] * s * 0.6], foot, 0.3, 0xc9b6ff, 6);
    }
    rod(g, [f0[0] - T[0] * 5.5, f0[1], f0[2] - T[2] * 5.5], [f0[0] + T[0] * 5.5, f0[1], f0[2] + T[2] * 5.5], 0.35, 0xc9b6ff, 6);
  }
  // rungs across the top half (the treadmill slats), well above the ribbon
  for (let q = 1; q < 12; q++) {
    const a = (q / 12) * Math.PI;
    rod(g, at(-1, a), at(1, a), 0.2, SOFT[q % SOFT.length], 6);
  }
  flush(g, solid);
});

// the cat flap: a little house round the tunnel, the flap swung up over the door (a paw print on it)
registerPieceSkin(5, 'tunnel', 0, ({ track: t, piece: pc, solid, glow }: PieceSkinCtx) => {
  const g = new GeoBuilder();
  const H = STUNT.tunnel.ceiling;
  tunnelShell(g, t, pc, { thick: 1.8, roof: 0.8, layers: 2, colors: [0xfff4f8, 0xffe4ee], roofColor: 0xff8fb1 });
  const len = span(t, pc.i0, pc.i1);
  // a pitched roof along the house
  const st = ms(t, 4);
  for (let k = 0; k < len; k += st) {
    const i = wrap(t, pc.i0 + Math.min(len, k + (st >> 1)));
    const W = archW(t, i) + 1.8;
    const base = H + 0.75 + Math.abs(t.bank[i]) * archW(t, i);
    const seg = Math.min(st, len - k) * t.step + 0.3;
    // two slabs leaning on the ridge
    for (const s of [-1, 1]) {
      const c = pt(t, i, s * W * 0.5, base + 1.5);
      g.box(W * 1.16, 0.45, seg, k % (2 * st) ? 0xff8fb1 : 0xff6f9a, { x: c[0], y: c[1], z: c[2], ry: yaw(t, i), rz: s * -0.55 }, { vary: 0.02 });
    }
  }
  // the door frame at the entrance and the flap above it
  const i0 = wrap(t, pc.i0);
  const W = archW(t, i0);
  const T: V = [t.tx[i0], 0, t.tz[i0]];
  const Lv: V = [-t.tz[i0], 0, t.tx[i0]];
  const doorTop = pt(t, i0, 0, H + 0.1);
  g.box(2 * W + 3.6, 1.2, 0.8, 0xffc93c, { x: doorTop[0] - T[0] * 0.5, y: doorTop[1] + 0.4, z: doorTop[2] - T[2] * 0.5, ry: yaw(t, i0) }, { vary: 0 });
  const a = (72 * Math.PI) / 180;
  const h = H - 0.9;
  const hinge: V = [doorTop[0] - T[0] * 0.9, doorTop[1] - 0.1, doorTop[2] - T[2] * 0.9];
  // the flap's long axis (hinge → free edge), swung up and out toward the approach
  const D: V = [-T[0] * Math.sin(a), -Math.cos(a), -T[2] * Math.sin(a)];
  const centre: V = [hinge[0] + D[0] * (h / 2), hinge[1] + D[1] * (h / 2), hinge[2] + D[2] * (h / 2)];
  const X = new Vector3(Lv[0], Lv[1], Lv[2]);
  const Y = new Vector3(-D[0], -D[1], -D[2]);
  const Z = new Vector3().crossVectors(X, Y);
  const mtx = new Matrix4().makeBasis(X, Y, Z).setPosition(centre[0], centre[1], centre[2]);
  g.add(new BoxGeometry(2 * W - 0.6, h, 0.3), 0xffd6e4, mtx, { vary: 0 });
  flush(g, solid);
  // the paw print on the flap's underside (facing the karts coming in)
  const N: V = Z.y > 0 ? [-Z.x, -Z.y, -Z.z] : [Z.x, Z.y, Z.z];
  const pc0: V = [centre[0] + N[0] * 0.17, centre[1] + N[1] * 0.17, centre[2] + N[2] * 0.17];
  const yv: V = [D[0], D[1], D[2]];
  disc(glow, [pc0[0] + yv[0] * 0.4, pc0[1] + yv[1] * 0.4, pc0[2] + yv[2] * 0.4], Lv, yv, 1.1, 0.9, 0xff3ea5, 12);
  for (const [dx, dy] of [
    [-1.3, -0.9],
    [-0.45, -1.55],
    [0.45, -1.55],
    [1.3, -0.9],
  ]) {
    disc(glow, [pc0[0] + Lv[0] * dx + yv[0] * dy, pc0[1] + Lv[1] * dx + yv[1] * dy, pc0[2] + Lv[2] * dx + yv[2] * dy], Lv, yv, 0.38, 0.45, 0xff3ea5, 10);
  }
});

// the carpet scratch wall: a sisal rope along the top, scratching posts with pom-poms behind it, carpet on the outside
registerPieceSkin(5, 'wall', 0, ({ track: t, piece: pc, solid, groundY }: PieceSkinCtx) => {
  const g = new GeoBuilder();
  let prev: V | null = null;
  laneWalk(t, pc, 2, (i, s, top, k) => {
    const rope = curlTop(t, i, s, 0.25, 0.3);
    if (rope && prev) rod(g, prev, rope, 0.28, k % 4 ? SISAL : SISAL_D, 6);
    prev = rope;
    const o = outward(t, i, s);
    if (k % ms(t, 4) === 0) {
      const h = top[1] - groundY;
      g.boxUp(0.9, h, 4.2, k % ms(t, 8) ? 0xc9b6ff : 0xb8a2f0, { x: top[0] + o[0] * 0.9, y: groundY, z: top[2] + o[2] * 0.9, ry: yaw(t, i) }, { vary: 0.05 });
    }
    if (k % ms(t, 8) === 0) {
      const p: V = [top[0] + o[0] * 3, groundY, top[2] + o[2] * 3];
      const ph = top[1] - groundY + 2.2;
      g.boxUp(2.4, 0.4, 2.4, SISAL_D, { x: p[0], y: groundY, z: p[2], ry: yaw(t, i) }, { vary: 0 });
      g.cylUp(0.55, 0.55, ph, 8, SISAL, { x: p[0], y: groundY, z: p[2] }, { vary: 0.02 });
      for (let r = 0; r < Math.floor(ph / 0.9); r++) g.torus(0.58, 0.08, SISAL_D, { x: p[0], y: groundY + 0.5 + r * 0.9, z: p[2], rx: Math.PI / 2 }, { vary: 0 }, 4, 8);
      rod(g, [p[0], groundY + ph, p[2]], [p[0] - o[0] * 1.1, groundY + ph - 1.2, p[2] - o[2] * 1.1], 0.05, 0xfff3dc, 4);
      g.sphere(0.5, SOFT[(k >> 2) % SOFT.length], { x: p[0] - o[0] * 1.1, y: groundY + ph - 1.6, z: p[2] - o[2] * 1.1 }, { vary: 0 }, 8, 6);
    }
  });
  flush(g, solid);
});

// the cushion hop: a blanket over the gap (the net), bolsters along both lips, sleeping baskets beside the landing
registerPieceSkin(5, 'jump', 0, ({ track: t, piece: pc, solid }: PieceSkinCtx) => {
  if (pc.gap <= 0) return;
  const gl = span(t, pc.i0, pc.i1);
  const y = Math.min(pc.lipY, pc.landY) - 0.012;
  // the blanket: a pink and cream check
  for (let k = 0; k < gl; k += 2) {
    const i = wrap(t, pc.i0 + k);
    const j = wrap(t, pc.i0 + Math.min(gl, k + 2));
    const wi = Math.max(t.wallL[i], t.wallR[i]) + 0.3;
    const wj = Math.max(t.wallL[j], t.wallR[j]) + 0.3;
    const cells = 6;
    for (let q = 0; q < cells; q++) {
      const u0 = -1 + (2 * q) / cells;
      const u1 = -1 + (2 * (q + 1)) / cells;
      const a = pt(t, i, u0 * wi);
      const b = pt(t, i, u1 * wi);
      const c = pt(t, j, u1 * wj);
      const d = pt(t, j, u0 * wj);
      const col = (Math.floor(k / 4) + q) % 2 ? 0xff8fb1 : 0xffe4ee;
      solid.quad([b[0], y, b[2]], [a[0], y, a[2]], [d[0], y, d[2]], [c[0], y, c[2]], col);
    }
  }
  const g = new GeoBuilder();
  // bolsters just inside both lips (their tops level with the deck), with round end cushions outside the rails
  for (const [i, dir] of [
    [wrap(t, pc.i0), 1],
    [wrap(t, pc.i1), -1],
  ] as const) {
    const w = Math.max(t.wallL[i], t.wallR[i]) + 0.2;
    const a = pt(t, i, -w, -0.5);
    const b = pt(t, i, w, -0.5);
    const sh: V = [t.tx[i] * dir * 0.5, 0, t.tz[i] * dir * 0.5];
    rod(g, [a[0] + sh[0], a[1], a[2] + sh[2]], [b[0] + sh[0], b[1], b[2] + sh[2]], 0.48, dir > 0 ? 0xc9b6ff : 0x9fd3ff, 10);
    for (const s of [-1, 1]) {
      const p = pt(t, i, s * (w + 1.4), 0);
      g.cylUp(1.3, 1.3, 0.9, 12, SOFT[(s + 2 + dir) % SOFT.length], { x: p[0], y: p[1] - 0.05, z: p[2] }, { vary: 0.02 });
      g.sphere(0.25, 0xffffff, { x: p[0], y: p[1] + 0.9, z: p[2] }, { vary: 0 }, 6, 4);
    }
  }
  // sleeping baskets beside the landing window (where there is room)
  const span1 = span(t, pc.land0, pc.land1);
  for (const [f, s] of [
    [0.3, -1],
    [0.75, 1],
  ] as const) {
    const i = wrap(t, pc.land0 + Math.round(span1 * f));
    const off = Math.max(t.wallL[i], t.wallR[i]) + 5.5;
    const p = pt(t, i, s * off);
    if (roadGap(t, p[0], p[2], wrap(t, pc.i0 - ms(t, 20)), wrap(t, pc.land1 + ms(t, 20))) < 3) continue;
    g.cylUp(2.1, 1.7, 1.1, 14, 0xc9a06a, { x: p[0], y: p[1] - 0.05, z: p[2] }, { vary: 0.05 });
    g.torus(2.05, 0.32, 0xb8935f, { x: p[0], y: p[1] + 1.05, z: p[2], rx: Math.PI / 2 }, { vary: 0 }, 5, 16);
    g.cylUp(1.8, 1.8, 1.0, 14, 0xfff3dc, { x: p[0], y: p[1], z: p[2] }, { vary: 0 });
    // a curled-up sleeping cat
    g.sphere(1.1, s > 0 ? 0xff8a3d : 0x6b6b7a, { x: p[0], y: p[1] + 1.3, z: p[2], sy: 0.55, sx: 1.2 }, { vary: 0.03 }, 10, 7);
    g.sphere(0.55, s > 0 ? 0xff8a3d : 0x6b6b7a, { x: p[0] + 0.9, y: p[1] + 1.55, z: p[2] + 0.3 }, { vary: 0.03 }, 8, 6);
    g.torus(0.9, 0.18, s > 0 ? 0xe07a2d : 0x5a5a6a, { x: p[0], y: p[1] + 1.3, z: p[2], rx: Math.PI / 2 }, { vary: 0 }, 4, 12);
  }
  flush(g, solid);
});

// ---------------------------------------------------------------------------------------------
// Living Room Rug (theme 6)
// ---------------------------------------------------------------------------------------------

// the sofa-cushion kicker: a tufted cushion cover over the aimed ramp, piping on its edges
registerPieceSkin(6, 'jump', 0, ({ track: t, piece: pc, solid }: PieceSkinCtx) => {
  if (pc.gap > 0) return;
  const r = t.ramps.find((x) => x.piece === pc.id);
  if (!r) return;
  const top = (i: number, d: number, lift: number): V => {
    const k = wrap(t, i);
    return [t.px[k] - t.tz[k] * d, t.py[k] + d * t.bank[k] + rampHeight(t, k, 0, d) + lift, t.pz[k] + t.tx[k] * d];
  };
  const hw = r.halfW - 0.5;
  const cells = 5;
  for (let k = 0; k < r.len; k += 2) {
    const i = r.i - r.len + k;
    const j = Math.min(r.i, i + 2);
    for (let q = 0; q < cells; q++) {
      const d0 = r.d - hw + (2 * hw * q) / cells;
      const d1 = r.d - hw + (2 * hw * (q + 1)) / cells;
      solid.quad(top(i, d1, 0.04), top(i, d0, 0.04), top(j, d0, 0.04), top(j, d1, 0.04), (q + (k >> 2)) % 2 ? 0xc96a8a : 0xd97a9a);
    }
  }
  // tufting buttons and piping along the lip
  const g = new GeoBuilder();
  for (let k = 3; k < r.len - 1; k += 5)
    for (let q = 1; q < cells; q++) {
      const p = top(r.i - r.len + k, r.d - hw + (2 * hw * q) / cells, 0.06);
      g.sphere(0.16, 0x7a2f4a, { x: p[0], y: p[1], z: p[2], sy: 0.5 }, { vary: 0 }, 6, 4);
    }
  rod(g, top(r.i, r.d - hw, 0.1), top(r.i, r.d + hw, 0.1), 0.14, 0xffc93c, 6);
  flush(g, solid);
});
