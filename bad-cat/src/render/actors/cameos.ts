/**
 * Cameos (GDD 3.4, 6.5): spectator cats on the shell's windowsills and shelves and the Club fridge wall of up to 40
 * round face magnets. Render only. Draw calls: spectators are one instanced sitting cat (fur + outline + faces from
 * the shared face atlas = 2 calls for up to 15 cats); the fridge wall is one instanced disc mesh (1 call).
 * Spectators hop when something crashes; `spectatorAt` finds the cat under a screen point for name tags.
 *
 * Fridge wall convention (ShellDef.fridgeWall {x, z, w}): magnets sit on the south (+z, camera-facing) face of row
 * `z`, from column `x` over `w` columns, between 0.3 m and the furniture top (or 1.7 m).
 */
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { decodeCat } from '../../codec';
import { CELL_M, DEFAULT_CAT, FRIDGE_MAGNETS, rgb565, type CameoBundle, type CameoEntry, type CatSpec, type ShellDef } from '../../types';
import { buildCatRig, disposeCatRig, poseCat } from '../cat-rig';
import { createInstancedCatMaterial } from '../cat-material';
import { outlineFor } from '../cat-outline';
import { catColors, PATTERN_INDEX } from '../palette';
import { cellX, cellZ, levelY } from '../space';
import { hash01 } from '../geo';
import { ATLAS_GRID, FaceAtlas } from './face-atlas';
import { bakePosed } from './skin';

export const MAX_SPECTATORS = 15;
/** Magnet radius and spacing (m). */
export const MAGNET_R = 0.042;
export const MAGNET_GAP = 0.1;

/** The cameo's cat: decoded from its code (default face colours otherwise from a stable hash of its id). */
export function cameoSpec(e: CameoEntry): CatSpec {
  let spec: CatSpec | null = null;
  try {
    spec = decodeCat(e.catCode, e.name);
  } catch {
    spec = null;
  }
  if (spec) return spec;
  const h = hash01(Array.from(e.id).reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const coats = [0xf0a050, 0x2a2a30, 0x9a9aa2, 0xf2efe9, 0xc8a27a, 0x6b4a3a];
  return { ...DEFAULT_CAT, pattern: h < 0.5 ? 'solid' : 'tabby', base: rgb565(coats[Math.floor(h * coats.length) % coats.length]), name: e.name };
}

/** Magnet centres on the fridge face (pure). Fills rows top-down, centred; at most `n`. */
export function fridgeMagnetLayout(shell: Pick<ShellDef, 'width' | 'depth' | 'levels' | 'fridgeWall'>, n = FRIDGE_MAGNETS): { pts: Vector3[]; r: number; box: { x0: number; x1: number; y0: number; y1: number; z: number } } | null {
  const fw = shell.fridgeWall;
  if (!fw) return null;
  const W = shell.width;
  const D = shell.depth;
  const lv = shell.levels[Math.max(0, Math.min(D - 1, fw.z)) * W + Math.max(0, Math.min(W - 1, fw.x))] ?? 3;
  const x0 = cellX(fw.x, W) - CELL_M / 2 + 0.05;
  const x1 = cellX(fw.x + Math.max(1, fw.w) - 1, W) + CELL_M / 2 - 0.05;
  const y0 = 0.3;
  const y1 = Math.min(1.7, Math.max(0.9, levelY(lv) - 0.08));
  const z = cellZ(fw.z, D) + CELL_M / 2 + 0.014;
  const cols = Math.max(1, Math.floor((x1 - x0) / MAGNET_GAP));
  const rows = Math.max(1, Math.floor((y1 - y0) / MAGNET_GAP));
  const count = Math.min(n, cols * rows);
  const pts: Vector3[] = [];
  const used = Math.ceil(count / cols);
  const top = y1 - ((y1 - y0) - used * MAGNET_GAP) / 2 - MAGNET_GAP / 2;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = Math.min(cols, count - r * cols);
    const left = (x0 + x1) / 2 - ((inRow - 1) * MAGNET_GAP) / 2;
    // a hand-placed look: a small deterministic jitter
    const jx = (hash01(i * 13 + 1) - 0.5) * 0.012;
    const jy = (hash01(i * 17 + 5) - 0.5) * 0.012;
    pts.push(new Vector3(left + c * MAGNET_GAP + jx, top - r * MAGNET_GAP + jy, z));
  }
  return { pts, r: MAGNET_R, box: { x0, x1, y0, y1, z } };
}

