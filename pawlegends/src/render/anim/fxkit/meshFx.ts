/**
 * Mesh skill effects (ANIM-SPEC §7): InstancedMesh pools on one shared material, one draw per pool (ground quads,
 * vertical cylinders, domes). Ground spectacle draws at renderOrder 2 and vertical meshes at 4–6, under the
 * telegraphs' 3 / 8 / 10 orders' readability rules (§9); no depth write. Per-kind caps follow the quality tier
 * (§10: Low has no twister, curtain or chain; particles stand in). Pooled, swap-removed: no allocation per frame.
 */
import * as THREE from 'three';
import { FX_KIND, fxMaterial, fxUniforms, type FxUniforms } from './fxMaterial';
import type { MeshFxKind, MeshFxLike, MeshFxSpawn, Relation3 } from '../types';

type Tier = 'low' | 'med' | 'high';
type PoolName = 'ground' | 'vertical' | 'dome';

/** Max live instances per kind and tier (§10 table; High = Med × 1.5). */
export const MESH_CAPS: Readonly<Record<Tier, Readonly<Record<MeshFxKind, number>>>> = Object.freeze({
  low: { crescent: 6, arc: 6, ring: 4, dome: 4, wall: 0, beam: 2, pillar: 4, twister: 0, curtain: 0, heart: 2, chain: 0, meteor: 1, glow: 4 },
  med: { crescent: 12, arc: 12, ring: 8, dome: 4, wall: 3, beam: 4, pillar: 16, twister: 3, curtain: 2, heart: 3, chain: 2, meteor: 2, glow: 8 },
  high: { crescent: 18, arc: 18, ring: 12, dome: 6, wall: 5, beam: 6, pillar: 24, twister: 5, curtain: 3, heart: 5, chain: 3, meteor: 3, glow: 12 },
});

const POOL_OF: Readonly<Record<MeshFxKind, PoolName>> = Object.freeze({
  crescent: 'ground',
  arc: 'ground',
  ring: 'ground',
  heart: 'ground',
  glow: 'ground',
  beam: 'ground',
  chain: 'ground',
  meteor: 'ground',
  dome: 'dome',
  wall: 'vertical',
  pillar: 'vertical',
  twister: 'vertical',
  curtain: 'vertical',
});
/** Kinds drawn as a quad along +x (length sx, width sz) instead of centred (radius sx). */
const ALONG = new Set<MeshFxKind>(['beam', 'chain', 'meteor']);
const REL = { own: 0, ally: 1, enemy: 2 } as const;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

