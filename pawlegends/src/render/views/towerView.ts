/**
 * Structures and objectives: towers, cores, fountains, rat camp monsters and Pudding. Towers flash and shudder when
 * hit, show a shimmer while invulnerable and a dashed range ring when the player's hero walks near an enemy tower;
 * a destroyed structure leaves rubble. Render only.
 *
 * Weight: a shooting tower or core charges before each shot (a glow and a crouch over the last 40% of its 1 s period,
 * or over a lock-on windup), and fires with a recoil (a stretch that rings out) and a muzzle burst on the frame its
 * bolt appears. A falling tower cracks (a flash, a swell and a shudder), topples over its base edge like a felled tree
 * (gravity, a bounce on the ground), throws chunks of its walls and roof and breaks up into rubble along the line it
 * fell on (1.1 s). A falling core bursts on the killing blow (a ring of chunks), caves in on itself and settles (1.3 s; its slow
 * motion runs over it). Chunks are a pooled instanced mesh (fewer on lower quality tiers, none with reduce motion).
 * Nothing allocates per frame.
 */
import * as THREE from 'three';
import { CORE_STATS, TOWERS } from '../../data/towers';
import { BuffFlag } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { RELATION } from '../palette';
import { DecalLayer, dashRingTexture } from './decals';
import { coreGeometry, fountainGeometry, puddingGeometry, ratGeometry, towerGeometry } from './models';
import { rigMaterial, type RigUniforms } from './rig';

interface Structure {
  id: number;
  kind: ViewEntity['kind'];
  mesh: THREE.Mesh;
  rig: RigUniforms;
  material: THREE.MeshLambertMaterial;
  flash: number;
  shake: number;
  hpFrac: number;
  bubble: THREE.Mesh | null;
  phase: number;
  x: number;
  z: number;
  alive: boolean;
  /** Last shot (render s), a lock-on windup (start, length s), the fall clock (s, −1 = standing). */
  shotAt: number;
  lockAt: number;
  lockLen: number;
  dieT: number;
  /** Tilt direction for the fall (rad about the vertical), the structure height (m). */
  fallDir: number;
  height: number;
  /** The fall's ground impact (tower) or burst (core) has thrown its chunks. */
  impacted: boolean;
  team: number;
  stamp: number;
}

/** Shot rhythm (s) and the charge / recoil / fall shapes. */
export const STRUCT_ANIM = Object.freeze({ period: TOWERS.outer.attackEvery / 30, corePeriod: CORE_STATS.attackEvery / 30, chargeFrom: 0.6, crouch: 0.05, glow: 0.4, recoil: 0.08, fallTower: 1.1, fallCore: 1.3 });

/**
 * The fall's shape (fractions of the fall). Tower: crack until `crack`, topple (gravity) until `hit`, a bounce until
 * `settle`, then the break-up. Core: swell until `burst`, cave in until `caved`, then settle into the ground.
 */
export const FALL_SHAPE = Object.freeze({ crack: 0.12, hit: 0.6, settle: 0.7, topple: 1.42, bounce: 0.12, burst: 0.05, caved: 0.45 });

/** Chunks thrown by a fall: pool size, per tower / core at full quality, gravity (m/s²), life (s). */
const DEBRIS = Object.freeze({ pool: 48, tower: 16, core: 26, gravity: 22, life: 1.5 });

const TOWER_RANGE_M = Math.max(TOWERS.outer.range, TOWERS.inner.range) / 1000;
/**
 * X-ray: a tower or core fades while a hero stands in the patch it hides on screen. The camera looks north (−Z)
 * from the south, so a tall structure covers the ground just north of it.
 */
const COVER = Object.freeze({ halfWidth: 1.9, north: 5.5, south: 0.6, opacity: 0.32 });

