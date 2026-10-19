/**
 * Track meshes from a BuiltTrack (GDD 6.2 "Mesh"): the road ribbon with banding and a dashed centre line, the
 * checkered start, curbs, shoulders, walls (with neon tops on night themes), skirts down to the ground, boost pads,
 * ramps and low-grip patches. Render-only (Math.sin is fine here). Everything is merged per material: ~5 draw calls.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { BuiltBranch, BuiltTrack } from './build';
import { VOID_EDGE, rampHeight } from './query';
import { PHYS } from '../../tuning';
import { Surface } from '../../types';
import type { Theme } from './themes';
import { toonMaterial } from '../render/toon';

const _c = new Color();

/** Collects flat-coloured triangles. */
export class TriBuilder {
  pos: number[] = [];
  col: number[] = [];
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, color: number): void {
    _c.setHex(color);
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) this.col.push(_c.r, _c.g, _c.b);
  }
  /** quad a-b-c-d (counter-clockwise seen from the front) */
  quad(a: V, b: V, c: V, d: V, color: number): void {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], color);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], color);
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  get empty(): boolean {
    return this.pos.length === 0;
  }
}

export type V = [number, number, number];

export interface TrackMeshOptions {
  /** skirts go down to this height (ground level of the theme) */
  groundY: number;
}

/** A point at sample i (fractional `f` toward i+1 is not needed: we walk whole samples), lateral d, lifted by `lift`. */
function P(t: BuiltTrack, i: number, d: number, lift = 0): V {
  const j = ((i % t.n) + t.n) % t.n;
  const ramp = rampHeight(t, j, 0, d);
  return [t.px[j] - t.tz[j] * d, t.py[j] + d * t.bank[j] + lift + ramp, t.pz[j] + t.tx[j] * d];
}

/**
 * The barrier's road-side face at sample i on side `s` (−1 left, +1 right): exactly the sim's wall line (B10: the
 * barrier, the kerb and the collision wall used to disagree by up to 1.5 m).
 */
export function barrierPoint(t: BuiltTrack, i: number, s: -1 | 1): V {
  const j = ((i % t.n) + t.n) % t.n;
  return P(t, j, s * (s > 0 ? t.wallR[j] : t.wallL[j]), 0);
}

