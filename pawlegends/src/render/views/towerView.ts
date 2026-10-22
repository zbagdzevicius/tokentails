/**
 * Structures and objectives: towers, cores, fountains, rat camp monsters and Pudding. Towers flash and shudder when
 * hit, show a shimmer while invulnerable and a dashed range ring when the player's hero walks near an enemy tower;
 * a destroyed structure leaves rubble. Render only.
 *
 * Weight: a shooting tower or core charges before each shot (a glow and a crouch over the last 40% of its 1 s period,
 * or over a lock-on windup), and fires with a recoil (a stretch that rings out) and a muzzle burst on the frame its
 * bolt appears; a falling tower or core flashes, swells, tilts and sinks into the ground (0.7 s; the core 1.1 s, its
 * slow motion runs over it) before the rubble is left. Nothing allocates per frame.
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
  team: number;
  stamp: number;
}

/** Shot rhythm (s) and the charge / recoil / fall shapes. */
export const STRUCT_ANIM = Object.freeze({ period: TOWERS.outer.attackEvery / 30, corePeriod: CORE_STATS.attackEvery / 30, chargeFrom: 0.6, crouch: 0.05, glow: 0.4, recoil: 0.08, fallTower: 0.7, fallCore: 1.1 });

const TOWER_RANGE_M = Math.max(TOWERS.outer.range, TOWERS.inner.range) / 1000;
/**
 * X-ray: a tower or core fades while a hero stands in the patch it hides on screen. The camera looks north (−Z)
 * from the south, so a tall structure covers the ground just north of it.
 */
const COVER = Object.freeze({ halfWidth: 1.9, north: 5.5, south: 0.6, opacity: 0.32 });

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
      s = { id: e.id, kind: e.kind, mesh, rig: material.userData.rig, material, flash: 0, shake: 0, hpFrac: 1, bubble, phase: e.id, x: 0, z: 0, alive: true, shotAt: -99, lockAt: -99, lockLen: 0, dieT: -1, fallDir: (e.id * 2.39996) % (Math.PI * 2), height, team: e.team, stamp: 0 };
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
  }

  /** A tower or core falling: a flash and swell, then it tilts and sinks into the ground; the rubble at the end. */
  private fall(s: Structure, dt: number): void {
    const L = s.kind === 'core' ? STRUCT_ANIM.fallCore : STRUCT_ANIM.fallTower;
    s.dieT += dt;
    const u = Math.min(1, s.dieT / L);
    if (u >= 1) {
      s.dieT = -1;
      s.mesh.visible = false;
      s.mesh.rotation.x = 0;
      s.mesh.rotation.z = 0;
      s.rig.uOpacity.value = 1;
      this.addRubble(s.x, s.z, s.kind === 'core' ? 2.4 : 1.4);
      this.onFallen?.(s.x, s.z, s.kind === 'core');
      return;
    }
    s.flash = Math.max(0, 1 - u * 3);
    s.rig.uFlashK.value = s.flash * 0.8;
    s.rig.uTime.value = this.time;
    if (this.reduced) {
      s.mesh.scale.setScalar(1 - u * 0.5);
      return;
    }
    // swell (0–20%), then tilt and sink with a shudder
    const swell = u < 0.2 ? Math.sin((u / 0.2) * Math.PI) * 0.08 : 0;
    const sink = u < 0.2 ? 0 : ((u - 0.2) / 0.8) ** 2;
    const shud = Math.sin(this.time * 60) * 0.06 * (1 - u);
    s.mesh.position.set(s.x + shud, -s.height * 0.75 * sink, s.z);
    const tilt = 0.4 * sink;
    s.mesh.rotation.x = Math.cos(s.fallDir) * tilt;
    s.mesh.rotation.z = Math.sin(s.fallDir) * tilt;
    s.mesh.scale.set(1 + swell, (1 + swell) * (1 - 0.35 * sink), 1 + swell);
  }

  /** Last drawn ground position of a structure. */
  positionOf(id: number): { x: number; z: number } | null {
    const s = this.items.get(id);
    return s ? { x: s.x, z: s.z } : null;
  }

  private addRubble(x: number, z: number, r: number): void {
    const g = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(g, this.rubbleMat);
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const d = r * (0.3 + ((i * 37) % 10) / 14);
      m.position.set(x + Math.cos(a) * d, 0.15, z + Math.sin(a) * d);
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
    this.rubbleMat.dispose();
    this.ranges.dispose();
  }
}
