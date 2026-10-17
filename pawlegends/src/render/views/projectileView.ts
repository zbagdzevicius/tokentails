/**
 * Projectiles (instanced glowing bolts with particle trails) and zones (instanced ground discs). Kinds follow
 * PROJECTILE_KIND in src/data/towers.ts; an unknown kind draws as a hero bolt. Render only.
 */
import * as THREE from 'three';
import { CAPS } from '../../data/map';
import { PROJECTILE_KIND } from '../../data/towers';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { FADE, SHAPE, type Particles } from '../fx/Particles.js';
import { RELATION, TEAM } from '../palette';
import { DecalLayer, discTexture } from './decals';

interface Look {
  size: number;
  y: number;
  color: number;
  trail: number;
}

function look(kind: number, team: number): Look {
  const t = team === 1 ? TEAM[1] : TEAM[0];
  switch (kind) {
    case PROJECTILE_KIND.ranged:
      return { size: 0.22, y: 0.7, color: team === 0 ? 0x9fd3ff : 0xffd27a, trail: 0.12 };
    case PROJECTILE_KIND.siege:
      return { size: 0.42, y: 1.4, color: t.main, trail: 0.2 };
    case PROJECTILE_KIND.tower:
      return { size: 0.42, y: 3.6, color: team === 0 ? 0xff9fc0 : 0x8fb4ff, trail: 0.3 };
    case PROJECTILE_KIND.core:
      return { size: 0.6, y: 3.0, color: team === 0 ? 0xff6f91 : 0xffd34d, trail: 0.35 };
    default:
      return { size: 0.3, y: 0.9, color: team === 0 ? 0xfff1a8 : 0xd7b8ff, trail: 0.18 };
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

export class ProjectileView {
  readonly group = new THREE.Group();
  private bolts: THREE.InstancedMesh;
  private zones = new DecalLayer(discTexture(), CAPS.zones, { additive: true, y: 0.07, name: 'zones' });
  private trailT = 0;
  private time = 0;
  myTeam: 0 | 1 = 0;

  constructor(private readonly particles: Particles) {
    this.group.name = 'projectiles';
    const geo = new THREE.SphereGeometry(1, 10, 8);
    geo.scale(1.8, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.bolts = new THREE.InstancedMesh(geo, mat, CAPS.projectiles);
    this.bolts.name = 'bolts';
    this.bolts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bolts.setColorAt(0, new THREE.Color(1, 1, 1));
    this.bolts.count = 0;
    this.bolts.frustumCulled = false;
    this.group.add(this.bolts, this.zones.mesh);
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    this.trailT -= dt;
    const trail = this.trailT <= 0;
    if (trail) this.trailT = 1 / 40;
    let n = 0;
    for (const p of frame.projectiles) {
      if (n >= CAPS.projectiles) break;
      const L = look(p.kind, p.team);
      const x = toX(p.fx);
      const z = toZ(p.fy);
      _dir.set(p.vx, 0, -p.vy);
      if (_dir.lengthSq() > 0) _dir.normalize();
      else _dir.set(1, 0, 0);
      _q.setFromUnitVectors(_up, _dir);
      _m.compose(_p.set(x, L.y, z), _q, _s.setScalar(L.size));
      this.bolts.setMatrixAt(n, _m);
      _c.setHex(L.color).multiplyScalar(1.6);
      this.bolts.setColorAt(n, _c);
      n++;
      if (trail) {
        this.particles.burst(_p, { additive: true, n: 1, exact: true, shape: SHAPE.SOFT, color: L.color, intensity: 1.4, size: [L.trail, L.trail * 1.4], sizeEnd: 0.2, life: [0.18, 0.28], speed: [0.1, 0.4], fade: FADE.LINEAR });
      }
    }
    this.bolts.count = n;
    this.bolts.instanceMatrix.needsUpdate = true;
    if (this.bolts.instanceColor) this.bolts.instanceColor.needsUpdate = true;
    this.zones.begin();
    for (const z of frame.zones) {
      const rel = z.team === 2 ? RELATION.neutral : z.team === this.myTeam ? RELATION.ally : RELATION.enemy;
      const pulse = 0.55 + Math.sin(this.time * 5 + z.index) * 0.15;
      this.zones.add(toX(z.x), toZ(z.y), (z.radius / 1000) * 2, rel, pulse);
    }
    this.zones.end();
  }

  dispose(): void {
    this.bolts.geometry.dispose();
    (this.bolts.material as THREE.Material).dispose();
    this.zones.dispose();
  }
}