/** Chunk colours per side (walls, trim, roof) and scratch objects (no per-frame allocation). */
const DEBRIS_CAT = [0xf3ead8, 0xe6d6b8, 0xff6f91, 0xc94a72, 0xffd27a];
const DEBRIS_DOG = [0x6f84b5, 0x3d5a9e, 0x26396b, 0xd9a441, 0x52679a];
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Kinds this view draws (heroes, minions and pickups have their own views; an unknown kind is skipped). */
const STRUCTURE_KINDS: ReadonlySet<string> = new Set(['tower', 'core', 'fountain', 'camp', 'pudding']);

export class StructureView {
  readonly group = new THREE.Group();
  private items = new Map<number, Structure>();
  private rubble: THREE.Mesh[] = [];
  private bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
  private bubbleMat = new THREE.MeshBasicMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  private rubbleMat = new THREE.MeshLambertMaterial({ color: 0x9a8f80 });
  private ranges = new DecalLayer(dashRingTexture(), 8, { additive: true, y: 0.06, name: 'tower-ranges' });
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private time = 0;
  private stamp = 0;
  /** Projectile owner / last-seen stamp per pool index (a new bolt from a tower or core is its shot). */
  private readonly projOwner = new Int32Array(512);
  private readonly projStamp = new Int32Array(512);
  /** Reduce motion: no tilt or sink, a short fade of the fall; no crouch / recoil. */
  reduced = false;
  /** A tower / core shot left at (x, y, z) m (gameView: the muzzle burst). */
  onShot: ((x: number, y: number, z: number, team: number) => void) | null = null;
  /** A fall finished at (x, z) (gameView: the dust settling). */
  onFallen: ((x: number, z: number, core: boolean) => void) | null = null;
  /**
   * A falling tower hit the ground (along the line from (x, z) toward (dx, dz) over `len` m), or a core burst at
   * (x, z) (len 0) (gameView: dust along the line, a shockwave, a kick).
   */
  onImpact: ((x: number, z: number, dx: number, dz: number, len: number, core: boolean) => void) | null = null;
  /** Share of the chunks a fall throws (quality tier: 1 high, 0.6 med, 0.35 low); 0 = none. */
  debris = 1;
  private debrisMesh: THREE.InstancedMesh;
  private debrisLive = 0;
  /** Per chunk: position, velocity, rotation, spin (xyz each), size, age, life. */
  private readonly dP = new Float32Array(DEBRIS.pool * 3);
  private readonly dV = new Float32Array(DEBRIS.pool * 3);
  private readonly dR = new Float32Array(DEBRIS.pool * 3);
  private readonly dW = new Float32Array(DEBRIS.pool * 3);
  private readonly dS = new Float32Array(DEBRIS.pool);
  private readonly dAge = new Float32Array(DEBRIS.pool);
  private readonly dLife = new Float32Array(DEBRIS.pool);
  private dNext = 0;
  private rng = 0x2f6b1d;
  myTeam: 0 | 1 = 0;
  /** Round 2: team 0 is the dogs (the human picked a dog): each base wears the other team's style. */
  styleSwap = false;
  /** Player hero position (m) for the range rings; null when dead. */
  me: { x: number; z: number } | null = null;
  /** Hero positions (m) this frame, for the x-ray fade. */
  heroes: { x: number; z: number }[] = [];

