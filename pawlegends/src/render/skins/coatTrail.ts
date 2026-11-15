/**
 * Coat trails (gaps5 skins v2): the pieces of a coat that live on the ground or follow the hero instead of riding his
 * mesh. One instanced mesh (one draw call) per hero wearing such a coat, preallocated, render only:
 *
 * | Coat                        | Trail                                                                            |
 * |-----------------------------|----------------------------------------------------------------------------------|
 * | Paper Parade Dragon (Mythic)| the parade body: paper-lantern segments follow his path, bobbing like a festival |
 * |                             | dragon on poles. It GROWS during the match (the evolving form): 0, 3, 6, then 10 |
 * |                             | segments at levels 4, 7, 10 or 2, 4, 6 takedowns, and stretches to 12 for a few  |
 * |                             | seconds after his ultimate. Each new stage pops a firework (coatFx.ts evolve).   |
 * | Robo-Vac (Epic)             | mowed stripes: pale strips left on the ground behind the vacuum, fading out      |
 * | Soft Serve (Epic)           | melty drips: little cream puddles behind her, shrinking away                     |
 * | Double Stack (Epic, gaps6)  | a ketchup trail: red splats behind him, fading                                   |
 * | Chairman (Mythic, gaps6)    | the evolving form round him (one mesh, its geometry swapped per stage): nothing, |
 * |                             | a green stock-chart arrow over his helmet, the gold office-chair back, then the  |
 * |                             | full gold chair mech (seat, armrests, five wheels) he rides                      |
 * | Mega Meal (Mythic, gaps6)   | the evolving form round him: a slider patty ring, the double (bun, lettuce,      |
 * |                             | cheese), a three-patty tower, then five patties on a golden tray with flags      |
 *
 * Rules: render only (the sim, the replay and the hash never see it); hidden while the hero is dead, stealthed or not
 * drawn; Low keeps the parade (the Mythic's signature, at most 6 segments) and draws the ground trails only for the
 * player's own hero; a jump (recall, blink, respawn) restarts the path instead of stretching a body across the map.
 */
import * as THREE from 'three';
import { PARADE_LOW_MAX, PARADE_SEGMENTS, PARADE_ULT_S, PARADE_ULT_SEGMENTS, PREVIEW_STAGE_S, paradeStage, trailPreview, type TrailKind } from './coatTrailData';
import { formGeometry, FORM_STAGES, type FormSize } from './coatForms';

export * from './coatTrailData';

const SEG_SPACING = 0.82;
const PATH_STEP = 0.12;
const PATH_MAX = 160;
const GROUND_MAX = 24;
const JUMP = 3;

const PAPER = new THREE.Color(0xe8302a);
const PAPER_DEEP = new THREE.Color(0xb01c1c);
const GOLD = new THREE.Color(0xf4c23a);
const GLOW = new THREE.Color(0xffe0a0);

/** One paper-lantern drum along +Z (gold rims, a scalloped fin on top), vertex coloured. Unit size ~0.5 m long. */
function segmentGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const colour = (g: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color): THREE.BufferGeometry => {
    const ng = g.index ? g.toNonIndexed() : g;
    const pos = ng.getAttribute('position');
    ng.computeVertexNormals();
    const nor = ng.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      const c = f(p, n);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return ng;
  };
  // the drum: an octagonal lantern with paper ribs, lit warm from inside at the middle
  const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.46, 8, 1, true).rotateX(Math.PI / 2);
  parts.push(colour(drum, (p) => (Math.abs(p.z) < 0.08 ? GLOW.clone().lerp(PAPER, 0.35) : Math.abs(p.z) > 0.19 ? PAPER_DEEP : PAPER)));
  for (const z of [-0.23, 0.23]) parts.push(colour(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, z), () => GOLD));
  // the fin: a gold paper scallop on top
  parts.push(colour(new THREE.ConeGeometry(0.12, 0.26, 3).scale(0.4, 1, 1.2).translate(0, 0.38, 0), () => GOLD));
  return mergeSimple(parts);
}