/** One instanced pool. */
export class FxPool {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  readonly cap: number;
  private readonly life: Float32Array;
  private readonly age: Float32Array;
  private readonly delay: Float32Array;
  readonly kindOf: Uint8Array;
  private readonly aKind: THREE.InstancedBufferAttribute;
  private readonly aT: THREE.InstancedBufferAttribute;
  private readonly aAlpha: THREE.InstancedBufferAttribute;
  private readonly aSeed: THREE.InstancedBufferAttribute;
  private readonly aRel: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aRim: THREE.InstancedBufferAttribute;
  private readonly aParams: THREE.InstancedBufferAttribute;
  /** Projected area (m²) per instance for the coverage budget. */
  readonly area: Float32Array;
  readonly relOf: Uint8Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, name: string, order: number) {
    this.cap = cap;
    const g = geo;
    const attr = (size: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aKind = attr(1);
    this.aT = attr(1);
    this.aAlpha = attr(1);
    this.aSeed = attr(1);
    this.aRel = attr(1);
    this.aColor = attr(3);
    this.aRim = attr(3);
    this.aParams = attr(4);
    g.setAttribute('aKind', this.aKind);
    g.setAttribute('aT', this.aT);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aSeed', this.aSeed);
    g.setAttribute('aRel', this.aRel);
    g.setAttribute('aColor', this.aColor);
    g.setAttribute('aRim', this.aRim);
    g.setAttribute('aParams', this.aParams);
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.life = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.delay = new Float32Array(cap);
    this.kindOf = new Uint8Array(cap);
    this.area = new Float32Array(cap);
    this.relOf = new Uint8Array(cap);
    this.attrs = [this.aKind, this.aT, this.aAlpha, this.aSeed, this.aRel, this.aColor, this.aRim, this.aParams];
  }

  spawn(kind: number, m: THREE.Matrix4, o: MeshFxSpawn, area: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.mesh.setMatrixAt(i, m);
    this.life[i] = Math.max(0.02, o.life);
    this.age[i] = 0;
    this.delay[i] = o.delay ?? 0;
    this.kindOf[i] = kind;
    this.area[i] = area;
    this.relOf[i] = REL[o.rel];
    this.aKind.setX(i, kind);
    this.aT.setX(i, 0);
    this.aAlpha.setX(i, this.delay[i] > 0 ? 0 : 1);
    this.aSeed.setX(i, Math.random());
    this.aRel.setX(i, REL[o.rel]);
    _c.setHex(o.color);
    this.aColor.setXYZ(i, _c.r, _c.g, _c.b);
    _c.setHex(o.rim);
    this.aRim.setXYZ(i, _c.r, _c.g, _c.b);
    this.aParams.setXYZW(i, o.p0 ?? 0, o.p1 ?? 0, o.p2 ?? 0, o.p3 ?? 1);
    return i;
  }

  private copy(from: number, to: number): void {
    this.mesh.getMatrixAt(from, _m);
    this.mesh.setMatrixAt(to, _m);
    this.life[to] = this.life[from];
    this.age[to] = this.age[from];
    this.delay[to] = this.delay[from];
    this.kindOf[to] = this.kindOf[from];
    this.area[to] = this.area[from];
    this.relOf[to] = this.relOf[from];
    const list = this.attrs;
    for (let a = 0; a < list.length; a++) {
      const at = list[a];
      const s = at.itemSize;
      const arr = at.array as Float32Array;
      for (let c = 0; c < s; c++) arr[to * s + c] = arr[from * s + c];
    }
  }

  update(dt: number): void {
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      const t = this.age[i] - this.delay[i];
      if (t >= this.life[i]) {
        this.n--;
        if (i !== this.n) this.copy(this.n, i);
        continue;
      }
      this.aT.setX(i, t > 0 ? t / this.life[i] : 0);
      this.aAlpha.setX(i, t >= 0 ? 1 : 0);
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aKind.needsUpdate = this.aT.needsUpdate = this.aAlpha.needsUpdate = this.aSeed.needsUpdate = true;
      this.aRel.needsUpdate = this.aColor.needsUpdate = this.aRim.needsUpdate = this.aParams.needsUpdate = true;
    }
  }

  liveOf(kind: number): number {
    let n = 0;
    for (let i = 0; i < this.n; i++) if (this.kindOf[i] === kind) n++;
    return n;
  }

  /** Projected area of own (rel 0/1) or enemy effects. */
  areaOf(enemy: boolean): number {
    let a = 0;
    for (let i = 0; i < this.n; i++) if ((this.relOf[i] === 2) === enemy) a += this.area[i] * (1 - this.age[i] / Math.max(1e-3, this.life[i] + this.delay[i]));
    return a;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

export class MeshFx implements MeshFxLike {
  readonly group = new THREE.Group();
  readonly uniforms: FxUniforms = fxUniforms();
  private readonly mat: THREE.ShaderMaterial;
  readonly pools: Record<PoolName, FxPool>;
  tier: Tier = 'med';
  reduced = false;

  constructor() {
    this.group.name = 'mesh-fx';
    this.mat = fxMaterial(this.uniforms, 'add');
    const ground = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
    const dome = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.pools = {
      ground: new FxPool(ground, this.mat, 48, 'fx-ground', 2),
      vertical: new FxPool(cyl, this.mat, 32, 'fx-vertical', 5),
      dome: new FxPool(dome, this.mat, 8, 'fx-dome', 4),
    };
    this.group.add(this.pools.ground.mesh, this.pools.vertical.mesh, this.pools.dome.mesh);
  }

  /** Spawn one effect. Returns its index, or −1 when the tier's cap for the kind is reached. */
  spawn(kind: MeshFxKind, o: MeshFxSpawn): number {
    const cap = MESH_CAPS[this.tier][kind];
    const k = FX_KIND[kind];
    const pool = this.pools[POOL_OF[kind]];
    if (cap <= 0 || pool.liveOf(k) >= cap) return -1;
    const yaw = o.yaw ?? 0;
    const y = o.y ?? 0.06;
    _q.setFromAxisAngle(_up, yaw);
    let area: number;
    if (ALONG.has(kind)) {
      const len = o.sx;
      const w = o.sz ?? 1;
      _p.set(o.x + Math.cos(yaw) * len * 0.5, y, o.z - Math.sin(yaw) * len * 0.5);
      _s.set(len, 1, w);
      area = len * w;
    } else if (POOL_OF[kind] === 'ground') {
      _p.set(o.x, y, o.z);
      _s.set(o.sx * 2, 1, o.sx * 2);
      area = Math.PI * o.sx * o.sx * (kind === 'crescent' || kind === 'arc' ? Math.min(1, (o.p0 ?? 6.28) / 6.28) : 1);
    } else {
      _p.set(o.x, y, o.z);
      _s.set(o.sx, o.sy ?? 1, o.sz ?? o.sx);
      area = 2 * o.sx * (o.sy ?? 1);
    }
    _m.compose(_p, _q, _s);
    return pool.spawn(k, _m, o, area);
  }

  /** Projected additive area (m²) of own / ally vs enemy effects (the coverage budget, readability.ts). */
  area(enemy: boolean): number {
    return this.pools.ground.areaOf(enemy) + this.pools.vertical.areaOf(enemy) + this.pools.dome.areaOf(enemy);
  }

  update(dt: number, time: number): void {
    // reduce motion: the scrolling patterns (twisters, curtains, beams) stand still
    if (!this.reduced) this.uniforms.uTime.value = time;
    this.pools.ground.update(dt);
    this.pools.vertical.update(dt);
    this.pools.dome.update(dt);
  }

  live(): number {
    return this.pools.ground.n + this.pools.vertical.n + this.pools.dome.n;
  }

  clear(): void {
    this.pools.ground.clear();
    this.pools.vertical.clear();
    this.pools.dome.clear();
  }

  dispose(): void {
    this.pools.ground.dispose();
    this.pools.vertical.dispose();
    this.pools.dome.dispose();
    this.mat.dispose();
  }
}

export type { Relation3 };