  constructor() {
    this.group.name = 'structures';
    this.group.add(this.ranges.mesh);
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), DEBRIS.pool);
    this.debrisMesh.name = 'structure-debris';
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = true;
    for (let i = 0; i < DEBRIS.pool; i++) this.debrisMesh.setColorAt(i, _col.setHex(0xffffff));
    this.group.add(this.debrisMesh);
  }

  /** A deterministic 0..1 (render only: the chunks' spread). */
  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  /** Throw `n` chunks from points along (x, z) -> (x + dx·len, z + dz·len) at height y0..y1, in `colors`. */
  private throwChunks(n: number, x: number, z: number, dx: number, dz: number, len: number, y0: number, y1: number, colors: readonly number[], speed: number, size: number): void {
    const k = Math.round(n * Math.max(0, Math.min(1, this.debris)));
    for (let j = 0; j < k; j++) {
      const i = this.dNext;
      this.dNext = (this.dNext + 1) % DEBRIS.pool;
      const t = len > 0 ? this.rand() : 0;
      const a = this.rand() * Math.PI * 2;
      const o = i * 3;
      this.dP[o] = x + dx * len * t + Math.cos(a) * 0.4;
      this.dP[o + 1] = y0 + (y1 - y0) * this.rand();
      this.dP[o + 2] = z + dz * len * t + Math.sin(a) * 0.4;
      const sp = speed * (0.55 + this.rand() * 0.6);
      this.dV[o] = Math.cos(a) * sp + dx * sp * 0.3;
      this.dV[o + 1] = speed * (0.7 + this.rand() * 0.8);
      this.dV[o + 2] = Math.sin(a) * sp + dz * sp * 0.3;
      for (let c = 0; c < 3; c++) {
        this.dR[o + c] = this.rand() * 6.28;
        this.dW[o + c] = (this.rand() - 0.5) * 18;
      }
      this.dS[i] = size * (0.55 + this.rand() * 0.9);
      this.dAge[i] = 0;
      this.dLife[i] = DEBRIS.life * (0.75 + this.rand() * 0.5);
      this.debrisMesh.setColorAt(i, _col.setHex(colors[j % colors.length]));
    }
    if (k > 0) {
      this.debrisLive = DEBRIS.pool;
      if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    }
  }

  /** Chunks fly, tumble, bounce on the ground and shrink away at the end of their life. */
  private updateDebris(dt: number): void {
    if (this.debrisLive <= 0) return;
    let live = 0;
    for (let i = 0; i < DEBRIS.pool; i++) {
      const o = i * 3;
      if (this.dAge[i] >= this.dLife[i]) {
        _m4.makeScale(0, 0, 0);
        this.debrisMesh.setMatrixAt(i, _m4);
        continue;
      }
      live++;
      this.dAge[i] += dt;
      this.dV[o + 1] -= DEBRIS.gravity * dt;
      for (let c = 0; c < 3; c++) {
        this.dP[o + c] += this.dV[o + c] * dt;
        this.dR[o + c] += this.dW[o + c] * dt;
      }
      const s = this.dS[i];
      if (this.dP[o + 1] < s * 0.5) {
        // the ground: a damped bounce, friction, the tumble slows
        this.dP[o + 1] = s * 0.5;
        if (this.dV[o + 1] < 0) this.dV[o + 1] *= -0.32;
        this.dV[o] *= 0.6;
        this.dV[o + 2] *= 0.6;
        for (let c = 0; c < 3; c++) this.dW[o + c] *= 0.6;
      }
      const left = this.dLife[i] - this.dAge[i];
      const k = s * (left < 0.3 ? Math.max(0, left / 0.3) : 1);
      _e.set(this.dR[o], this.dR[o + 1], this.dR[o + 2]);
      _q.setFromEuler(_e);
      _v.set(this.dP[o], this.dP[o + 1], this.dP[o + 2]);
      _sv.set(k, k * 0.8, k);
      _m4.compose(_v, _q, _sv);
      this.debrisMesh.setMatrixAt(i, _m4);
    }
    this.debrisMesh.count = DEBRIS.pool;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (live === 0) {
      this.debrisLive = 0;
      this.debrisMesh.count = 0;
    }
  }

  private geo(e: ViewEntity): THREE.BufferGeometry {
    // round 2: the base looks like its species (a dog-picking human defends the bone-topped doghouse)
    const team = ((e.team === 1 ? 1 : 0) ^ (this.styleSwap ? 1 : 0)) as 0 | 1;
    const key = `${e.kind}:${team}:${e.variant ?? ''}`;
    let g = this.geoCache.get(key);
    if (!g) {
      switch (e.kind) {
        case 'tower':
          g = towerGeometry(team, e.variant === 'inner' ? 'inner' : 'outer');
          break;
        case 'core':
          g = coreGeometry(team);
          break;
        case 'fountain':
          g = fountainGeometry(team);
          break;
        case 'pudding':
          g = puddingGeometry();
          break;
        default:
          g = ratGeometry();
      }
      this.geoCache.set(key, g);
    }
    return g;
  }

  private ensure(e: ViewEntity): Structure {
    let s = this.items.get(e.id);
    if (!s) {
      const material = rigMaterial();
      const mesh = new THREE.Mesh(this.geo(e), material);
      mesh.name = `${e.kind}-${e.id}`;
      mesh.castShadow = e.kind !== 'fountain';
      mesh.receiveShadow = e.kind === 'fountain';
      // Woof structures face west, Purrhaven east.
      mesh.rotation.y = e.team === 1 ? Math.PI : 0;
      this.group.add(mesh);
      let bubble: THREE.Mesh | null = null;
      if (e.kind === 'tower' || e.kind === 'core') {
        bubble = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
        bubble.scale.setScalar(e.kind === 'core' ? 3.2 : 2.4);
        bubble.position.y = e.kind === 'core' ? 2.0 : 2.4;
        bubble.visible = false;
        mesh.add(bubble);
      }
      mesh.geometry.computeBoundingBox();
      const height = mesh.geometry.boundingBox ? mesh.geometry.boundingBox.max.y : 4;
      s = { id: e.id, kind: e.kind, mesh, rig: material.userData.rig, material, flash: 0, shake: 0, hpFrac: 1, bubble, phase: e.id, x: 0, z: 0, alive: true, shotAt: -99, lockAt: -99, lockLen: 0, dieT: -1, fallDir: (e.id * 2.39996) % (Math.PI * 2), height, team: e.team, stamp: 0, impacted: false };
      this.items.set(e.id, s);
    }
    return s;
  }

  /** Tower / core `id` fell (the sim's tower event, the core's death): its fall starts now, once. */
  fell(id: number): void {
    const s = this.items.get(id);
    if (!s || !s.alive || (s.kind !== 'tower' && s.kind !== 'core')) return;
    s.alive = false;
    s.dieT = 0;
    s.flash = 1;
    s.impacted = false;
    if (s.bubble) s.bubble.visible = false;
  }

  /** A lock-on windup on tower / core `id` for `seconds` (the charge builds over it). */
  windup(id: number, seconds: number): void {
    const s = this.items.get(id);
    if (!s || (s.kind !== 'tower' && s.kind !== 'core')) return;
    s.lockAt = this.time;
    s.lockLen = Math.max(0.05, seconds);
  }

  /** Charge 0..1 before the next shot (the lock-on windup, else the shot rhythm while it keeps shooting). */
  private charge(s: Structure): number {
    const lt = this.time - s.lockAt;
    if (lt >= 0 && lt < s.lockLen) return lt / s.lockLen;
    const P = s.kind === 'core' ? STRUCT_ANIM.corePeriod : STRUCT_ANIM.period;
    const f = (this.time - s.shotAt) / P;
    if (f < 0 || f > 1.6) return 0;
    const c = (f - STRUCT_ANIM.chargeFrom) / (1 - STRUCT_ANIM.chargeFrom);
    return c <= 0 ? 0 : c >= 1 ? 1 : c * c;
  }

  hit(id: number): void {
    const s = this.items.get(id);
    if (!s) return;
    s.flash = 0.8;
    s.shake = s.kind === 'camp' ? 1 : 0.6;
  }

  setShadows(on: boolean): void {
    for (const s of this.items.values()) s.mesh.castShadow = on && s.kind !== 'fountain';
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    const stamp = ++this.stamp;
    this.ranges.begin();
    // a new bolt owned by a tower or core is its shot (the recoil and muzzle burst on that frame)
    const ps = frame.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.index < 0 || p.index >= this.projOwner.length) continue;
      if (this.projStamp[p.index] !== stamp - 1 || this.projOwner[p.index] !== p.owner + 1) {
        const s = this.items.get(p.owner);
        if (s && s.alive && (s.kind === 'tower' || s.kind === 'core')) {
          s.shotAt = this.time;
          s.lockAt = -99;
          s.flash = Math.max(s.flash, 0.55);
          this.onShot?.(s.x, s.height * 0.85, s.z, s.team);
        }
      }
      this.projOwner[p.index] = p.owner + 1;
      this.projStamp[p.index] = stamp;
    }
    for (const e of frame.entities) {
      // pickups have their own view (views/pickupView.ts)
      if (!STRUCTURE_KINDS.has(e.kind)) continue;
      const s = this.ensure(e);
      s.stamp = stamp;
      if (s.dieT >= 0) continue;
      s.alive = true;
      s.mesh.visible = true;
      s.x = toX(e.fx);
      s.z = toZ(e.fy);
      s.hpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
      s.flash = Math.max(0, s.flash - dt * 5);
      s.shake = Math.max(0, s.shake - dt * 4);
      const jx = Math.sin(this.time * 70) * s.shake * 0.08;
      if (e.kind === 'camp') {
        s.phase += dt * (e.speed > 3 ? 12 : 2);
        s.mesh.position.set(s.x, Math.abs(Math.sin(s.phase)) * 0.08, s.z);
        s.mesh.rotation.y = e.yaw;
        s.mesh.scale.setScalar(1.3);
      } else if (e.kind === 'pudding') {
        const w = Math.sin(this.time * 3.1);
        s.mesh.position.set(s.x, 0, s.z);
        s.mesh.rotation.y = e.yaw;
        s.mesh.scale.set(1 + w * 0.04 + s.shake * 0.1, 1 - w * 0.05 - s.shake * 0.12, 1 + w * 0.04 + s.shake * 0.1);
      } else {
        s.mesh.position.set(s.x + jx, 0, s.z);
        if (e.kind === 'tower' || e.kind === 'core') {
          // charge (a crouch and a glow) and the recoil that rings out after a shot
          const c = this.charge(s);
          const ts = this.time - s.shotAt;
          const rec = this.reduced || ts > 0.6 ? 0 : Math.exp(-ts * 9) * Math.cos(ts * 28) * STRUCT_ANIM.recoil;
          const sy = 1 - (this.reduced ? 0 : c * STRUCT_ANIM.crouch) + rec;
          const sx = 1 / Math.sqrt(sy);
          s.mesh.scale.set(sx, sy, sx);
          s.flash = Math.max(s.flash, c * STRUCT_ANIM.glow);
        }
      }
      if (e.kind === 'tower' || e.kind === 'core') {
        const scale = e.kind === 'core' ? 1.6 : 1;
        const hides = this.heroes.some(
          (h) => Math.abs(h.x - s.x) < COVER.halfWidth * scale && s.z - h.z < COVER.north * scale && s.z - h.z > -COVER.south,
        );
        const want = hides ? COVER.opacity : 1;
        const u = s.rig.uOpacity;
        u.value += (want - u.value) * Math.min(1, dt * 10);
        if (Math.abs(u.value - want) < 0.01) u.value = want;
        const transparent = u.value < 0.999;
        if (s.material.transparent !== transparent) {
          s.material.transparent = transparent;
          s.material.depthWrite = !transparent;
          s.material.needsUpdate = true;
        }
      }
      s.rig.uFlashK.value = s.flash * 0.7;
      s.rig.uTime.value = this.time;
      if (s.bubble) s.bubble.visible = (e.buffs & BuffFlag.Invulnerable) !== 0;
      if (s.bubble?.visible) s.bubble.scale.setScalar((s.kind === 'core' ? 3.2 : 2.4) * (1 + Math.sin(this.time * 3) * 0.02));
      if (e.kind === 'tower' && e.team !== this.myTeam && this.me) {
        const d = Math.hypot(this.me.x - s.x, this.me.z - s.z);
        if (d < TOWER_RANGE_M + 4) {
          const a = Math.min(1, (TOWER_RANGE_M + 4 - d) / 3);
          this.ranges.add(s.x, s.z, TOWER_RANGE_M * 2, RELATION.danger, 0.55 * a);
        }
      }
    }
    for (const [id, s] of this.items) {
      if (s.dieT >= 0) {
        this.fall(s, dt);
        continue;
      }
      if (s.stamp === stamp || !s.alive) continue;
      s.alive = false;
      if (s.kind === 'tower' || s.kind === 'core') {
        // the fall plays out before the rubble is left
        s.dieT = 0;
        s.flash = 1;
        s.impacted = false;
        if (s.bubble) s.bubble.visible = false;
        continue;
      }
      s.mesh.visible = false;
      if (s.kind === 'camp' || s.kind === 'pudding') {
        this.items.delete(id);
        s.material.dispose();
        this.group.remove(s.mesh);
      }
    }
    this.ranges.end();
    this.updateDebris(dt);
  }

  /** A tower or core falling (see the header); the rubble at the end. */
  private fall(s: Structure, dt: number): void {
    const core = s.kind === 'core';
    const L = core ? STRUCT_ANIM.fallCore : STRUCT_ANIM.fallTower;
    s.dieT += dt;
    const u = Math.min(1, s.dieT / L);
    const dx = Math.cos(s.fallDir);
    const dz = Math.sin(s.fallDir);
    const yaw = s.team === 1 ? Math.PI : 0;
    if (u >= 1) {
      s.dieT = -1;
      s.mesh.visible = false;
      s.mesh.rotation.set(0, yaw, 0);
      s.mesh.scale.setScalar(1);
      s.rig.uOpacity.value = 1;
      if (core || this.reduced) this.addRubble(s.x, s.z, core ? 2.4 : 1.4);
      else this.addRubble(s.x + dx * s.height * 0.45, s.z + dz * s.height * 0.45, 1.6, dx, dz, s.height * 0.5);
      this.onFallen?.(s.x, s.z, core);
      return;
    }
    s.rig.uTime.value = this.time;
    if (this.reduced) {
      s.flash = Math.max(0, 1 - u * 3);
      s.rig.uFlashK.value = s.flash * 0.8;
      s.mesh.scale.setScalar(1 - u * 0.5);
      return;
    }
    const F = FALL_SHAPE;
    const colors = ((s.team === 1 ? 1 : 0) ^ (this.styleSwap ? 1 : 0)) === 1 ? DEBRIS_DOG : DEBRIS_CAT;
    if (core) {
      // swell and shudder, BURST (a ring of chunks), cave in (the roof drops, the walls bulge), settle into the ground
      const shud = u < F.burst ? Math.sin(this.time * 70) * 0.09 * (u / F.burst) : 0;
      const swell = u < F.burst ? 0.1 * (u / F.burst) ** 2 : 0;
      const c = u < F.burst ? 0 : Math.min(1, (u - F.burst) / (F.caved - F.burst));
      const cave = c * c;
      const settle = u < F.caved ? 0 : (u - F.caved) / (1 - F.caved);
      s.flash = u < F.burst ? 0.4 + 0.6 * (u / F.burst) : Math.max(0, 1 - (u - F.burst) * 4);
      s.rig.uFlashK.value = s.flash * 0.75;
      if (!s.impacted && u >= F.burst) {
        s.impacted = true;
        this.throwChunks(DEBRIS.core, s.x, s.z, 0, 0, 0, 0.8, s.height * 0.8, colors, 9, 0.75);
        this.onImpact?.(s.x, s.z, 0, 0, 0, true);
      }
      const sy = (1 + swell) * (1 - 0.62 * cave) * (1 - 0.25 * settle);
      const sxz = (1 + swell) * (1 + 0.16 * cave) * (1 - 0.15 * settle);
      s.mesh.scale.set(sxz, sy, sxz);
      const tilt = 0.22 * cave;
      _q.setFromAxisAngle(_v.set(dz, 0, -dx), tilt);
      _q2.setFromAxisAngle(_up, yaw);
      s.mesh.quaternion.copy(_q).multiply(_q2);
      s.mesh.position.set(s.x + shud, -s.height * 0.35 * settle * settle, s.z);
      return;
    }
    // tower: crack (flash, swell, shudder) -> topple about the base edge (gravity) -> a bounce -> break up and sink
    const R = 1.4;
    let th = 0;
    if (u < F.crack) th = -0.05 * Math.sin((u / F.crack) * Math.PI);
    else if (u < F.hit) th = F.topple * ((u - F.crack) / (F.hit - F.crack)) ** 2;
    else if (u < F.settle) th = F.topple - F.bounce * Math.sin(((u - F.hit) / (F.settle - F.hit)) * Math.PI);
    else th = F.topple;
    const swell = u < F.crack ? Math.sin((u / F.crack) * Math.PI) * 0.07 : 0;
    const shud = u < F.crack ? Math.sin(this.time * 75) * 0.08 : 0;
    const brk = u < F.settle ? 0 : (u - F.settle) / (1 - F.settle);
    s.flash = u < F.crack ? 1 : Math.max(0, 0.6 - (u - F.crack) * 2.5) + (u >= F.hit && u < F.hit + 0.05 ? 0.5 : 0);
    s.rig.uFlashK.value = s.flash * 0.8;
    if (!s.impacted && u >= F.hit) {
      s.impacted = true;
      const len = s.height * 0.95;
      this.throwChunks(DEBRIS.tower, s.x, s.z, dx, dz, len, 0.4, 1.4, colors, 7.5, 0.6);
      this.onImpact?.(s.x, s.z, dx, dz, len, false);
    }
    // the pivot is the base edge on the fall side: the base lifts as it rolls over it
    _q.setFromAxisAngle(_v.set(dz, 0, -dx), th);
    _q2.setFromAxisAngle(_up, yaw);
    s.mesh.quaternion.copy(_q).multiply(_q2);
    const lift = R * Math.sin(Math.max(0, th));
    const slide = R * (1 - Math.cos(th));
    const sink = brk * brk * 1.1;
    s.mesh.position.set(s.x + dx * slide + shud, lift - sink, s.z + dz * slide);
    const sxz = (1 + swell) * (1 - 0.3 * brk);
    s.mesh.scale.set(sxz, (1 + swell) * (1 - 0.55 * brk), sxz);
  }

  /** Last drawn ground position of a structure. */
  positionOf(id: number): { x: number; z: number } | null {
    const s = this.items.get(id);
    return s ? { x: s.x, z: s.z } : null;
  }

  /** Rubble round (x, z), or (a fallen tower) strewn along the line (dx, dz) over ±len. */
  private addRubble(x: number, z: number, r: number, dx = 0, dz = 0, len = 0): void {
    const g = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(g, this.rubbleMat);
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const d = r * (0.3 + ((i * 37) % 10) / 14);
      const t = len ? (i / 6 - 0.5) * 2 * len : 0;
      m.position.set(x + Math.cos(a) * d * (len ? 0.5 : 1) + dx * t, 0.15, z + Math.sin(a) * d * (len ? 0.5 : 1) + dz * t);
      m.scale.setScalar(0.25 + ((i * 13) % 7) / 12);
      m.rotation.set(i, i * 2, i * 3);
      m.receiveShadow = true;
      this.group.add(m);
      this.rubble.push(m);
    }
  }

  dispose(): void {
    // each addRubble() builds its own geometry, shared by its 7 meshes
    const rubbleGeos = new Set(this.rubble.map((m) => m.geometry));
    for (const g of rubbleGeos) g.dispose();
    for (const m of this.rubble) this.group.remove(m);
    this.rubble.length = 0;
    for (const s of this.items.values()) s.material.dispose();
    for (const g of this.geoCache.values()) g.dispose();
    this.bubbleGeo.dispose();
    this.bubbleMat.dispose();
    this.group.remove(this.debrisMesh);
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as THREE.Material).dispose();
    this.debrisMesh.dispose();
    this.rubbleMat.dispose();
    this.ranges.dispose();
  }
}
