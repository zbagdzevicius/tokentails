/**
 * Ribbons (ANIM-SPEC §7): pooled swing / dash trails in ONE BufferGeometry and one draw call, updated in place.
 * A ribbon follows two sockets (a blade's base and tip: a sword arc) or one point (a paw, a foot, the tail tip, or a
 * dash path fed from the snapshots, never the aim: D7), tapers its width and alpha toward the tail and fades by age.
 * Colour = the element core; the relation rim is the caller's choice of colour (a card tier may only tint). Slots per
 * tier: Low 0 (the slash decal stays), Med 6 × 16 samples, High 10 × 24; halved under reduce motion. Drawn below the
 * telegraphs (renderOrder 2), no depth write. No allocation per frame.
 */
import * as THREE from 'three';
import type { RibbonsLike } from './types';

export const RIBBON_TIER = Object.freeze({ low: { slots: 0, samples: 16 }, med: { slots: 6, samples: 16 }, high: { slots: 10, samples: 24 } });
const MAX_SLOTS = 12;
const MAX_S = 24;
const VERTS = MAX_SLOTS * MAX_S * 2;

const VERT = /* glsl */ `
attribute vec4 aCol;
attribute float aV;
varying vec4 vCol;
varying float vV;
void main() { vCol = aCol; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
varying vec4 vCol;
varying float vV;
void main() {
  float e = 1.0 - abs(vV * 2.0 - 1.0);
  float a = vCol.a * smoothstep(0.0, 0.5, e);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a * 1.4, a);
}`;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();

interface Slot {
  mode: 0 | 1 | 2;
  feeding: boolean;
  /** pair: base / tip sockets with local offsets; point: one socket or manual feed. */
  objA: THREE.Object3D | null;
  objB: THREE.Object3D | null;
  offA: THREE.Vector3;
  offB: THREE.Vector3;
  /** Samples (ring): A xyz, B xyz, age. */
  A: Float32Array;
  B: Float32Array;
  age: Float32Array;
  n: number;
  head: number;
  r: number;
  g: number;
  bl: number;
  width: number;
  life: number;
  lastX: number;
  lastY: number;
  lastZ: number;
}

export class Ribbons implements RibbonsLike {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(VERTS * 3);
  private readonly col = new Float32Array(VERTS * 4);
  private readonly slots: Slot[] = [];
  private tierSlots = RIBBON_TIER.med.slots;
  private tierSamples = RIBBON_TIER.med.samples;

