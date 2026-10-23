// Chunk builder (WORLD-ART). One call builds the scenery for [s0, s1):
//  - a terrain grid across the track (left side, under the path, right side) from profile.ts, split into a
//    smooth grass mesh and a faceted sandstone rock mesh (steep triangles), with chasms cut under gaps/bridges/cloud
//  - path ribbons: dirt footpath (ground), clawed rock (wall), river water (river)
//  - rope bridges (planks, posts, ropes) on `bridge` segments
//  - instanced foliage: grass tufts, flowers, bushes, trees, bamboo, boulders, reeds; valley trees and mesas far out
// Allocation is per chunk only (typed arrays are reused between chunks).
import * as THREE from 'three';
import { newFrame, type Track } from '../core/track';
import type { Quality, SegmentKind, ThemeId } from '../core/types';
import type { Kit } from './kit';
import { hash1, seeded, smoothstep, vnoise1, vnoise2 } from './noise';
import type { Palette } from './palette';
import { isChasm, LAT, NL, profileAt, profileSlope, sideProfile, type ProfileIn } from './profile';

export interface WorldCtx {
  id: ThemeId;
  track: Track;
  p: Palette;
  kit: Kit;
  quality: Quality;
  seed: number;
  water: THREE.Material;
  floorAt(s: number): number;
}

const PATH_COLS = 3; // interior columns under the path
const NC = NL * 2 + PATH_COLS;
const MAX_ROWS = 220;
const rowS = new Float64Array(MAX_ROWS);
const rowKind: SegmentKind[] = new Array(MAX_ROWS).fill('ground');
const rowPos = new Float32Array(MAX_ROWS * NC * 3);
const rowNrm = new Float32Array(MAX_ROWS * NC * 3);
const rowFloor = new Float32Array(MAX_ROWS);
/** per row: 0..1 near a gap or bridge (chasm walls darken with depth) */
const rowOpen = new Float32Array(MAX_ROWS);
const rowEdgeY = new Float32Array(MAX_ROWS * 2);
const rowDMax = new Float32Array(MAX_ROWS * 2);
/** per row and side: 1 when this is the high side of a banked wall-run (near columns are drawn as rock) */
const rowWallHi = new Uint8Array(MAX_ROWS * 2);
const rowProf = new Float32Array(MAX_ROWS * 2 * NL);
const gridGrass = new Float32Array(MAX_ROWS * NC * 3);
const gridRock = new Float32Array(MAX_ROWS * NC * 3);
const gridHi = new Uint8Array(MAX_ROWS * NC);
interface TriBuf {
  n: number;
  P: Float32Array;
  N: Float32Array;
  C: Float32Array;
  U: Float32Array;
}
const MAXV = MAX_ROWS * NC * 6;
const triBuf = (): TriBuf => ({ n: 0, P: new Float32Array(MAXV * 3), N: new Float32Array(MAXV * 3), C: new Float32Array(MAXV * 3), U: new Float32Array(MAXV * 2) });
const out = { g: triBuf(), k: triBuf() };
/** per row and side: edge point and outward flat direction (x, y, z, ox, oz) */
const rowEdge = new Float32Array(MAX_ROWS * 2 * 5);
const rowFrame: { pos: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; hw: number }[] = [];
for (let i = 0; i < MAX_ROWS; i++) rowFrame.push({ pos: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), hw: 4 });

const fr = newFrame();
const fa = newFrame();
const fb = newFrame();
const prof = new Float32Array(NL);
const pin: ProfileIn = { s: 0, side: 1, kind: 'ground', bankDeg: 0, floorRel: -25, mix: null as never, seed: 0 };
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const nA = new THREE.Vector3();
const col = new THREE.Color();
const col2 = new THREE.Color();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
const xa = new THREE.Vector3();

function heading(fwd: THREE.Vector3): number {
  return Math.atan2(fwd.x, fwd.z);
}

/** rows to build: every `step` u plus twin rows at each segment boundary (sharp chasm walls, kind changes) */
function planRows(track: Track, s0: number, s1: number, step: number): number {
  const list: number[] = [s0 - step];
  for (let s = s0; s < s1 - 0.01; s += step) list.push(s);
  list.push(s1);
  for (const g of track.segments) {
    for (const b of [g.s0]) {
      if (b <= s0 || b > s1) continue;
      for (let i = list.length - 1; i >= 1; i--) if (Math.abs(list[i] - b) < 0.45 && list[i] !== s1 && list[i] !== s0) list.splice(i, 1);
      list.push(b - 0.03);
      if (b < s1) list.push(b + 0.03);
    }
  }
  list.sort((a, b) => a - b);
  list.push(s1 + step);
  const n = Math.min(MAX_ROWS, list.length);
  for (let i = 0; i < n; i++) rowS[i] = list[i];
  return n;
}