const FACE_VS_PATCH = '#include <uv_vertex>\n  #ifdef USE_MAP\n  vMapUv = vMapUv / float(' + ATLAS_GRID + ') + iFaceUv;\n  #endif';

/** Spectator cats (instanced) for one room. */
/** Spectator cats sit at this size (review round 1: full size they were bigger than the player's cat). */
export const SPECTATOR_SCALE = 0.6;
/** Slots this close (cells, x) to a human and level with or behind him are skipped: not on his back wall. */
export const SPECTATOR_HUMAN_CLEAR = 2;

/** The shell's spectator slots minus the ones on a human's back wall and the ones with nothing to sit on. */
export function spectatorSlotsOf(shell: ShellDef): NonNullable<ShellDef['spectatorSlots']> {
  const humans = [shell.humanSpot, shell.humanSpot2].filter((p): p is { x: number; z: number } => !!p);
  const W = shell.width;
  return (shell.spectatorSlots ?? []).filter(
    (s) =>
      !humans.some((hm) => Math.abs(s.x - hm.x) <= SPECTATOR_HUMAN_CLEAR && s.z <= hm.z) &&
      // round 2: a side-wall slot with no surface under it floated outside the left wall (back-wall slots sit on
      // the tall cabinets and stay)
      s.x >= 0 && s.z >= 0 && s.x < W && s.z < shell.depth && !(s.z > 0 && (s.x === 0 || s.x === W - 1) && (shell.levels[s.z * W + s.x] ?? 0) < s.level),
  );
}

export class Spectators {
  readonly group = new Group();
  private fur: InstancedMesh;
  private outline: InstancedMesh;
  private faces: InstancedMesh;
  private furMat = createInstancedCatMaterial();
  private faceMat: MeshLambertMaterial;
  private entries: CameoEntry[] = [];
  private base: { pos: Vector3; yaw: number; scale: Vector3; phase: number }[] = [];
  private cheerT = -1;
  private readonly _m = new Matrix4();
  private readonly _q = new Quaternion();

  constructor(
    private readonly shell: ShellDef,
    private readonly atlas: FaceAtlas,
  ) {
    // one sitting cat, baked
    const rig = buildCatRig(DEFAULT_CAT, null);
    poseCat(rig, { T: 0, act: 0, actP: 0, moving: 0, phase: 0, blink: false, loaf: 0, sit: 1 });
    rig.root.updateMatrixWorld(true);
    const furGeo = bakePosed(rig.body as never, rig.root);
    const faceGeo = rig.face.geometry.clone().applyMatrix4(new Matrix4().copy(rig.root.matrixWorld).invert().multiply(rig.face.matrixWorld));
    disposeCatRig(rig);
    const n = MAX_SPECTATORS;
    furGeo.setAttribute('iBase', new InstancedBufferAttribute(new Float32Array(n * 3), 3));
    furGeo.setAttribute('iSec', new InstancedBufferAttribute(new Float32Array(n * 3), 3));
    furGeo.setAttribute('iTer', new InstancedBufferAttribute(new Float32Array(n * 3), 3));
    furGeo.setAttribute('iPat', new InstancedBufferAttribute(new Float32Array(n), 1));
    faceGeo.setAttribute('iFaceUv', new InstancedBufferAttribute(new Float32Array(n * 2), 2));
    this.fur = new InstancedMesh(furGeo, this.furMat, n);
    this.fur.name = 'spectator-cats';
    this.fur.count = 0;
    this.fur.frustumCulled = false;
    // no outline: at spectator size the 2 px hull only blurs them, and it costs a draw call
    this.outline = outlineFor(this.fur) as InstancedMesh;
    this.outline.count = 0;
    this.outline.visible = false;
    this.faceMat = new MeshLambertMaterial({ map: atlas.tex, transparent: true, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.faceMat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
      sh.vertexShader = 'attribute vec2 iFaceUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', FACE_VS_PATCH);
    };
    this.faceMat.customProgramCacheKey = () => 'bc-atlas-face';
    this.faces = new InstancedMesh(faceGeo, this.faceMat, n);
    this.faces.name = 'spectator-faces';
    this.faces.count = 0;
    this.faces.frustumCulled = false;
    this.faces.renderOrder = 1;
    this.group.add(this.fur, this.outline, this.faces);
  }