  constructor() {
    const v = new Float32Array(VERTS);
    for (let i = 0; i < VERTS; i++) v[i] = i % 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aV', new THREE.BufferAttribute(v, 1));
    const idx: number[] = [];
    for (let s = 0; s < MAX_SLOTS; s++)
      for (let i = 0; i < MAX_S - 1; i++) {
        const o = (s * MAX_S + i) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending });
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneFactor;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'ribbons';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    for (let s = 0; s < MAX_SLOTS; s++)
      this.slots.push({
        mode: 0,
        feeding: false,
        objA: null,
        objB: null,
        offA: new THREE.Vector3(),
        offB: new THREE.Vector3(),
        A: new Float32Array(MAX_S * 3),
        B: new Float32Array(MAX_S * 3),
        age: new Float32Array(MAX_S),
        n: 0,
        head: 0,
        r: 1,
        g: 1,
        bl: 1,
        width: 0.3,
        life: 0.2,
        lastX: 0,
        lastY: 0,
        lastZ: 0,
      });
  }

  setTier(tier: 'low' | 'med' | 'high', reduced: boolean): void {
    const t = RIBBON_TIER[tier];
    this.tierSlots = reduced ? Math.floor(t.slots / 2) : t.slots;
    this.tierSamples = t.samples;
  }

  private take(color: number, width: number, life: number): number {
    for (let i = 0; i < this.tierSlots; i++) {
      const s = this.slots[i];
      if (s.mode !== 0) continue;
      _c.setHex(color);
      s.r = _c.r;
      s.g = _c.g;
      s.bl = _c.b;
      s.width = width;
      s.life = life;
      s.n = 0;
      s.head = 0;
      s.feeding = true;
      return i;
    }
    return -1;
  }

  /** A blade trail between two sockets (local offsets on each). */
  pair(a: THREE.Object3D, offA: THREE.Vector3, b: THREE.Object3D, offB: THREE.Vector3, color: number, life = 0.16): number {
    const i = this.take(color, 0, life);
    if (i < 0) return -1;
    const s = this.slots[i];
    s.mode = 2;
    s.objA = a;
    s.objB = b;
    s.offA.copy(offA);
    s.offB.copy(offB);
    return i;
  }

  /** A point trail (horizontal width): follows `obj` (+ offset), or is fed by `feed` when obj is null. */
  follow(obj: THREE.Object3D | null, off: THREE.Vector3 | null, color: number, width: number, life = 0.2): number {
    const i = this.take(color, width, life);
    if (i < 0) return -1;
    const s = this.slots[i];
    s.mode = 1;
    s.objA = obj;
    s.objB = null;
    if (off) s.offA.copy(off);
    else s.offA.set(0, 0, 0);
    return i;
  }

  point(src: { x: number; y: number; z: number }, color: number, width: number, life = 0.25): number {
    const i = this.follow(null, null, color, width, life);
    if (i >= 0) this.feed(i, src.x, src.y, src.z);
    return i;
  }

  feed(slot: number, x: number, y: number, z: number): void {
    const s = this.slots[slot];
    if (!s || s.mode !== 1 || !s.feeding) return;
    this.push(s, x, y, z, x, y, z);
  }

  end(slot: number): void {
    const s = this.slots[slot];
    if (s) s.feeding = false;
  }

  private push(s: Slot, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const cap = this.tierSamples;
    if (s.n > 0 && Math.abs(ax - s.lastX) + Math.abs(ay - s.lastY) + Math.abs(az - s.lastZ) < 0.015) {
      // not moved: refresh the head instead of stacking samples
      const h = (s.head + cap - 1) % cap;
      s.age[h] = 0;
      return;
    }
    const h = s.head;
    s.A[h * 3] = ax;
    s.A[h * 3 + 1] = ay;
    s.A[h * 3 + 2] = az;
    s.B[h * 3] = bx;
    s.B[h * 3 + 1] = by;
    s.B[h * 3 + 2] = bz;
    s.age[h] = 0;
    s.head = (h + 1) % cap;
    if (s.n < cap) s.n++;
    s.lastX = ax;
    s.lastY = ay;
    s.lastZ = az;
  }

  update(dt: number): void {
    const cap = this.tierSamples;
    let any = false;
    for (let si = 0; si < MAX_SLOTS; si++) {
      const s = this.slots[si];
      const base = si * MAX_S * 2;
      if (s.mode === 0) {
        this.blank(base);
        continue;
      }
      if (s.feeding && s.objA) {
        s.objA.updateWorldMatrix(true, false);
        _a.copy(s.offA).applyMatrix4(s.objA.matrixWorld);
        if (s.mode === 2 && s.objB) {
          s.objB.updateWorldMatrix(true, false);
          _b.copy(s.offB).applyMatrix4(s.objB.matrixWorld);
        } else _b.copy(_a);
        this.push(s, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
      }
      let alive = 0;
      for (let k = 0; k < s.n; k++) {
        s.age[k] += dt;
        if (s.age[k] < s.life) alive++;
      }
      if (alive === 0 && !s.feeding) {
        s.mode = 0;
        s.objA = s.objB = null;
        this.blank(base);
        continue;
      }
      any = true;
      // oldest → newest
      for (let j = 0; j < MAX_S; j++) {
        const v = (base + j * 2) * 3;
        const c = (base + j * 2) * 4;
        if (j >= s.n) {
          this.col[c + 3] = this.col[c + 7] = 0;
          // collapse onto the newest sample so no stretched triangle shows
          continue;
        }
        const k = (s.head - s.n + j + cap * 2) % cap;
        const life = 1 - s.age[k] / s.life;
        const taper = (j + 1) / s.n;
        const a = Math.max(0, life) * taper;
        let ax = s.A[k * 3];
        let ay = s.A[k * 3 + 1];
        let az = s.A[k * 3 + 2];
        let bx = s.B[k * 3];
        let by = s.B[k * 3 + 1];
        let bz = s.B[k * 3 + 2];
        if (s.mode === 1) {
          // horizontal width across the path direction
          const k2 = j + 1 < s.n ? (k + 1) % cap : (k + cap - 1) % cap;
          let dx = s.A[k2 * 3] - ax;
          let dz = s.A[k2 * 3 + 2] - az;
          if (j + 1 >= s.n) (dx = -dx), (dz = -dz);
          const l = Math.hypot(dx, dz) || 1;
          const w = s.width * 0.5 * (0.3 + 0.7 * taper);
          const nx = (-dz / l) * w;
          const nz = (dx / l) * w;
          bx = ax - nx;
          by = ay;
          bz = az - nz;
          ax += nx;
          az += nz;
        }
        this.pos[v] = ax;
        this.pos[v + 1] = ay;
        this.pos[v + 2] = az;
        this.pos[v + 3] = bx;
        this.pos[v + 4] = by;
        this.pos[v + 5] = bz;
        this.col[c] = this.col[c + 4] = s.r;
        this.col[c + 1] = this.col[c + 5] = s.g;
        this.col[c + 2] = this.col[c + 6] = s.bl;
        this.col[c + 3] = this.col[c + 7] = a;
      }
      // unused tail samples sit on the oldest one
      if (s.n > 0 && s.n < MAX_S) {
        const v0 = base * 3;
        for (let j = s.n; j < MAX_S; j++) {
          const v = (base + j * 2) * 3;
          for (let e = 0; e < 6; e++) this.pos[v + e] = this.pos[v0 + (s.n - 1) * 6 + e];
        }
      }
    }
    this.mesh.visible = any;
    if (any) {
      (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('aCol') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private blank(base: number): void {
    const c0 = base * 4;
    if (this.col[c0 + 3] === 0 && this.col[c0 + 7] === 0) return;
    for (let j = 0; j < MAX_S * 2; j++) this.col[c0 + j * 4 + 3] = 0;
  }

  /** Live slots (tests: constant pool). */
  live(): number {
    let n = 0;
    for (const s of this.slots) if (s.mode !== 0) n++;
    return n;
  }

  get poolSize(): number {
    return this.slots.length;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
