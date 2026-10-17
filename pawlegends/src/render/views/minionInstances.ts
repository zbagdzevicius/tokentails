/**
 * Minions: one InstancedMesh per team × variant (6 draw calls for up to 40 minions, POC.md §10). Each instance hops
 * while it walks, leans into its swing and squashes when hit. Render only.
 */
import * as THREE from 'three';
import { CAPS } from '../../data/map';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { minionGeometry, type MinionVariant } from './models';
import { RELATION } from '../palette';
import { DecalLayer, ringTexture } from './decals';
import { rigMaterial } from './rig';

const VARIANTS: readonly MinionVariant[] = ['melee', 'ranged', 'siege'];
/** About 1.4× the first cut: at 844×390 the minions were ~25 px tall and hard to tell apart (readability pass). */
const SCALE: Record<MinionVariant, number> = { melee: 1.8, ranged: 1.8, siege: 1.95 };

interface Anim {
  phase: number;
  hit: number;
  swing: number;
  x: number;
  z: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export class MinionInstances {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private anim = new Map<number, Anim>();
  private material = rigMaterial();
  /** A team-coloured ring under every minion (one draw call), so a wave reads as ours or theirs at a glance. */
  private rings = new DecalLayer(ringTexture(), CAPS.minions, { additive: false, y: 0.04, name: 'minion-rings' });
  myTeam: 0 | 1 = 0;

  constructor() {
    this.group.name = 'minions';
    this.group.add(this.rings.mesh);
    for (const team of [0, 1] as const) {
      for (const v of VARIANTS) {
        const mesh = new THREE.InstancedMesh(minionGeometry(v, team), this.material, CAPS.minions);
        mesh.name = `minions-${team}-${v}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  setShadows(on: boolean): void {
    for (const m of this.meshes) m.castShadow = on;
  }

  hit(id: number): void {
    const a = this.anim.get(id);
    if (a) a.hit = 1;
  }

  swing(id: number): void {
    const a = this.anim.get(id);
    if (a) a.swing = 1;
  }

  /** Last drawn position (m), for FX. */
  positionOf(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const a = this.anim.get(id);
    return a ? out.set(a.x, 0, a.z) : null;
  }

  update(frame: ViewFrame, dt: number, time: number): void {
    const counts = new Array(this.meshes.length).fill(0);
    const seen = new Set<number>();
    this.rings.begin();
    for (const e of frame.entities) {
      if (e.kind !== 'minion' || e.state === 'dead') continue;
      const v = (VARIANTS as readonly string[]).includes(e.variant ?? '') ? (e.variant as MinionVariant) : 'melee';
      const team = e.team === 1 ? 1 : 0;
      const k = team * 3 + VARIANTS.indexOf(v);
      const mesh = this.meshes[k];
      const i = counts[k]++;
      if (i >= CAPS.minions) continue;
      seen.add(e.id);
      let a = this.anim.get(e.id);
      if (!a) {
        a = { phase: e.id * 0.7, hit: 0, swing: 0, x: 0, z: 0 };
        this.anim.set(e.id, a);
      }
      const mps = (e.speed * 30) / 1000;
      const moving = mps > 0.3;
      a.phase += dt * (moving ? 11 : 2);
      a.hit = Math.max(0, a.hit - dt * 5);
      a.swing = Math.max(0, a.swing - dt * 4);
      a.x = toX(e.fx);
      a.z = toZ(e.fy);
      const hop = moving && v !== 'siege' ? Math.abs(Math.sin(a.phase)) * 0.12 : v === 'siege' && moving ? Math.abs(Math.sin(a.phase * 0.5)) * 0.03 : 0;
      const sq = 1 - a.hit * 0.25;
      const s = SCALE[v];
      _e.set(0, e.yaw, -Math.sin(a.swing * Math.PI) * 0.35 + (moving ? Math.sin(a.phase) * 0.06 : 0) + Math.sin(time * 2 + e.id) * 0.02);
      _q.setFromEuler(_e);
      _m.compose(_p.set(a.x, hop, a.z), _q, _s.set(s * (1 + a.hit * 0.15), s * sq, s * (1 + a.hit * 0.15)));
      mesh.setMatrixAt(i, _m);
      this.rings.add(a.x, a.z, 0.95 * s, team === this.myTeam ? RELATION.ally : RELATION.enemy, 0.7);
    }
    this.rings.end();
    for (let k = 0; k < this.meshes.length; k++) {
      this.meshes[k].count = Math.min(CAPS.minions, counts[k]);
      this.meshes[k].instanceMatrix.needsUpdate = true;
    }
    for (const id of this.anim.keys()) if (!seen.has(id)) this.anim.delete(id);
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.rings.dispose();
  }
}
