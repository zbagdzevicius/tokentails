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
import type { BuiltTrack } from './build';
import { rampHeight } from './query';
import { PHYS } from '../../tuning';
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
  const stride = 2; // samples per segment (~1 m)
  // the kerb band is drivable (Surface.Curb) all the way to the barrier (PHYS.curbWidth = PHYS.wallMargin)
  const curbW = PHYS.curbWidth;
  const metres = (i: number) => i * t.step;

  for (let i = 0; i < t.n; i += stride) {
    const j = i + stride;
    const hwi = t.halfW[i % t.n];
    const hwj = t.halfW[j % t.n];
    const band = Math.floor(metres(i) / 8) % 2 === 0;
    // road
    solid.quad(P(t, i, hwi), P(t, i, -hwi), P(t, j, -hwj), P(t, j, hwj), band ? theme.road : theme.roadB);
    // centre dashes (3 m on, 3 m off)
    if (Math.floor(metres(i) / 3) % 2 === 0) solid.quad(P(t, i, 0.18, 0.02), P(t, i, -0.18, 0.02), P(t, j, -0.18, 0.02), P(t, j, 0.18, 0.02), theme.line);
    // edge lines
    for (const s of [-1, 1]) {
      const a = s * (hwi - 0.35);
      const b = s * (hwj - 0.35);
      const w = 0.16 * s;
      solid.quad(P(t, i, a + w, 0.02), P(t, i, a - w, 0.02), P(t, j, b - w, 0.02), P(t, j, b + w, 0.02), theme.line);
    }
    const curbCol = Math.floor(metres(i) / 2) % 2 === 0 ? theme.curbA : theme.curbB;
    for (const s of [-1, 1] as const) {
      const wi = s > 0 ? t.wallR[i % t.n] : t.wallL[i % t.n];
      const wj = s > 0 ? t.wallR[j % t.n] : t.wallL[j % t.n];
      // curb (slightly raised), never past the barrier
      const c0i = s * hwi;
      const c1i = s * Math.min(wi, hwi + curbW);
      const c0j = s * hwj;
      const c1j = s * Math.min(wj, hwj + curbW);
      quadSide(solid, s, P(t, i, c0i, 0.06), P(t, i, c1i, 0.06), P(t, j, c1j, 0.06), P(t, j, c0j, 0.06), curbCol);
      // shoulder out to the wall (off-road zones only: elsewhere the kerb reaches the barrier)
      if (Math.abs(c1i) < wi - 0.05 || Math.abs(c1j) < wj - 0.05) quadSide(solid, s, P(t, i, c1i, 0.01), P(t, i, s * wi, 0.01), P(t, j, s * wj, 0.01), P(t, j, c1j, 0.01), theme.shoulder);
      // wall: a low cushion, 0.8 m
      const wallCol = Math.floor(metres(i) / 4) % 2 === 0 ? theme.wallA : theme.wallB;
      const wbi = barrierPoint(t, i, s);
      const wbj = barrierPoint(t, j, s);
      const wti: V = [wbi[0], wbi[1] + 0.8, wbi[2]];
      const wtj: V = [wbj[0], wbj[1] + 0.8, wbj[2]];
      solid.quad(wbi, wbj, wtj, wti, wallCol);
      // wall top
      const oi = P(t, i, s * (wi + 0.5), 0.8);
      const oj = P(t, j, s * (wj + 0.5), 0.8);
      solid.quad(wti, wtj, oj, oi, wallCol);
      // neon trim on night themes
      if (theme.neonA) {
        const nc = s > 0 ? theme.neonA : theme.neonB;
        const ni = P(t, i, s * (wi + 0.05), 0.82);
        const nj = P(t, j, s * (wj + 0.05), 0.82);
        const ni2 = P(t, i, s * (wi + 0.45), 0.82);
        const nj2 = P(t, j, s * (wj + 0.45), 0.82);
        glow.quad(ni, nj, nj2, ni2, nc);
      }
      // skirt: outer face down to the ground
      const si0: V = [oi[0], opt.groundY, oi[2]];
      const sj0: V = [oj[0], opt.groundY, oj[2]];
      if (oi[1] - opt.groundY > 0.05) solid.quad(oi, oj, sj0, si0, theme.skirt);
    }
  }

  // start line: checkered, 2 rows of 1 m squares
  {
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

  // boost pads: three glowing chevrons
  for (const p of t.pads) {
    const len = Math.round((p.halfLen * 2) / t.step);
    const start = p.i - Math.round(p.halfLen / t.step);
    for (let c = 0; c < 3; c++) {
      const a = start + Math.round((c * len) / 3);
      const tip = a + Math.round(len / 5);
      const hw = p.halfW * 0.9;
      const back = P(t, a, p.d, 0.04);
      const tipP = P(t, tip, p.d, 0.04);
      glow.tri(...P(t, a, p.d - hw, 0.04), ...tipP, ...back, theme.pad);
      glow.tri(...back, ...tipP, ...P(t, a, p.d + hw, 0.04), theme.pad);
      glow.tri(...P(t, a - 2, p.d - hw, 0.04), ...P(t, tip - 2, p.d, 0.04), ...P(t, a, p.d - hw, 0.04), theme.pad);
      glow.tri(...P(t, a, p.d + hw, 0.04), ...P(t, tip - 2, p.d, 0.04), ...P(t, a - 2, p.d + hw, 0.04), theme.pad);
    }
    // pad base
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
  }

  // low-grip patches (puddles)
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
