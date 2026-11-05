/**
 * LoL pass (lane C): tower targeting beams (render only). Every tower or core shot that lands draws a short beam from
 * the structure's tip to what it hit: the tower's own colour on minions, a thicker red one with an impact flare when it
 * hits the player. A tower winding up a shot draws a thin charging line toward the windup point that brightens as the
 * shot comes. One pooled set of meshes (named `tower-beam`, so e2e can count the live ones); nothing is allocated per
 * shot. The aggro ring (the tower's range ring turning red) lives in views/towerView.ts.
 */
import * as THREE from 'three';

export const BEAM = Object.freeze({
  /** Seconds a hit beam stays (it fades over the last half). */
  hitLife: 0.3,
  /** Beam radius (m): on a minion or another unit, and on the player. */
  width: 0.07,
  widthMe: 0.17,
  /** Charging line radius (m). */
  charge: 0.03,
  /** Phones draw beams this much thinner. */
  phone: 0.8,
  /** Seconds the aggro ring stays red after the tower last hit or aimed at the player. */
  aggroHold: 1.5,
  /** Aggro ring pulse (Hz). */
  pulseHz: 2,
  /** Seconds the impact flare lasts. */
  flareLife: 0.22,
});

/** Aggro ring opacity at `since` seconds after the last tower hit or aim on the player (0 = not aggro). Pure. */
export function aggroPulse(since: number, time: number): number {
  if (!(since >= 0) || since >= BEAM.aggroHold) return 0;
  return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 * BEAM.pulseHz));
}

interface Beam {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  life: number;
  charge: boolean;
  w: number;
}

interface Flare {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  size: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class TowerBeams {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly flareGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly beams: Beam[] = [];
  private readonly flares: Flare[] = [];
  private next = 0;
  private nextFlare = 0;
  /** Beams drawn so far (e2e telemetry). */
  shots = 0;

  constructor(cap = 14) {
    this.group.name = 'tower-beams';
    for (let i = 0; i < cap; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.name = 'tower-beam';
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.beams.push({ mesh, mat, t: 0, life: 0, charge: false, w: 0 });
    }
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff5a4d, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.flareGeo, mat);
      mesh.name = 'tower-flare';
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.flares.push({ mesh, mat, t: 1, size: 0 });
    }
  }

  /** Live beams now (hit beams and charging lines). */
  get live(): number {
    let k = 0;
    for (const b of this.beams) if (b.mesh.visible) k++;
    return k;
  }

  private static phone(): boolean {
    return typeof window !== 'undefined' && window.innerHeight > 0 && window.innerHeight <= 480;
  }

  /**
   * A beam from (x0, y0, z0) to (x1, y1, z1) m. `me`: it hit the player (red, thicker, a flare); `charge`: a thin
   * charging line for `life` s (a windup), else a hit beam.
   */
  shot(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, me: boolean, charge = false, life: number = BEAM.hitLife): void {
    const b = this.beams[this.next];
    this.next = (this.next + 1) % this.beams.length;
    _a.set(x0, y0, z0);
    _b.set(x1, y1, z1);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 0.05) return;
    const k = TowerBeams.phone() ? BEAM.phone : 1;
    b.w = (charge ? BEAM.charge : me ? BEAM.widthMe : BEAM.width) * k;
    b.mesh.position.addVectors(_a, _b).multiplyScalar(0.5);
    b.mesh.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
    b.mesh.scale.set(b.w, len, b.w);
    b.mat.color.setHex(me && !charge ? 0xff3b3b : color);
    b.mat.opacity = charge ? 0.15 : 1;
    b.t = 0;
    b.life = Math.max(0.05, life);
    b.charge = charge;
    b.mesh.visible = true;
    this.shots++;
    if (me && !charge) {
      const f = this.flares[this.nextFlare];
      this.nextFlare = (this.nextFlare + 1) % this.flares.length;
      f.mesh.position.copy(_b);
      f.t = 0;
      f.size = 0.55 * k;
      f.mesh.visible = true;
    }
  }

  update(dt: number): void {
    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      if (b.t >= b.life) {
        b.mesh.visible = false;
        continue;
      }
      const u = b.t / b.life;
      if (b.charge) {
        // the charge builds: brighter and a little thicker as the shot comes
        b.mat.opacity = 0.15 + 0.6 * u;
        const w = b.w * (0.7 + 0.8 * u);
        b.mesh.scale.x = w;
        b.mesh.scale.z = w;
      } else {
        b.mat.opacity = u < 0.5 ? 1 : 1 - (u - 0.5) * 2;
        const w = b.w * (1 - 0.5 * u);
        b.mesh.scale.x = w;
        b.mesh.scale.z = w;
      }
    }
    for (const f of this.flares) {
      if (!f.mesh.visible) continue;
      f.t += dt;
      const u = f.t / BEAM.flareLife;
      if (u >= 1) {
        f.mesh.visible = false;
        continue;
      }
      f.mesh.scale.setScalar(f.size * (0.6 + 0.9 * u));
      f.mat.opacity = 1 - u;
    }
  }

  /** Hide every beam and flare (a new match, the view torn down). */
  clear(): void {
    for (const b of this.beams) b.mesh.visible = false;
    for (const f of this.flares) f.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.flareGeo.dispose();
    for (const b of this.beams) b.mat.dispose();
    for (const f of this.flares) f.mat.dispose();
  }
}
