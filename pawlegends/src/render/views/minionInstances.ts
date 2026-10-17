/**
 * Minions: one InstancedMesh per team × variant (6 draw calls for up to 40 minions, POC.md §10). Kitten squires and
 * pup guards are upright chibi characters (render/chars/); each copy walks on its own leg / arm cycle, swings its
 * weapon arm and flinches through a per-instance `aAnim` attribute read by the upright part shader. Siege carts
 * roll. Render only.
 */
import * as THREE from 'three';
import { CAPS } from '../../data/map';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { minionGeometry, type MinionVariant } from './models';
import { RELATION } from '../palette';
import { DecalLayer, ringTexture } from './decals';
import { uprightMaterial } from './rig';

const VARIANTS: readonly MinionVariant[] = ['melee', 'ranged', 'siege'];
/**
 * Instance scale: the upright minions are built in H (≈ 1 unit to the ear tips), so this is their height in metres;
 * the siege cart is built in metres. Kept near the readability-pass size (~1.5 m tall at 844×390).
 */
const SCALE: Record<MinionVariant, number> = { melee: 1.65, ranged: 1.6, siege: 1.95 };

interface Anim {
  phase: number;
  walk: number;
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
  private material = uprightMaterial();
  private animAttr: THREE.InstancedBufferAttribute[] = [];
  /** A team-coloured ring under every minion (one draw call), so a wave reads as ours or theirs at a glance. */
  private rings = new DecalLayer(ringTexture(), CAPS.minions, { additive: false, y: 0.04, name: 'minion-rings' });
  myTeam: 0 | 1 = 0;

  constructor() {
    this.group.name = 'minions';
    this.group.add(this.rings.mesh);
    for (const team of [0, 1] as const) {
      for (const v of VARIANTS) {
        const geo = minionGeometry(v, team);
        const aa = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.minions * 4), 4);
        aa.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', aa);
        this.animAttr.push(aa);
        const mesh = new THREE.InstancedMesh(geo, this.material, CAPS.minions);
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
    this.material.userData.rig.uTime.value = time;
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
        a = { phase: e.id * 0.7, walk: 0, hit: 0, swing: 0, x: 0, z: 0 };
        this.anim.set(e.id, a);
      }
      const mps = (e.speed * 30) / 1000;
      const moving = mps > 0.3;
      // phase from ground distance over the stride (~0.55 of the height), so the feet keep pace
      a.phase += moving ? (mps * dt * Math.PI) / (SCALE[v] * 0.55) : 0;
      a.walk += ((moving ? 1 : 0) - a.walk) * Math.min(1, dt * 10);
      a.hit = Math.max(0, a.hit - dt * 5);
      a.swing = Math.max(0, a.swing - dt * 3);
      a.x = toX(e.fx);
      a.z = toZ(e.fy);
      const upright = v !== 'siege';
      const hop = upright ? Math.abs(Math.cos(a.phase)) * 0.06 * a.walk : moving ? Math.abs(Math.sin(a.phase * 0.5)) * 0.03 : 0;
      const sq = 1 - a.hit * 0.18;
      const s = SCALE[v];
      this.animAttr[k].setXYZW(i, a.phase, a.walk, a.swing, a.hit);
      _e.set(0, e.yaw, upright ? -a.walk * 0.08 + a.hit * 0.15 : -Math.sin(a.swing * Math.PI) * 0.35 + Math.sin(time * 2 + e.id) * 0.02);
      _q.setFromEuler(_e);
      _m.compose(_p.set(a.x, hop, a.z), _q, _s.set(s * (1 + a.hit * 0.15), s * sq, s * (1 + a.hit * 0.15)));
      mesh.setMatrixAt(i, _m);
      this.rings.add(a.x, a.z, 0.95 * s, team === this.myTeam ? RELATION.ally : RELATION.enemy, 0.7);
    }
    this.rings.end();
    for (let k = 0; k < this.meshes.length; k++) {
      this.meshes[k].count = Math.min(CAPS.minions, counts[k]);
      this.meshes[k].instanceMatrix.needsUpdate = true;
      this.animAttr[k].needsUpdate = true;
    }
    for (const id of this.anim.keys()) if (!seen.has(id)) this.anim.delete(id);
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.rings.dispose();
  }
}
