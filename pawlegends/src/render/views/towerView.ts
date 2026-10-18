/**
 * Structures and objectives: towers, cores, fountains, rat camp monsters and Pudding. Towers flash and shudder when
 * hit, show a shimmer while invulnerable and a dashed range ring when the player's hero walks near an enemy tower;
 * a destroyed structure leaves rubble. Render only.
 */
import * as THREE from 'three';
import { TOWERS } from '../../data/towers';
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
}

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
  myTeam: 0 | 1 = 0;
  /** Player hero position (m) for the range rings; null when dead. */
  me: { x: number; z: number } | null = null;
  /** Hero positions (m) this frame, for the x-ray fade. */
  heroes: { x: number; z: number }[] = [];

  constructor() {
    this.group.name = 'structures';
    this.group.add(this.ranges.mesh);
  }

  private geo(e: ViewEntity): THREE.BufferGeometry {
    const team = (e.team === 1 ? 1 : 0) as 0 | 1;
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
      s = { id: e.id, kind: e.kind, mesh, rig: material.userData.rig, material, flash: 0, shake: 0, hpFrac: 1, bubble, phase: e.id, x: 0, z: 0, alive: true };
      this.items.set(e.id, s);
    }
    return s;
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
    const seen = new Set<number>();
    this.ranges.begin();
    for (const e of frame.entities) {
      // pickups have their own view (views/pickupView.ts)
      if (!STRUCTURE_KINDS.has(e.kind)) continue;
      seen.add(e.id);
      const s = this.ensure(e);
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
      if (seen.has(id) || !s.alive) continue;
      s.alive = false;
      s.mesh.visible = false;
      if (s.kind === 'tower' || s.kind === 'core') this.addRubble(s.x, s.z, s.kind === 'core' ? 2.4 : 1.4);
      if (s.kind === 'camp' || s.kind === 'pudding') {
        this.items.delete(id);
        s.material.dispose();
        this.group.remove(s.mesh);
      }
    }
    this.ranges.end();
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
    for (const s of this.items.values()) s.material.dispose();
    for (const g of this.geoCache.values()) g.dispose();
    this.bubbleGeo.dispose();
    this.bubbleMat.dispose();
    this.rubbleMat.dispose();
    this.ranges.dispose();
  }
}