// ------------------------------------------------------------------ instancing helper
class Scatter {
  private sets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: number[]; c: number[] | null; cast: boolean }>();
  add(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, rotY: number, sx: number, sy: number, sz: number, cast: boolean, color?: THREE.Color, tilt?: THREE.Vector3): void {
    let set = this.sets.get(key);
    if (!set) this.sets.set(key, (set = { geo, mat, m: [], c: color ? [] : null, cast }));
    if (tilt) {
      // align local +y to tilt (surface normal), then yaw
      q.setFromUnitVectors(UPV, tilt);
      const qy = new THREE.Quaternion().setFromAxisAngle(UPV, rotY);
      q.multiply(qy);
    } else q.setFromAxisAngle(UPV, rotY);
    sc.set(sx, sy, sz);
    m4.compose(pos, q, sc);
    for (let i = 0; i < 16; i++) set.m.push(m4.elements[i]);
    if (set.c) {
      const cc = color ?? col.setRGB(1, 1, 1);
      set.c.push(cc.r, cc.g, cc.b);
    }
  }
  addMatrix(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, cast: boolean): void {
    let set = this.sets.get(key);
    if (!set) this.sets.set(key, (set = { geo, mat, m: [], c: null, cast }));
    for (let i = 0; i < 16; i++) set.m.push(m.elements[i]);
  }
  build(into: THREE.Group, shadows: boolean): void {
    for (const [, set] of this.sets) {
      const n = set.m.length / 16;
      if (n === 0) continue;
      const im = new THREE.InstancedMesh(set.geo, set.mat, n);
      im.instanceMatrix.array.set(set.m);
      im.instanceMatrix.needsUpdate = true;
      if (set.c) {
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(set.c), 3);
      }
      im.castShadow = shadows && set.cast;
      im.receiveShadow = shadows;
      im.computeBoundingSphere();
      into.add(im);
    }
  }
}

// ------------------------------------------------------------------ colours
function grassColor(w: WorldCtx, x: number, y: number, z: number, d: number, edgeY: number, floorY: number, out: THREE.Color): THREE.Color {
  const p = w.p;
  const n1 = vnoise2(x / 16, z / 16, 3);
  out.setHex(p.grassA).lerp(col2.setHex(p.grassB), n1);
  const dry = smoothstep(0.62, 0.8, vnoise2(x / 45 + 7, z / 45, 5));
  out.lerp(col2.setHex(p.grassDry), dry * 0.55);
  if (y > edgeY + 7) out.lerp(col2.setHex(p.grassB), 0.35);
  if (d < 1.1) out.lerp(col2.setHex(p.verge), (1.1 - d) * 0.6);
  if (y < floorY + 3) out.lerp(col2.setHex(p.valley), smoothstep(floorY + 3, floorY, y));
  return out;
}

const BANDS = ['rockA', 'rockC', 'rockB', 'rockA', 'rockC', 'rockA', 'rockB'] as const;
function rockColor(w: WorldCtx, x: number, y: number, z: number, floorY: number, out: THREE.Color): THREE.Color {
  const p = w.p;
  const f = (y - floorY) / 2.3 + vnoise2((x + z) / 14, y / 30, 9) * 0.9;
  const i = ((Math.floor(f) % BANDS.length) + BANDS.length) % BANDS.length;
  out.setHex(p[BANDS[i]]);
  out.multiplyScalar(0.78 + 0.22 * smoothstep(floorY - 2, floorY + 14, y));
  return out;
}

/** 1 on a gap or bridge, easing to 0 over 30 u either side (side cliffs step back around chasms) */
function chasmOpen(track: WorldCtx['track'], s: number): number {
  let best = 1e9;
  const segs = track.segments;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (g.kind !== 'gap' && g.kind !== 'bridge') continue;
    const d = s < g.s0 ? g.s0 - s : s > g.s1 ? s - g.s1 : 0;
    if (d < best) best = d;
  }
  return 1 - smoothstep(4, 30, best);
}