  /** Fill the shell's spectator slots in order. */
  set(list: readonly CameoEntry[], faces?: ReadonlyMap<string, ImageBitmap | HTMLCanvasElement>): void {
    const slots = spectatorSlotsOf(this.shell);
    const n = Math.min(MAX_SPECTATORS, slots.length, list.length);
    this.entries = list.slice(0, n);
    this.base = [];
    const W = this.shell.width;
    const D = this.shell.depth;
    const g = this.fur.geometry;
    const iB = g.getAttribute('iBase') as InstancedBufferAttribute;
    const iS = g.getAttribute('iSec') as InstancedBufferAttribute;
    const iT = g.getAttribute('iTer') as InstancedBufferAttribute;
    const iP = g.getAttribute('iPat') as InstancedBufferAttribute;
    const iF = this.faces.geometry.getAttribute('iFaceUv') as InstancedBufferAttribute;
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const e = this.entries[i];
      const spec = cameoSpec(e);
      const cc = catColors(spec);
      c.setHex(cc.base);
      iB.setXYZ(i, c.r, c.g, c.b);
      c.setHex(cc.secondary);
      iS.setXYZ(i, c.r, c.g, c.b);
      c.setHex(cc.tertiary);
      iT.setXYZ(i, c.r, c.g, c.b);
      iP.setX(i, PATTERN_INDEX[spec.pattern] ?? 0);
      const slot = this.atlas.slot(`cameo:${e.id}`, spec, faces?.get(e.id) ?? null);
      const uv = this.atlas.uv(Math.max(0, slot));
      iF.setXY(i, uv.u, uv.v);
      const s = slots[i];
      const pos = new Vector3(cellX(s.x, W), levelY(s.level), cellZ(s.z, D));
      // face the front of the room (where the action and the camera are)
      const yaw = Math.atan2(-pos.x * 0.6, D * CELL_M * 0.6 - pos.z);
      const bw = (spec.body === 'chonk' ? 1.2 : spec.body === 'slim' ? 0.88 : 1) * SPECTATOR_SCALE;
      const bh = (spec.body === 'chonk' ? 1.06 : 1) * SPECTATOR_SCALE;
      this.base.push({ pos, yaw, scale: new Vector3(bw, bh, bw), phase: hash01(i * 31 + 7) * Math.PI * 2 });
    }
    for (const a of [iB, iS, iT, iP, iF]) a.needsUpdate = true;
    this.fur.count = this.faces.count = n;
    this.update(0);
  }

  /** Something crashed: the spectators hop (render ticks). */
  cheer(T: number): void {
    this.cheerT = T;
  }

  update(T: number): void {
    const t = T / 30;
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i];
      const sway = Math.sin(t * 0.5 + b.phase) * 0.14;
      const breathe = 1 + Math.sin(t * 2.6 + b.phase) * 0.015;
      let hop = 0;
      if (this.cheerT >= 0) {
        const u = (T - this.cheerT - (i % 4) * 2) / 10;
        if (u > 0 && u < 1) hop = Math.sin(u * Math.PI) * 0.06;
      }
      this._q.setFromAxisAngle(new Vector3(0, 1, 0), b.yaw + sway);
      this._m.compose(new Vector3(b.pos.x, b.pos.y + hop, b.pos.z), this._q, new Vector3(b.scale.x, b.scale.y * breathe, b.scale.z));
      this.fur.setMatrixAt(i, this._m);
      this.faces.setMatrixAt(i, this._m);
    }
    this.fur.instanceMatrix.needsUpdate = true;
    this.faces.instanceMatrix.needsUpdate = true;
  }

  /** The cameo whose cat is under the screen point (NDC), within `radius` NDC units of its head. */
  at(cam: PerspectiveCamera, ndcX: number, ndcY: number, aspect: number, radius = 0.09): CameoEntry | null {
    let best: CameoEntry | null = null;
    let bestD = radius;
    for (let i = 0; i < this.base.length; i++) {
      const p = this.base[i].pos.clone().add(new Vector3(0, 0.3, 0)).project(cam);
      if (p.z > 1) continue;
      const dd = Math.hypot((p.x - ndcX) * aspect, p.y - ndcY);
      if (dd < bestD) {
        bestD = dd;
        best = this.entries[i];
      }
    }
    return best;
  }

  get count(): number {
    return this.base.length;
  }

  dispose(): void {
    this.fur.geometry.dispose();
    this.faces.geometry.dispose();
    this.furMat.dispose();
    this.faceMat.dispose();
    this.fur.dispose();
    this.faces.dispose();
  }
}