export function buildTrackMesh(t: BuiltTrack, theme: Theme, opt: TrackMeshOptions): Group {
  const group = new Group();
  group.name = 'track';
  const solid = new TriBuilder();
  const glow = new TriBuilder();
  if (t.arena) buildArena(t, theme, solid, opt);
  else buildMain(t, theme, solid, glow, opt);
  for (const b of t.branches) buildBranchMesh(b, theme, solid, glow, opt);

  // boost pads: three glowing chevrons
  for (const p of t.pads) {
    const len = Math.round((p.halfLen * 2) / t.step);
    const start = p.i - Math.round(p.halfLen / t.step);
    chevrons(glow, (i, d, lift) => P(t, i, d, lift), start, len, p.d, p.halfW, theme.pad);
    solid.quad(P(t, start, p.d + p.halfW, 0.03), P(t, start, p.d - p.halfW, 0.03), P(t, start + len, p.d - p.halfW, 0.03), P(t, start + len, p.d + p.halfW, 0.03), 0x2a1a22);
  }

  // ramps: the run-up surface is already lifted by rampHeight(); add a stripe and the front face
  for (const r of t.ramps) {
    for (let k = 0; k < r.len; k += 2) {
      const i = r.i - r.len + k;
      solid.quad(P(t, i, r.d + r.halfW, 0.02), P(t, i, r.d - r.halfW, 0.02), P(t, i + 2, r.d - r.halfW, 0.02), P(t, i + 2, r.d + r.halfW, 0.02), k % 4 === 0 ? theme.accent : 0xfff3dc);
    }
    const a = P(t, r.i, r.d - r.halfW, 0.02);
    const b = P(t, r.i, r.d + r.halfW, 0.02);
    const base = (v: V): V => [v[0], v[1] - r.height - 0.02, v[2]];
    solid.quad(a, b, base(b), base(a), theme.skirt);
    if (t.arena) {
      // on the arena floor the ramp is a wedge: close its sides
      for (const s of [-1, 1]) {
        const d = r.d + s * r.halfW;
        for (let k = 0; k < r.len; k += 2) {
          const i = r.i - r.len + k;
          const top0 = P(t, i, d, 0.02);
          const top1 = P(t, i + 2, d, 0.02);
          const i0 = (((i % t.n) + t.n) % t.n);
          const i1 = ((((i + 2) % t.n) + t.n) % t.n);
          quadSide(solid, s, [top0[0], t.py[i0], top0[2]], top0, top1, [top1[0], t.py[i1], top1[2]], theme.skirt);
        }
      }
    }
  }

  // low-grip patches (puddles)
  const stride = 2;
  for (let i = 0; i < t.n; i += stride) {
    if (!t.lowgrip[i]) continue;
    const j = i + stride;
    const wob = (k: number) => 0.7 + 0.25 * Math.sin(k * 0.21);
    glow.quad(P(t, i, t.halfW[i] * wob(i), 0.035), P(t, i, -t.halfW[i] * wob(i + 40), 0.035), P(t, j, -t.halfW[j % t.n] * wob(j + 40), 0.035), P(t, j, t.halfW[j % t.n] * wob(j), 0.035), theme.lowgrip);
  }

  const solidMesh = new Mesh(solid.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  solidMesh.name = 'track-solid';
  solidMesh.receiveShadow = true;
  group.add(solidMesh);
  if (!glow.empty) {
    const glowMesh = new Mesh(glow.build(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
    glowMesh.name = 'track-glow';
    group.add(glowMesh);
  }
  return group;
}

/** Three chevrons pointing along the road, over `len` samples from `start`, centred on lateral `d`. */
function chevrons(glow: TriBuilder, at: (i: number, d: number, lift: number) => V, start: number, len: number, d: number, halfW: number, color: number): void {
  for (let c = 0; c < 3; c++) {
    const a = start + Math.round((c * len) / 3);
    const tip = a + Math.round(len / 5);
    const hw = halfW * 0.9;
    const back = at(a, d, 0.04);
    const tipP = at(tip, d, 0.04);
    glow.tri(...at(a, d - hw, 0.04), ...tipP, ...back, color);
    glow.tri(...back, ...tipP, ...at(a, d + hw, 0.04), color);
    glow.tri(...at(a - 2, d - hw, 0.04), ...at(tip - 2, d, 0.04), ...at(a, d - hw, 0.04), color);
    glow.tri(...at(a, d + hw, 0.04), ...at(tip - 2, d, 0.04), ...at(a - 2, d + hw, 0.04), color);
  }
}

/** A six-sided post (where a barrier stops at a junction). */
function post(b: TriBuilder, base: V, r: number, h: number, color: number): void {
  const k = 6;
  for (let i = 0; i < k; i++) {
    const a0 = (i / k) * Math.PI * 2;
    const a1 = ((i + 1) / k) * Math.PI * 2;
    const p0: V = [base[0] + Math.cos(a0) * r, base[1], base[2] + Math.sin(a0) * r];
    const p1: V = [base[0] + Math.cos(a1) * r, base[1], base[2] + Math.sin(a1) * r];
    const q0: V = [p0[0], base[1] + h, p0[2]];
    const q1: V = [p1[0], base[1] + h, p1[2]];
    b.quad(p0, p1, q1, q0, color);
    b.tri(base[0], base[1] + h, base[2], ...q1, ...q0, color);
  }
}

/** The main loop: road, dashes, edge lines, kerbs, verges, barriers and skirts (none of them where a branch joins). */
function buildMain(t: BuiltTrack, theme: Theme, solid: TriBuilder, glow: TriBuilder, opt: TrackMeshOptions): void {
  const stride = 2; // samples per segment (~1 m)
  // the kerb band is drivable (Surface.Curb) all the way to the barrier (PHYS.curbWidth = PHYS.wallMargin)
  const curbW = PHYS.curbWidth;
  const metres = (i: number) => i * t.step;
  const n = t.n;
  const jn = (i: number, s: number): boolean => (t.junction[((i % n) + n) % n] & (s > 0 ? 2 : 1)) !== 0;

  for (let i = 0; i < n; i += stride) {
    const j = i + stride;
    const hwi = t.halfW[i % n];
    const hwj = t.halfW[j % n];
    const band = Math.floor(metres(i) / 8) % 2 === 0;
    const open = t.voidMask[i % n] || t.voidMask[j % n];
    // road
    solid.quad(P(t, i, hwi), P(t, i, -hwi), P(t, j, -hwj), P(t, j, hwj), band ? theme.road : theme.roadB);
    // centre dashes (3 m on, 3 m off)
    if (Math.floor(metres(i) / 3) % 2 === 0) solid.quad(P(t, i, 0.18, 0.02), P(t, i, -0.18, 0.02), P(t, j, -0.18, 0.02), P(t, j, 0.18, 0.02), theme.line);
    const curbCol = Math.floor(metres(i) / 2) % 2 === 0 ? theme.curbA : theme.curbB;
    for (const s of [-1, 1] as const) {
      // a branch joins on this side: the road opens into it (no edge line, kerb, verge or barrier)
      if (jn(i, s) || jn(j, s)) {
        // a post where the barrier stops, and where it starts again
        if (!jn(i - stride, s) && jn(i, s)) post(solid, barrierPoint(t, i - stride, s), 0.45, 1.3, theme.wallA);
        if (!jn(j + stride, s) && jn(j, s)) post(solid, barrierPoint(t, j + stride, s), 0.45, 1.3, theme.wallA);
        continue;
      }
      // edge line
      const a = s * (hwi - 0.35);
      const b = s * (hwj - 0.35);
      const w = 0.16 * s;
      solid.quad(P(t, i, a + w, 0.02), P(t, i, a - w, 0.02), P(t, j, b - w, 0.02), P(t, j, b + w, 0.02), theme.line);
      if (open) {
        // an open bridge: a thin kerb at the deck's edge, the deck's side, no barrier
        const e0 = s * (hwi + VOID_EDGE);
        const e1 = s * (hwj + VOID_EDGE);
        quadSide(solid, s, P(t, i, s * hwi, 0.06), P(t, i, e0, 0.06), P(t, j, e1, 0.06), P(t, j, s * hwj, 0.06), curbCol);
        const top0 = P(t, i, e0, 0.06);
        const top1 = P(t, j, e1, 0.06);
        solid.quad(top0, top1, [top1[0], top1[1] - 1.1, top1[2]], [top0[0], top0[1] - 1.1, top0[2]], theme.skirt);
        continue;
      }
      const wi = s > 0 ? t.wallR[i % n] : t.wallL[i % n];
      const wj = s > 0 ? t.wallR[j % n] : t.wallL[j % n];
      // curb (slightly raised), never past the barrier
      const c0i = s * hwi;
      const c1i = s * Math.min(wi, hwi + curbW);
      const c0j = s * hwj;
      const c1j = s * Math.min(wj, hwj + curbW);
      quadSide(solid, s, P(t, i, c0i, 0.06), P(t, i, c1i, 0.06), P(t, j, c1j, 0.06), P(t, j, c0j, 0.06), curbCol);
      // shoulder out to the wall (off-road zones only: elsewhere the kerb reaches the barrier)
      if (Math.abs(c1i) < wi - 0.05 || Math.abs(c1j) < wj - 0.05) quadSide(solid, s, P(t, i, c1i, 0.01), P(t, i, s * wi, 0.01), P(t, j, s * wj, 0.01), P(t, j, c1j, 0.01), theme.shoulder);
      barrier(solid, glow, theme, barrierPoint(t, i, s), barrierPoint(t, j, s), P(t, i, s * (wi + 0.5), 0.8), P(t, j, s * (wj + 0.5), 0.8), P(t, i, s * (wi + 0.05), 0.82), P(t, j, s * (wj + 0.05), 0.82), P(t, i, s * (wi + 0.45), 0.82), P(t, j, s * (wj + 0.45), 0.82), s, metres(i), opt.groundY);
    }
  }

  // start line: checkered, 2 rows of 1 m squares
  const hw = t.halfW[0];
  const cells = Math.round(hw * 2);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < cells; c++) {
      const d0 = -hw + (c * 2 * hw) / cells;
      const d1 = -hw + ((c + 1) * 2 * hw) / cells;
      const i0 = r * 2;
      const i1 = i0 + 2;
      solid.quad(P(t, i0, d1, 0.03), P(t, i0, d0, 0.03), P(t, i1, d0, 0.03), P(t, i1, d1, 0.03), (r + c) % 2 ? 0x222222 : 0xffffff);
    }
}

/** A 0.8 m cushion wall from a to b (road-side face), its top out to `oi`/`oj`, neon trim at night, a skirt below. */
function barrier(solid: TriBuilder, glow: TriBuilder, theme: Theme, wbi: V, wbj: V, oi: V, oj: V, ni: V, nj: V, ni2: V, nj2: V, s: number, m: number, groundY: number): void {
  const wallCol = Math.floor(m / 4) % 2 === 0 ? theme.wallA : theme.wallB;
  const wti: V = [wbi[0], wbi[1] + 0.8, wbi[2]];
  const wtj: V = [wbj[0], wbj[1] + 0.8, wbj[2]];
  solid.quad(wbi, wbj, wtj, wti, wallCol);
  solid.quad(wti, wtj, oj, oi, wallCol);
  if (theme.neonA) glow.quad(ni, nj, nj2, ni2, s > 0 ? theme.neonA : theme.neonB);
  const si0: V = [oi[0], groundY, oi[2]];
  const sj0: V = [oj[0], groundY, oj[2]];
  if (oi[1] - groundY > 0.05) solid.quad(oi, oj, sj0, si0, theme.skirt);
}

/** A point on branch b at sample j, lateral d, lifted by `lift` (the deck sits 2 cm over the main road). */
function PB(b: BuiltBranch, j: number, d: number, lift = 0): V {
  const k = Math.max(0, Math.min(b.m - 1, j));
  return [b.px[k] - b.tz[k] * d, b.py[k] + d * b.bank[k] + lift + 0.02, b.pz[k] + b.tx[k] * d];
}

/** One branch: its deck (road, crumbs or puddle colour), kerbs, barriers and skirts, its pads and its gap. */
function buildBranchMesh(b: BuiltBranch, theme: Theme, solid: TriBuilder, glow: TriBuilder, opt: TrackMeshOptions): void {
  const stride = 2;
  const curbW = PHYS.curbWidth;
  const off = b.surface === Surface.Offroad;
  const wet = b.surface === Surface.LowGrip;
  const gap = b.gap;
  const widened = (j: number, s: number): boolean => (s > 0 ? b.wallR[j] - b.ownR[j] : b.wallL[j] - b.ownL[j]) > 0.01;
  for (let j = 0; j < b.m - 1; j += stride) {
    const k = Math.min(b.m - 1, j + stride);
    if (gap && k > gap.j0 && j < gap.j1) continue;
    const hwj = b.halfW[j];
    const hwk = b.halfW[k];
    const m = j * b.step;
    const band = Math.floor(m / 8) % 2 === 0;
    // where it still overlaps the main road it is the main road (same surface in the sim, same colour here)
    const own = m > b.overlap && m < b.length - b.overlapEnd;
    const col = own && off ? (Math.floor(m / 3) % 2 ? theme.shoulder : crumbs(theme.shoulder)) : own && wet ? theme.lowgrip : band ? theme.road : theme.roadB;
    solid.quad(PB(b, j, hwj), PB(b, j, -hwj), PB(b, k, -hwk), PB(b, k, hwk), col);
    if (own && !off && Math.floor(m / 3) % 2 === 0) solid.quad(PB(b, j, 0.18, 0.02), PB(b, j, -0.18, 0.02), PB(b, k, -0.18, 0.02), PB(b, k, 0.18, 0.02), theme.line);
    const curbCol = Math.floor(m / 2) % 2 === 0 ? theme.curbA : theme.curbB;
    for (const s of [-1, 1] as const) {
      if (widened(j, s) || widened(k, s)) continue;
      const wj = s > 0 ? b.wallR[j] : b.wallL[j];
      const wk = s > 0 ? b.wallR[k] : b.wallL[k];
      quadSide(solid, s, PB(b, j, s * hwj, 0.06), PB(b, j, s * Math.min(wj, hwj + curbW), 0.06), PB(b, k, s * Math.min(wk, hwk + curbW), 0.06), PB(b, k, s * hwk, 0.06), curbCol);
      barrier(solid, glow, theme, PB(b, j, s * wj), PB(b, k, s * wk), PB(b, j, s * (wj + 0.5), 0.8), PB(b, k, s * (wk + 0.5), 0.8), PB(b, j, s * (wj + 0.05), 0.82), PB(b, k, s * (wk + 0.05), 0.82), PB(b, j, s * (wj + 0.45), 0.82), PB(b, k, s * (wk + 0.45), 0.82), s, m, opt.groundY);
    }
  }
  // the gap: cliff faces at both lips
  if (gap) {
    for (const [j, dir] of [
      [gap.j0, 1],
      [gap.j1, -1],
    ] as const) {
      const hw = b.halfW[j] + curbW;
      const a = PB(b, j, -hw);
      const c = PB(b, j, hw);
      const drop = 6;
      solid.quad(a, c, [c[0], c[1] - drop, c[2]], [a[0], a[1] - drop, a[2]], dir > 0 ? theme.skirt : theme.wallB);
    }
  }
  for (const p of b.pads) chevrons(glow, (j, d, lift) => PB(b, j, d, lift), p.j - p.halfLen, p.halfLen * 2, 0, p.halfW, theme.pad);
}

/** A darker crumb shade of a colour. */
function crumbs(c: number): number {
  const r = ((c >> 16) & 255) * 0.82;
  const g = ((c >> 8) & 255) * 0.78;
  const bl = (c & 255) * 0.72;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** The arena: one flat floor out to the room's edge (concentric rug bands), a low wall round it. */
function buildArena(t: BuiltTrack, theme: Theme, solid: TriBuilder, opt: TrackMeshOptions): void {
  const n = t.n;
  let cx = 0;
  let cz = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += t.px[i];
    cz += t.pz[i];
    cy += t.py[i];
  }
  cx /= n;
  cz /= n;
  cy /= n;
  // outer edge: the side whose wall is the room's edge (the other side reaches past the centre)
  const edge = (i: number): V => {
    const k = ((i % n) + n) % n;
    const s = t.wallR[k] < t.wallL[k] ? 1 : -1;
    return P(t, k, s * Math.min(t.wallL[k], t.wallR[k]), 0);
  };
  const bands = [0, 0.16, 0.34, 0.52, 0.7, 0.86, 0.94, 1];
  const cols = [theme.road, theme.roadB, theme.accent, theme.road, theme.curbB, theme.roadB, theme.curbA];
  const step = 4;
  for (let i = 0; i < n; i += step) {
    const a = edge(i);
    const b = edge(i + step);
    for (let k = 0; k < bands.length - 1; k++) {
      const f0 = bands[k];
      const f1 = bands[k + 1];
      const p = (v: V, f: number): V => [cx + (v[0] - cx) * f, cy + 0.004 * k, cz + (v[2] - cz) * f];
      if (f0 === 0) solid.tri(cx, cy, cz, ...p(b, f1), ...p(a, f1), cols[k]);
      else solid.quad(p(a, f0), p(a, f1), p(b, f1), p(b, f0), cols[k % cols.length]);
    }
    // the room's edge: a low wall
    const at: V = [a[0], a[1] + 0.9, a[2]];
    const bt: V = [b[0], b[1] + 0.9, b[2]];
    solid.quad(a, b, bt, at, Math.floor(i / 8) % 2 ? theme.wallA : theme.wallB);
    const ao: V = [cx + (a[0] - cx) * 1.03, a[1] + 0.9, cz + (a[2] - cz) * 1.03];
    const bo: V = [cx + (b[0] - cx) * 1.03, b[1] + 0.9, cz + (b[2] - cz) * 1.03];
    solid.quad(at, bt, bo, ao, theme.wallA);
    solid.quad(ao, bo, [bo[0], opt.groundY, bo[2]], [ao[0], opt.groundY, ao[2]], theme.skirt);
  }
}

/** Keeps the winding consistent on both sides of the road. */
function quadSide(b: TriBuilder, side: number, a: V, bb: V, c: V, d: V, color: number): void {
  if (side > 0) b.quad(a, bb, c, d, color);
  else b.quad(bb, a, d, c, color);
}

/**
 * Dispose everything under a group (B57: meshes only used to be freed, so Points, Lines, sprites and every texture
 * leaked on each restart): geometries, materials and every texture slot of each material.
 */
export function disposeGroup(g: Object3D): void {
  g.traverse((o) => {
    const m = o as Mesh & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean; isInstancedMesh?: boolean };
    if (!(m.isMesh || m.isPoints || m.isLine || m.isSprite)) return;
    if (!m.isSprite) m.geometry?.dispose();
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[];
    for (const x of mats) disposeMaterial(x);
    if (m.isInstancedMesh) (m as unknown as { dispose(): void }).dispose();
  });
}

/** A material and every texture it holds; shared ones (`userData.shared`, e.g. the toon ramp, the outline) stay. */
export function disposeMaterial(m: Material | null | undefined): void {
  if (!m || m.userData?.shared) return;
  const tex = (v: unknown) => {
    const t = v as Texture | undefined;
    if (t && typeof t === 'object' && t.isTexture && !t.userData?.shared) t.dispose();
  };
  for (const v of Object.values(m)) tex(v);
  const u = (m as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (u) for (const k of Object.keys(u)) tex(u[k]?.value);
  m.dispose();
}