type GroundKind = 'stripes' | 'drips' | 'ketchup';
/** A flat ground strip (stripes) or puddle (drips, ketchup), facing up, unit size. */
function groundGeometry(kind: GroundKind): THREE.BufferGeometry {
  const g = kind === 'stripes' ? new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) : new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
  return g;
}

/** Merge non-indexed geometries with position, normal and color (no BufferGeometryUtils import in the game chunk). */
function mergeSimple(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of gs) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of gs) {
    const c = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

let SEG_GEO: THREE.BufferGeometry | null = null;
const GROUND_GEO: Partial<Record<GroundKind, THREE.BufferGeometry>> = {};

/** What a trail needs from its hero each frame. */
export interface TrailInput {
  x: number;
  z: number;
  /** Hidden this frame (dead, stealthed, not drawn). */
  hidden: boolean;
  level: number;
  takedowns: number;
  /** Seconds since the hero's ultimate (Infinity: none yet). */
  sinceUlt: number;
  self: boolean;
  low: boolean;
  moving: boolean;
  /** The hero's facing (rad, 0 = +x, counter-clockwise from above: ViewEntity.yaw). */
  yaw: number;
}

const isForm = (k: TrailKind): k is 'board' | 'tower' => k === 'board' || k === 'tower';


/** One hero's trail. */
export class CoatTrail {
  readonly mesh: THREE.InstancedMesh;
  readonly kind: TrailKind;
  /** The parade's evolving stage (1..4; 0 for the ground trails). */
  stage = 0;
  /** Segments drawn this frame (tests, e2e). */
  shown = 0;
  /** Set by the owner: called once when the parade reaches a new stage (not on first sight). */
  onStage: ((stage: number, x: number, z: number) => void) | null = null;
  private readonly px = new Float32Array(PATH_MAX);
  private readonly pz = new Float32Array(PATH_MAX);
  private head = 0;
  private count = 0;
  private lastX = NaN;
  private lastZ = NaN;
  private time = 0;
  /** The drawn segment count, eased toward the target (new segments grow in). */
  private grow = 0;
  // ground trails: a ring of placed decals (x, z, yaw, born)
  private readonly gx = new Float32Array(GROUND_MAX);
  private readonly gz = new Float32Array(GROUND_MAX);
  private readonly gy = new Float32Array(GROUND_MAX);
  private readonly gt = new Float32Array(GROUND_MAX).fill(-1e9);
  private gi = 0;
  private sinceDrop = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  /** gaps6 evolving forms: one geometry per stage (index 1..4; null = nothing at that stage). */
  private readonly forms: (THREE.BufferGeometry | null)[] = [];

  constructor(kind: TrailKind, size: FormSize = { h: 2.6, r: 2.2 }) {
    this.kind = kind;
    if (isForm(kind)) {
      for (let st = 0; st <= FORM_STAGES; st++) this.forms.push(st ? formGeometry(kind, st, size) : null);
      this.mesh = new THREE.InstancedMesh(this.forms[1] ?? this.forms[FORM_STAGES]!, new THREE.MeshLambertMaterial({ vertexColors: true }), 1);
      this.mesh.castShadow = false;
    } else if (kind === 'parade') {
      SEG_GEO ??= segmentGeometry();
      this.mesh = new THREE.InstancedMesh(SEG_GEO, new THREE.MeshLambertMaterial({ vertexColors: true }), PARADE_ULT_SEGMENTS);
      this.mesh.castShadow = false;
    } else {
      const geo = (GROUND_GEO[kind as GroundKind] ??= groundGeometry(kind as GroundKind));
      const color = kind === 'stripes' ? 0xd8ffb0 : kind === 'ketchup' ? 0xd8202a : 0xfff0d8;
      this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'stripes' ? 0.32 : kind === 'ketchup' ? 0.8 : 0.75, depthWrite: false }), GROUND_MAX);
      this.mesh.renderOrder = -1;
    }
    this.mesh.name = `coat-trail-${kind}`;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Restart the path at (x, z) (a jump: recall, blink, respawn). */
  private reset(x: number, z: number): void {
    this.head = 0;
    this.count = 1;
    this.px[0] = x;
    this.pz[0] = z;
    this.lastX = x;
    this.lastZ = z;
    this.grow = Math.min(this.grow, 0);
  }

  /**
   * The point `d` metres back along the path into `out` (x, z) and the heading there. Past the walked path's end the
   * body runs on straight behind it (the last step's direction, or behind the hero's facing when he has not moved), so
   * a hero standing still still wears his whole parade.
   */
  private along(d: number, out: { x: number; z: number; yaw: number }, facing: number): void {
    let left = d;
    let i = this.head;
    let x = this.px[i];
    let z = this.pz[i];
    for (let k = 1; k < this.count; k++) {
      const j = (i - 1 + PATH_MAX) % PATH_MAX;
      const nx = this.px[j];
      const nz = this.pz[j];
      const seg = Math.hypot(nx - x, nz - z);
      if (seg >= left && seg > 1e-6) {
        const t = left / seg;
        out.x = x + (nx - x) * t;
        out.z = z + (nz - z) * t;
        out.yaw = Math.atan2(x - nx, z - nz);
        return;
      }
      left -= seg;
      x = nx;
      z = nz;
      i = j;
    }
    // the path's end: carry on in the last step's direction (away from the hero), else straight behind his facing
    let dx = -Math.cos(facing);
    let dz = Math.sin(facing);
    if (this.count >= 2) {
      const j = (i + 1) % PATH_MAX;
      const l = Math.hypot(x - this.px[j], z - this.pz[j]);
      if (l > 1e-6) {
        dx = (x - this.px[j]) / l;
        dz = (z - this.pz[j]) / l;
      }
    }
    out.x = x + dx * left;
    out.z = z + dz * left;
    out.yaw = Math.atan2(-dx, -dz);
  }

  private readonly at = { x: 0, z: 0, yaw: 0 };

  update(dt: number, h: TrailInput): void {
    this.time += dt;
    if (this.kind === 'parade') this.parade(dt, h);
    else if (isForm(this.kind)) this.form(h);
    else this.ground(h);
  }

  /** gaps6: the evolving form round the hero, its geometry the stage's (Evolve preview cycles them). */
  private form(h: TrailInput): void {
    const stage = trailPreview() ? 1 + (Math.floor(this.time / PREVIEW_STAGE_S) % 4) : paradeStage(h.level, h.takedowns);
    if (this.stage > 0 && stage > this.stage) this.onStage?.(stage, h.x, h.z);
    this.stage = stage;
    const geo = this.forms[stage];
    if (h.hidden || !geo) {
      this.mesh.count = 0;
      this.shown = 0;
      return;
    }
    if (this.mesh.geometry !== geo) this.mesh.geometry = geo;
    // a little bob (the chair rolls, the tower wobbles) and his facing
    const bob = this.kind === 'board' ? Math.sin(this.time * 2.4) * 0.03 : Math.abs(Math.sin(this.time * 5)) * (h.moving ? 0.05 : 0.015);
    this.v.set(h.x, bob, h.z);
    this.e.set(0, h.yaw, this.kind === 'tower' && h.moving ? Math.sin(this.time * 7) * 0.025 : 0);
    this.q.setFromEuler(this.e);
    this.s.setScalar(1);
    this.m.compose(this.v, this.q, this.s);
    this.mesh.setMatrixAt(0, this.m);
    this.mesh.count = 1;
    this.shown = 1;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private parade(dt: number, h: TrailInput): void {
    const previewCycle = trailPreview();
    const stage = previewCycle ? 1 + (Math.floor(this.time / PREVIEW_STAGE_S) % 4) : paradeStage(h.level, h.takedowns);
    if (this.stage > 0 && stage > this.stage) this.onStage?.(stage, h.x, h.z);
    this.stage = stage;
    if (h.hidden) {
      this.mesh.count = 0;
      this.shown = 0;
      this.lastX = NaN;
      return;
    }
    if (!(this.lastX === this.lastX) || Math.hypot(h.x - this.lastX, h.z - this.lastZ) > JUMP) this.reset(h.x, h.z);
    else if (Math.hypot(h.x - this.px[this.head], h.z - this.pz[this.head]) >= PATH_STEP) {
      this.head = (this.head + 1) % PATH_MAX;
      this.px[this.head] = h.x;
      this.pz[this.head] = h.z;
      this.count = Math.min(PATH_MAX, this.count + 1);
    }
    this.lastX = h.x;
    this.lastZ = h.z;
    let want = h.sinceUlt < PARADE_ULT_S && !previewCycle ? PARADE_ULT_SEGMENTS : PARADE_SEGMENTS[stage];
    if (h.low) want = Math.min(want, PARADE_LOW_MAX);
    this.grow += Math.max(-dt * 6, Math.min(dt * 4, want - this.grow));
    let n = 0;
    const full = Math.floor(this.grow);
    const part = this.grow - full;
    for (let i = 0; i < Math.ceil(this.grow) && i < PARADE_ULT_SEGMENTS; i++) {
      // the first segment sits right behind his bun
      this.along(1 + i * SEG_SPACING, this.at, h.yaw);
      const k = i < full ? 1 : part;
      // the tail tapers; a festival bounce runs down the body
      const taper = 1 - Math.max(0, i - 6) * 0.06;
      const bob = Math.sin(this.time * 6 - i * 0.8) * 0.09;
      this.v.set(this.at.x, 0.82 + bob + (h.moving ? 0.05 : 0), this.at.z);
      this.e.set(Math.sin(this.time * 3 - i) * 0.08, this.at.yaw, Math.sin(this.time * 4 - i * 0.6) * 0.1);
      this.q.setFromEuler(this.e);
      this.s.setScalar(k * taper * 1.65);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.shown = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  private ground(h: TrailInput): void {
    const life = this.kind === 'stripes' ? 3.2 : this.kind === 'ketchup' ? 2.8 : 2.4;
    const step = this.kind === 'stripes' ? 0.55 : this.kind === 'ketchup' ? 0.7 : 0.85;
    const on = !h.hidden && (h.self || !h.low);
    if (on && h.moving) {
      if (!(this.lastX === this.lastX) || Math.hypot(h.x - this.lastX, h.z - this.lastZ) > JUMP) {
        this.lastX = h.x;
        this.lastZ = h.z;
      }
      const d = Math.hypot(h.x - this.lastX, h.z - this.lastZ);
      this.sinceDrop += d;
      if (this.sinceDrop >= step) {
        this.sinceDrop = 0;
        const i = this.gi;
        this.gi = (this.gi + 1) % GROUND_MAX;
        this.gx[i] = h.x;
        this.gz[i] = h.z;
        this.gy[i] = Math.atan2(h.x - this.lastX, h.z - this.lastZ);
        this.gt[i] = this.time;
      }
    }
    this.lastX = h.x;
    this.lastZ = h.z;
    let n = 0;
    for (let i = 0; i < GROUND_MAX; i++) {
      const age = this.time - this.gt[i];
      if (age < 0 || age > life) continue;
      const k = 1 - age / life;
      this.v.set(this.gx[i], 0.03 + i * 0.0004, this.gz[i]);
      this.e.set(0, this.gy[i], 0);
      this.q.setFromEuler(this.e);
      if (this.kind === 'stripes') this.s.set(1.1 * Math.min(1, k * 1.6), 1, 0.7);
      else this.s.set(0.7 * k + 0.1, 1, 0.55 * k + 0.1);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.shown = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    (this.mesh.material as THREE.Material).dispose();
    // InstancedMesh.dispose keeps the geometry (the shared segment and ground ones); the form geometries are this trail's
    for (const g of this.forms) g?.dispose();
    this.mesh.dispose();
  }
}