const MAG_VS = /* glsl */ `
attribute vec3 iFace;
attribute vec3 iColor;
varying vec2 vUv;
varying vec3 vFace;
varying vec3 vColor;
void main() {
  vUv = uv; vFace = iFace; vColor = iColor;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const MAG_FS = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vFace;
varying vec3 vColor;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  vec3 col = vColor;
  if (vFace.z > 0.5) {
    vec4 f = texture2D(uAtlas, vFace.xy + vUv / ${ATLAS_GRID}.0);
    col = mix(vColor * 0.8 + 0.15, f.rgb, f.a);
  } else {
    col = mix(col, vec3(1.0), smoothstep(0.5, 0.0, length(c - vec2(-0.14, 0.14))) * 0.45);
  }
  col = mix(col, col * 0.55, smoothstep(0.8, 0.95, r));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** The Club fridge wall: up to FRIDGE_MAGNETS round face magnets in one instanced mesh. */
export class FridgeWall {
  readonly mesh: InstancedMesh;
  private mat: ShaderMaterial;
  private layout: ReturnType<typeof fridgeMagnetLayout>;
  private entries: CameoEntry[] = [];

  constructor(
    shell: ShellDef,
    private readonly atlas: FaceAtlas,
  ) {
    this.layout = fridgeMagnetLayout(shell);
    const g: BufferGeometry = new CircleGeometry(MAGNET_R, 20);
    g.setAttribute('iFace', new InstancedBufferAttribute(new Float32Array(FRIDGE_MAGNETS * 3), 3));
    g.setAttribute('iColor', new InstancedBufferAttribute(new Float32Array(FRIDGE_MAGNETS * 3), 3));
    this.mat = new ShaderMaterial({ vertexShader: MAG_VS, fragmentShader: MAG_FS, uniforms: { uAtlas: { value: atlas.tex } } });
    this.mesh = new InstancedMesh(g, this.mat, FRIDGE_MAGNETS);
    this.mesh.name = 'fridge-wall';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  set(list: readonly CameoEntry[], faces?: ReadonlyMap<string, ImageBitmap | HTMLCanvasElement>): void {
    const L = this.layout;
    if (!L) {
      this.mesh.count = 0;
      return;
    }
    const n = Math.min(L.pts.length, list.length, FRIDGE_MAGNETS);
    this.entries = list.slice(0, n);
    const iF = this.mesh.geometry.getAttribute('iFace') as InstancedBufferAttribute;
    const iC = this.mesh.geometry.getAttribute('iColor') as InstancedBufferAttribute;
    const c = new Color();
    const m = new Matrix4();
    for (let i = 0; i < n; i++) {
      const e = this.entries[i];
      const spec = cameoSpec(e);
      const face = faces?.get(e.id) ?? null;
      // approved faces show on the magnet; the rest are colour dots in the cat's coat
      const slot = face ? this.atlas.slot(`cameo:${e.id}`, spec, face) : -1;
      const uv = this.atlas.uv(Math.max(0, slot));
      iF.setXYZ(i, uv.u, uv.v, slot >= 0 ? 1 : 0);
      c.setHex(catColors(spec).base);
      iC.setXYZ(i, c.r, c.g, c.b);
      const p = L.pts[i];
      m.makeRotationZ((hash01(i * 7 + 3) - 0.5) * 0.5).setPosition(p);
      this.mesh.setMatrixAt(i, m);
    }
    iF.needsUpdate = true;
    iC.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = n;
  }

  get count(): number {
    return this.mesh.count;
  }

  /** The magnet under a screen point (NDC). */
  at(cam: PerspectiveCamera, ndcX: number, ndcY: number, aspect: number): CameoEntry | null {
    const L = this.layout;
    if (!L) return null;
    for (let i = 0; i < this.mesh.count; i++) {
      const p = L.pts[i].clone().project(cam);
      if (p.z > 1) continue;
      if (Math.hypot((p.x - ndcX) * aspect, p.y - ndcY) < 0.03) return this.entries[i];
    }
    return null;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

/** Both cameo views for a room, fed from one bundle. */
export class CameoViews {
  readonly group = new Group();
  readonly atlas = new FaceAtlas();
  readonly spectators: Spectators;
  readonly fridge: FridgeWall;

  constructor(shell: ShellDef) {
    this.spectators = new Spectators(shell, this.atlas);
    this.fridge = new FridgeWall(shell, this.atlas);
    this.group.add(this.spectators.group, this.fridge.mesh);
    this.group.name = 'cameos';
  }

  set(bundle: CameoBundle | null, faces?: ReadonlyMap<string, ImageBitmap | HTMLCanvasElement>): void {
    this.spectators.set(bundle?.spectators ?? [], faces);
    this.fridge.set(bundle?.fridge ?? [], faces);
  }

  dispose(): void {
    this.spectators.dispose();
    this.fridge.dispose();
    this.atlas.dispose();
  }
}