// ------------------------------------------------------------------ the chunk
export function buildTerrainChunk(w: WorldCtx, s0: number, s1: number): THREE.Group {
  const { track, p, kit } = w;
  const low = w.quality === 'low';
  const group = new THREE.Group();
  const step = low ? 3 : 2;
  const R = planRows(track, s0, s1, step);
  pin.mix = p.mix;
  pin.seed = w.seed;

  // ---------- rows: frames, profiles, positions
  for (let r = 0; r < R; r++) {
    const s = rowS[r];
    track.sample(s, fr);
    const f = rowFrame[r];
    f.pos.copy(fr.pos);
    f.fwd.copy(fr.fwd);
    f.right.copy(fr.right);
    f.up.copy(fr.up);
    f.hw = fr.width / 2;
    const kind = track.kindAt(s);
    rowKind[r] = kind;
    const floorY = w.floorAt(s);
    rowFloor[r] = floorY;
    // curvature: the inner side of tight bends is clamped so terrain never folds over the path
    track.sample(s - 10, fa);
    track.sample(s + 10, fb);
    let dh = heading(fb.fwd) - heading(fa.fwd);
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    const kappa = Math.abs(dh) / 20;
    const inner = dh < 0 ? 1 : -1; // heading decreasing = turning right = inner side is +x
    const hw = f.hw;
    xa.set(fr.right.x, 0, fr.right.z);
    if (xa.lengthSq() < 1e-6) xa.set(1, 0, 0);
    xa.normalize();
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? -1 : 1;
      const dMax = side === inner && kappa > 1e-4 ? Math.max(5, 0.8 / kappa - hw - 2) : 999;
      rowDMax[r * 2 + si] = dMax;
      rowWallHi[r * 2 + si] = kind === 'wall' && Math.abs(fr.bank) > 0.35 && Math.sign(fr.bank) === -side ? 1 : 0;
      v1.copy(fr.pos).addScaledVector(fr.right, side * hw);
      if (kind === 'river') v1.addScaledVector(fr.up, 0);
      rowEdgeY[r * 2 + si] = v1.y;
      const e = (r * 2 + si) * 5;
      rowEdge[e] = v1.x;
      rowEdge[e + 1] = v1.y;
      rowEdge[e + 2] = v1.z;
      rowEdge[e + 3] = xa.x * side;
      rowEdge[e + 4] = xa.z * side;
      pin.s = s;
      pin.side = side as -1 | 1;
      pin.kind = kind;
      pin.open = chasmOpen(track, s);
      rowOpen[r] = pin.open;
      pin.bankDeg = (fr.bank * 180) / Math.PI;
      pin.floorRel = floorY - v1.y;
      sideProfile(prof, pin);
      rowProf.set(prof, (r * 2 + si) * NL);
      // columns
      for (let i = 0; i < NL; i++) {
        const c = side < 0 ? NL - 1 - i : NL + PATH_COLS + i;
        // inner side of bends: soft compression so columns never cross the centre of curvature
        const d = dMax > 500 ? LAT[i] : dMax * Math.tanh(LAT[i] / dMax);
        const o = (r * NC + c) * 3;
        rowPos[o] = v1.x + rowEdge[e + 3] * d;
        rowPos[o + 1] = v1.y + prof[i];
        rowPos[o + 2] = v1.z + rowEdge[e + 4] * d;
      }
    }
    // under the path
    for (let j = 0; j < PATH_COLS; j++) {
      const x = -hw + (2 * hw * (j + 1)) / (PATH_COLS + 1);
      const o = (r * NC + NL + j) * 3;
      v2.copy(fr.pos).addScaledVector(fr.right, x);
      if (isChasm(kind)) v2.y = floorY - 1.5;
      else v2.addScaledVector(fr.up, kind === 'river' ? -0.9 : -0.08);
      rowPos[o] = v2.x;
      rowPos[o + 1] = v2.y;
      rowPos[o + 2] = v2.z;
    }
  }

  // ---------- smooth normals per grid vertex
  for (let r = 1; r < R - 1; r++) {
    // one-sided differences across boundary twins (keeps the lip shading clean)
    const ra = rowS[r] - rowS[r - 1] < 0.1 ? r : r - 1;
    const rb = rowS[r + 1] - rowS[r] < 0.1 ? r : r + 1;
    for (let c = 0; c < NC; c++) {
      const ca = Math.max(0, c - 1);
      const cb = Math.min(NC - 1, c + 1);
      const oa = (r * NC + ca) * 3;
      const ob = (r * NC + cb) * 3;
      v1.set(rowPos[ob] - rowPos[oa], rowPos[ob + 1] - rowPos[oa + 1], rowPos[ob + 2] - rowPos[oa + 2]);
      const pa = (ra * NC + c) * 3;
      const pb = (rb * NC + c) * 3;
      v2.set(rowPos[pb] - rowPos[pa], rowPos[pb + 1] - rowPos[pa + 1], rowPos[pb + 2] - rowPos[pa + 2]);
      if (ra === rb) v2.copy(rowFrame[r].fwd);
      v3.crossVectors(v1, v2);
      if (v3.lengthSq() < 1e-10) v3.set(0, 1, 0);
      v3.normalize();
      if (v3.y < 0) v3.negate();
      const o = (r * NC + c) * 3;
      rowNrm[o] = v3.x;
      rowNrm[o + 1] = v3.y;
      rowNrm[o + 2] = v3.z;
    }
  }

  const colD = (c: number) => (c < NL ? LAT[NL - 1 - c] : c >= NL + PATH_COLS ? LAT[c - NL - PATH_COLS] : -1);
  // ---------- per grid vertex: grass colour, rock colour, wall-run high side flag (computed once, not per triangle)
  for (let r = 1; r < R - 1; r++) {
    for (let c = 0; c < NC; c++) {
      const o = (r * NC + c) * 3;
      const x = rowPos[o];
      const y = rowPos[o + 1];
      const z = rowPos[o + 2];
      const fl = rowFloor[r];
      const d = colD(c);
      const si = c < NL ? 0 : 1;
      if (d < 0) col.setHex(rowKind[r] === 'river' ? p.rockB : p.verge);
      else grassColor(w, x, y, z, d, rowEdgeY[r * 2 + si], fl, col);
      gridGrass[o] = col.r;
      gridGrass[o + 1] = col.g;
      gridGrass[o + 2] = col.b;
      rockColor(w, x, y, z, fl, col);
      // chasms (vault gaps, jump gaps, bridges): the rock darkens fast below the lip, so the ravine reads as
      // bottomless instead of a lit box trench
      const op = smoothstep(0.92, 1, rowOpen[r]); // the chasm rows and its lips only
      if (op > 0.01 && d < 14) {
        const edgeY = d < 0 ? (rowEdgeY[r * 2] + rowEdgeY[r * 2 + 1]) / 2 : rowEdgeY[r * 2 + si];
        const k = smoothstep(edgeY - 20, edgeY - 1, y);
        const dark = 0.22 + 0.78 * k;
        col.multiplyScalar(1 + (dark - 1) * op);
        col.lerp(col2.setHex(w.p.fog), (1 - k) * 0.25 * op); // a little haze at depth
        const g = 1 + (dark - 1) * op;
        gridGrass[o] *= g;
        gridGrass[o + 1] *= g;
        gridGrass[o + 2] *= g;
      }
      gridRock[o] = col.r;
      gridRock[o + 1] = col.g;
      gridRock[o + 2] = col.b;
      gridHi[r * NC + c] = d >= 0 && d <= 7 && rowWallHi[r * 2 + si] ? 1 : 0;
    }
  }
  // ---------- emit terrain triangles (ground vs rock) into scratch buffers
  out.g.n = 0;
  out.k.n = 0;
  const emit = (r0: number, c0: number, r1: number, c1: number, r2: number, c2: number) => {
    const o0 = (r0 * NC + c0) * 3;
    const o1 = (r1 * NC + c1) * 3;
    const o2 = (r2 * NC + c2) * 3;
    v1.set(rowPos[o1] - rowPos[o0], rowPos[o1 + 1] - rowPos[o0 + 1], rowPos[o1 + 2] - rowPos[o0 + 2]);
    v2.set(rowPos[o2] - rowPos[o0], rowPos[o2 + 1] - rowPos[o0 + 1], rowPos[o2 + 2] - rowPos[o0 + 2]);
    nA.crossVectors(v1, v2);
    const area = nA.length();
    if (area < 1e-6) return;
    nA.multiplyScalar(1 / area);
    // steep faces are rock; so is the high side of a wall-run (it continues the rock face)
    const steep = nA.y < 0.52 || (gridHi[r0 * NC + c0] & gridHi[r1 * NC + c1] & gridHi[r2 * NC + c2]) === 1;
    const B = steep ? out.k : out.g;
    for (let k = 0; k < 3; k++) {
      const o = k === 0 ? o0 : k === 1 ? o1 : o2;
      const i3 = B.n * 3;
      const i2 = B.n * 2;
      const x = rowPos[o];
      const y = rowPos[o + 1];
      const z = rowPos[o + 2];
      B.P[i3] = x;
      B.P[i3 + 1] = y;
      B.P[i3 + 2] = z;
      if (steep) {
        B.N[i3] = nA.x;
        B.N[i3 + 1] = nA.y;
        B.N[i3 + 2] = nA.z;
        B.C[i3] = gridRock[o];
        B.C[i3 + 1] = gridRock[o + 1];
        B.C[i3 + 2] = gridRock[o + 2];
        B.U[i2] = (x * 0.7 + z * 0.7) * 0.11;
        B.U[i2 + 1] = y * 0.16;
      } else {
        B.N[i3] = rowNrm[o];
        B.N[i3 + 1] = rowNrm[o + 1];
        B.N[i3 + 2] = rowNrm[o + 2];
        B.C[i3] = gridGrass[o];
        B.C[i3 + 1] = gridGrass[o + 1];
        B.C[i3 + 2] = gridGrass[o + 2];
        B.U[i2] = x / 7;
        B.U[i2 + 1] = z / 7;
      }
      B.n++;
    }
  };
  for (let r = 1; r < R - 2; r++) {
    for (let c = 0; c < NC - 1; c++) {
      emit(r, c, r, c + 1, r + 1, c + 1);
      emit(r, c, r + 1, c + 1, r + 1, c);
    }
  }
  const mk = (B: TriBuf, mat: THREE.Material, cast: boolean) => {
    if (B.n === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(B.P.slice(0, B.n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(B.N.slice(0, B.n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(B.C.slice(0, B.n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(B.U.slice(0, B.n * 2), 2));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = !low;
    m.castShadow = !low && cast;
    group.add(m);
  };
  mk(out.g, kit.ground, false);
  mk(out.k, kit.rock, true);

  // ---------- ribbons
  buildRibbons(w, R, group, low);
  // ---------- bridges
  const scatter = new Scatter();
  buildBridges(w, s0, s1, scatter);
  // ---------- foliage
  scatterFoliage(w, R, s0, s1, scatter, low);
  scatter.build(group, !low);
  return group;
}

// ------------------------------------------------------------------ ribbons
function buildRibbons(w: WorldCtx, R: number, group: THREE.Group, low: boolean): void {
  const dirtP: number[] = [];
  const dirtU: number[] = [];
  const wallP: number[] = [];
  const wallU: number[] = [];
  const watP: number[] = [];
  const watU: number[] = [];
  const watH: number[] = [];
  const quadStrip = (r0: number, r1: number, ext: number, n: number, yOff: number, P: number[], U: number[], H: number[] | null, worldUv: boolean) => {
    const f0 = rowFrame[r0];
    const f1 = rowFrame[r1];
    const e0 = f0.hw + ext;
    const e1 = f1.hw + ext;
    for (let j = 0; j < n; j++) {
      const a = -1 + (2 * j) / n;
      const b = -1 + (2 * (j + 1)) / n;
      // corners: (r0,a) (r0,b) (r1,b) (r1,a)  -- a < b = left to right
      const pts: [number, number, number][] = [
        [r0, a, e0],
        [r0, b, e0],
        [r1, b, e1],
        [r1, a, e1],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [rr, t, e] = pts[k];
        const f = rowFrame[rr];
        v1.copy(f.pos).addScaledVector(f.right, t * e).addScaledVector(f.up, yOff);
        P.push(v1.x, v1.y, v1.z);
        if (worldUv) {
          U.push(t * e, rowS[rr]);
          H?.push(e);
        } else U.push((t + 1) / 2, rowS[rr] / 12);
      }
    }
  };
  const canyonRiver = (r0: number, r1: number, P: number[], U: number[], H: number[]) => {
    // a winding stream on the canyon floor (world y = valley floor + 0.4)
    const e = 5;
    for (const [a, b] of [
      [-1, 0],
      [0, 1],
    ] as const) {
      const pts: [number, number][] = [
        [r0, a],
        [r0, b],
        [r1, b],
        [r1, a],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [rr, t] = pts[k];
        const f = rowFrame[rr];
        const wig = Math.sin(rowS[rr] * 0.045) * 3;
        v1.copy(f.pos).addScaledVector(xa.set(f.right.x, 0, f.right.z).normalize(), t * e + wig);
        v1.y = rowFloor[rr] + 0.4;
        P.push(v1.x, v1.y, v1.z);
        U.push(t * e, rowS[rr]);
        H.push(e);
      }
    }
  };
  for (let r = 1; r < R - 2; r++) {
    const k = w.track.kindAt((rowS[r] + rowS[r + 1]) / 2);
    if (rowS[r + 1] - rowS[r] < 0.1) continue;
    if (k === 'ground') quadStrip(r, r + 1, 0.4, 2, 0, dirtP, dirtU, null, false);
    else if (k === 'wall') quadStrip(r, r + 1, 0.4, 2, 0, wallP, wallU, null, false);
    else if (k === 'river') quadStrip(r, r + 1, 1.25, low ? 2 : 4, -0.06, watP, watU, watH, true);
    else if (k === 'cloud') canyonRiver(r, r + 1, watP, watU, watH);
  }
  const mk = (P: number[], U: number[], mat: THREE.Material, H?: number[]) => {
    if (!P.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (H) geo.setAttribute('hw', new THREE.Float32BufferAttribute(H, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = !low && !H;
    group.add(m);
  };
  mk(dirtP, dirtU, w.kit.dirt);
  mk(wallP, wallU, w.kit.wallPath);
  mk(watP, watU, w.water, watH);
}

// ------------------------------------------------------------------ bridges
const bm = new THREE.Matrix4();
const bq = new THREE.Quaternion();
const bs = new THREE.Vector3();
const ba = new THREE.Vector3();
const bb = new THREE.Vector3();
const bx = new THREE.Vector3();
function rope(scatter: Scatter, w: WorldCtx, a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
  // three sagging segments from a to b
  const pts = [0, 0.33, 0.67, 1].map((t) => new THREE.Vector3().lerpVectors(a, b, t).addScaledVector(UPV, -sag * 4 * t * (1 - t)));
  for (let i = 0; i < 3; i++) {
    bx.subVectors(pts[i + 1], pts[i]);
    const len = bx.length();
    bq.setFromUnitVectors(UPV, bx.normalize());
    bs.set(1, len, 1);
    bm.compose(pts[i], bq, bs);
    scatter.addMatrix('rope', w.kit.rope, w.kit.ropeMat, bm, false);
  }
}
function frameMatrix(f: { pos: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 }, x: number, y: number, out: THREE.Matrix4): THREE.Matrix4 {
  xa.copy(f.right).negate();
  out.makeBasis(xa, f.up, f.fwd);
  v3.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y);
  out.setPosition(v3);
  return out;
}
const bf = newFrame();
function buildBridges(w: WorldCtx, s0: number, s1: number, scatter: Scatter): void {
  const { track, kit } = w;
  for (const g of track.segments) {
    if (g.kind !== 'bridge' || g.s1 <= s0 || g.s0 >= s1) continue;
    const a = Math.max(s0, g.s0);
    const b = Math.min(s1, g.s1);
    // planks
    for (let s = Math.ceil(a / 0.55) * 0.55; s < b; s += 0.55) {
      track.sample(s, bf);
      const h = hash1(Math.round(s * 10));
      frameMatrix(bf, (h - 0.5) * 0.15, -0.075 - h * 0.03, bm);
      bq.setFromAxisAngle(UPV, (h - 0.5) * 0.08);
      bm.multiply(new THREE.Matrix4().makeRotationFromQuaternion(bq));
      bm.multiply(new THREE.Matrix4().makeScale(bf.width + 0.5 + h * 0.3, 1, 1));
      scatter.addMatrix('plank', kit.plank, kit.wood, bm, true);
    }
    // stringers under the deck
    for (let s = a; s < b; s += 2) {
      track.sample(s, bf);
      for (const side of [-1, 1]) {
        ba.copy(bf.pos).addScaledVector(bf.right, side * (bf.width / 2 - 0.4)).addScaledVector(bf.up, -0.25);
        track.toWorld(Math.min(b, s + 2), side * (bf.width / 2 - 0.4), -0.25, bb);
        bx.subVectors(bb, ba);
        const len = bx.length();
        if (len < 0.01) continue;
        bq.setFromUnitVectors(UPV, bx.normalize());
        bs.set(1.6, len, 1.6);
        bm.compose(ba, bq, bs);
        scatter.addMatrix('post', kit.post, kit.wood, bm, true);
      }
    }
    // posts + ropes
    const n = Math.max(1, Math.round((g.s1 - g.s0) / 3.2));
    const stepS = (g.s1 - g.s0) / n;
    for (let i = 0; i <= n; i++) {
      const s = g.s0 + i * stepS;
      if (s < a - 0.01 || s > b + 0.01) continue;
      const end = i === 0 || i === n;
      track.sample(s, bf);
      for (const side of [-1, 1]) {
        const x = side * (bf.width / 2 + 0.3);
        ba.copy(bf.pos).addScaledVector(bf.right, x).addScaledVector(UPV, -0.8);
        bs.set(end ? 1.7 : 1, end ? 2.5 : 2.15, end ? 1.7 : 1);
        bm.compose(ba, bq.identity(), bs);
        scatter.addMatrix('post', kit.post, kit.wood, bm, true);
        if (i < n) {
          const sn = g.s0 + (i + 1) * stepS;
          for (const hy of [1.25, 0.7]) {
            track.toWorld(s, x, 0, ba);
            ba.y += hy;
            track.toWorld(sn, x, 0, bb);
            bb.y += hy;
            rope(scatter, w, ba, bb, hy > 1 ? 0.22 : 0.12);
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------ foliage
const fp = new THREE.Vector3();
const tint = new THREE.Color();
function scatterFoliage(w: WorldCtx, R: number, s0: number, s1: number, sc: Scatter, low: boolean): void {
  const { p, kit, track } = w;
  const rnd = seeded(Math.floor(s0 * 13.7) + w.seed * 1009 + 7);
  const dens = low ? 0.4 : 1;
  const place = (r: number, si: number, d: number, ds: number, out: THREE.Vector3): number => {
    const e = (r * 2 + si) * 5;
    const f = rowFrame[r];
    const h = profileAt(rowProf.subarray((r * 2 + si) * NL, (r * 2 + si + 1) * NL), d);
    out.set(rowEdge[e] + rowEdge[e + 3] * d + f.fwd.x * ds, rowEdge[e + 1] + h, rowEdge[e + 2] + rowEdge[e + 4] * d + f.fwd.z * ds);
    return h;
  };
  for (let r = 1; r < R - 2; r++) {
    if (rowS[r] < s0 || rowS[r] >= s1) continue;
    if (rowS[r + 1] - rowS[r] < 0.1) continue;
    const kind = rowKind[r];
    if (isChasm(kind)) continue;
    const s = rowS[r];
    const span = rowS[r + 1] - rowS[r];
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? -1 : 1;
      const pr = rowProf.subarray((r * 2 + si) * NL, (r * 2 + si + 1) * NL);
      const dMax = rowDMax[r * 2 + si];
      const ok = (d: number, maxSlope: number) => d < dMax - 1 && profileSlope(pr, d) < maxSlope && profileAt(pr, d) > pr[NL - 1] + 4;
      // grass tufts, thick near the path
      const nt = Math.round((low ? 1.2 : 3.4) * span * 0.5 + rnd() * 0.8);
      for (let i = 0; i < nt; i++) {
        const d = kind === 'river' ? 1.3 + rnd() * 10 : 0.1 + Math.pow(rnd(), 1.7) * 16;
        if (!ok(d, 1.1)) continue;
        place(r, si, d, rnd() * span, fp);
        fp.y -= 0.03;
        const s2 = (0.5 + rnd() * 0.45) * (d < 2 ? 0.8 : 1);
        sc.add('tuft', kit.tuft, kit.grass, fp, rnd() * 6.28, s2, s2 * (0.7 + rnd() * 0.5), s2, false);
      }
      // reeds on river banks
      if (kind === 'river' && rnd() < 0.7 * dens) {
        const d = 1.0 + rnd() * 1.2;
        place(r, si, d, rnd() * span, fp);
        const s2 = 1.1 + rnd() * 0.5;
        sc.add('tuft', kit.tuft, kit.grass, fp, rnd() * 6.28, s2, s2 * 3.2, s2, false);
      }
      // flowers
      if (rnd() < 0.55 * dens) {
        const n = 1 + Math.floor(rnd() * 3);
        const d0 = 0.6 + rnd() * 10;
        const fc = p.flowers[Math.floor(rnd() * p.flowers.length)];
        for (let i = 0; i < n; i++) {
          const d = d0 + rnd() * 1.2;
          if (!ok(d, 0.8)) continue;
          place(r, si, d, rnd() * span, fp);
          tint.setHex(fc);
          sc.add('flower', kit.flower, kit.veg, fp, 0, 1, 0.8 + rnd() * 0.6, 1, false, tint);
        }
      }
      // bushes
      if (rnd() < 0.2 * dens + 0.05) {
        const d = 2.3 + rnd() * 18;
        if (ok(d, 0.7)) {
          place(r, si, d, rnd() * span, fp);
          fp.y -= 0.15;
          const s2 = 0.7 + rnd() * 0.8;
          tint.setHSL(0, 0, 0.88 + rnd() * 0.2);
          sc.add('bush', kit.bush, kit.veg, fp, rnd() * 6.28, s2, s2 * (0.8 + rnd() * 0.3), s2, true, tint);
        }
      }
      // bush clusters lining the path edge (about one every 12 u per side; LOW halves them)
      if (kind !== 'river' && kind !== 'wall' && rnd() < (span / 12) * dens * (low ? 1.25 : 1)) {
        const d0 = 1.7 + rnd() * 2.4;
        const ds0 = rnd() * span;
        const k = 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < k; i++) {
          const d = d0 + (rnd() - 0.3) * 1.4;
          if (!ok(d, 0.9)) continue;
          place(r, si, d, ds0 + (rnd() - 0.5) * 1.6, fp);
          fp.y -= 0.12;
          const s2 = 0.55 + rnd() * 0.5;
          tint.setHSL(0, 0, 0.86 + rnd() * 0.22);
          sc.add('bush', kit.bush, kit.veg, fp, rnd() * 6.28, s2, s2 * (0.8 + rnd() * 0.3), s2, false, tint);
        }
      }
      // boulders (also at cliff feet)
      if (rnd() < 0.09 * dens + 0.02) {
        const d = 2.2 + rnd() * 12;
        if (ok(d, 1.4)) {
          place(r, si, d, rnd() * span, fp);
          fp.y -= 0.2;
          const s2 = 0.4 + Math.pow(rnd(), 2) * 1.6;
          sc.add('boulder', kit.boulder, kit.solid, fp, rnd() * 6.28, s2, s2, s2, true);
        }
      }
      // trees
      if (rnd() < 0.13 * dens + 0.03) {
        const d = 5 + rnd() * 30;
        if (ok(d, 0.55)) {
          place(r, si, d, rnd() * span, fp);
          fp.y -= 0.2;
          const s2 = 0.75 + rnd() * 0.7;
          const ti = Math.floor(rnd() * kit.trees.length);
          tint.setRGB(0.88 + rnd() * 0.2, 0.92 + rnd() * 0.12, 0.85 + rnd() * 0.15);
          sc.add('tree' + ti, kit.trees[ti], kit.vegSway, fp, rnd() * 6.28, s2, s2 * (0.9 + rnd() * 0.3), s2, true, tint);
        }
      }
      // bamboo groves
      const bz = vnoise1(s / 85 + side * 9.1, w.seed + 31);
      if (bz > 1 - p.bambooAmt * 0.7 && rnd() < 0.55 * dens + 0.1) {
        const d = 2.6 + rnd() * 12;
        if (ok(d, 0.8)) {
          place(r, si, d, rnd() * span, fp);
          fp.y -= 0.1;
          const s2 = 0.8 + rnd() * 0.5;
          sc.add('bamboo', kit.bamboo, kit.vegSway, fp, rnd() * 6.28, s2, s2 * (0.9 + rnd() * 0.4), s2, true);
        }
      }
    }
  }
  // ---------- far out: mesas and valley woods on the floor
  const fl = w.floorAt((s0 + s1) / 2);
  const tryFar = (minClear: number): boolean => {
    // horizontal clearance from every nearby piece of track
    for (let s = Math.max(0, s0 - 320); s < Math.min(track.length, s1 + 320); s += 6) {
      track.sample(s, bf);
      const dx = bf.pos.x - fp.x;
      const dz = bf.pos.z - fp.z;
      if (dx * dx + dz * dz < minClear * minClear) return false;
    }
    return true;
  };
  const pillars = low ? 1 : 2;
  for (let i = 0; i < pillars; i++) {
    if (rnd() > (w.id === 'gorge' ? 0.55 : 0.75)) continue;
    const s = s0 + rnd() * (s1 - s0);
    track.sample(s, bf);
    const side = rnd() < 0.5 ? -1 : 1;
    const D = 75 + rnd() * 230;
    const rad = 7 + rnd() * 10;
    xa.set(bf.right.x, 0, bf.right.z).normalize();
    fp.copy(bf.pos).addScaledVector(xa, side * (bf.width / 2 + D));
    if (!tryFar(rad + 40)) continue;
    const top = bf.pos.y + (rnd() * 55 - 5);
    const base = fl - 6;
    const h = Math.max(20, top - base);
    fp.y = base;
    sc.add('pillar', kit.pillar, kit.solid, fp, rnd() * 6.28, rad, h, rad * (0.85 + rnd() * 0.3), true);
    // a little wood on top
    for (let k = 0; k < 3; k++) {
      const a = rnd() * 6.28;
      const rr = rnd() * rad * 0.5;
      v2.set(fp.x + Math.cos(a) * rr, base + h + 0.02, fp.z + Math.sin(a) * rr);
      const s2 = 2 + rnd() * 1.8;
      sc.add('tree0', kit.trees[0], kit.vegSway, v2, rnd() * 6.28, s2, s2, s2, true, tint.setRGB(1, 1, 1));
    }
  }
  const woods = low ? 2 : 5;
  for (let i = 0; i < woods; i++) {
    const s = s0 + rnd() * (s1 - s0);
    track.sample(s, bf);
    const side = rnd() < 0.5 ? -1 : 1;
    const D = 70 + rnd() * 200;
    xa.set(bf.right.x, 0, bf.right.z).normalize();
    fp.copy(bf.pos).addScaledVector(xa, side * (bf.width / 2 + D));
    if (!tryFar(62)) continue;
    const n = 3 + Math.floor(rnd() * 5);
    const cx = fp.x;
    const cz = fp.z;
    for (let k = 0; k < n; k++) {
      fp.set(cx + (rnd() - 0.5) * 30, fl - 0.3, cz + (rnd() - 0.5) * 30);
      const s2 = 1.6 + rnd() * 1.4;
      const ti = Math.floor(rnd() * kit.trees.length);
      sc.add('tree' + ti, kit.trees[ti], kit.vegSway, fp, rnd() * 6.28, s2, s2, s2, false, tint.setRGB(0.95, 1, 0.95));
    }
  }
}

/** dispose a chunk built here (instanced meshes free their instance buffers) */
export function disposeTerrainChunk(obj: THREE.Object3D): void {
  obj.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose();
    if ((n as THREE.InstancedMesh).isInstancedMesh) (n as THREE.InstancedMesh).dispose();
  });
}
