import * as THREE from 'three';

// Instanced rigid-ish bodies: static until hit, then tumble with gravity, bounce, rest and sink away.

export const enum St { Static = 0, Flying = 1, Resting = 2, Gone = 3, Kinematic = 4 }

const GRAV = -70;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const q2 = new THREE.Quaternion();

export class BodySet {
  mesh: THREE.InstancedMesh;
  n = 0;
  pos: Float32Array;
  vel: Float32Array;
  ang: Float32Array; // angular velocity xyz
  rot: Float32Array; // quaternion xyzw
  size: Float32Array;
  state: Uint8Array;
  timer: Float32Array;
  dirty = true;
  onLand: ((i: number, speed: number) => void) | null = null;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, public cap: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.ang = new Float32Array(cap * 3);
    this.rot = new Float32Array(cap * 4);
    this.size = new Float32Array(cap * 3);
    this.state = new Uint8Array(cap);
    this.timer = new Float32Array(cap);
    this.mesh.count = 0;
  }

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, yaw = 0): number {
    const i = this.n++;
    const p = i * 3;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.size[p] = sx;
    this.size[p + 1] = sy;
    this.size[p + 2] = sz;
    q.setFromEuler(e.set(0, yaw, 0));
    q.toArray(this.rot, i * 4);
    this.state[i] = St.Static;
    this.mesh.setColorAt(i, color);
    this.mesh.count = this.n;
    this.write(i);
    return i;
  }

  write(i: number): void {
    const s = this.state[i];
    q.fromArray(this.rot, i * 4);
    v.fromArray(this.pos, i * 3);
    sc.fromArray(this.size, i * 3);
    if (s === St.Gone) sc.setScalar(0);
    else if (s === St.Resting && this.timer[i] > 3) {
      const k = Math.max(0, 1 - (this.timer[i] - 3) / 1.5);
      sc.multiplyScalar(k);
    }
    m4.compose(v, q, sc);
    this.mesh.setMatrixAt(i, m4);
    this.dirty = true;
  }

  launch(i: number, vx: number, vy: number, vz: number, spin = 3): void {
    if (this.state[i] === St.Gone) return;
    this.state[i] = St.Flying;
    this.timer[i] = 0;
    const p = i * 3;
    this.vel[p] = vx;
    this.vel[p + 1] = vy;
    this.vel[p + 2] = vz;
    this.ang[p] = (Math.random() - 0.5) * spin;
    this.ang[p + 1] = (Math.random() - 0.5) * spin;
    this.ang[p + 2] = (Math.random() - 0.5) * spin;
  }

  step(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const s = this.state[i];
      if (s === St.Flying) {
        const p = i * 3;
        this.vel[p + 1] += GRAV * dt;
        this.pos[p] += this.vel[p] * dt;
        this.pos[p + 1] += this.vel[p + 1] * dt;
        this.pos[p + 2] += this.vel[p + 2] * dt;
        // integrate rotation
        e.set(this.ang[p] * dt, this.ang[p + 1] * dt, this.ang[p + 2] * dt);
        q.fromArray(this.rot, i * 4).multiply(q2.setFromEuler(e)).normalize();
        q.toArray(this.rot, i * 4);
        const half = Math.min(this.size[p], this.size[p + 1], this.size[p + 2]) * 0.5;
        if (this.pos[p + 1] < half) {
          this.pos[p + 1] = half;
          const impact = -this.vel[p + 1];
          if (impact > 12 && this.onLand) this.onLand(i, impact);
          this.vel[p + 1] = impact * 0.25;
          this.vel[p] *= 0.55;
          this.vel[p + 2] *= 0.55;
          this.ang[p] *= 0.5;
          this.ang[p + 1] *= 0.5;
          this.ang[p + 2] *= 0.5;
          if (impact < 8) {
            this.state[i] = St.Resting;
            this.timer[i] = 0;
          }
        }
        this.timer[i] += dt;
        if (this.timer[i] > 8) {
          this.state[i] = St.Resting;
          this.timer[i] = 0;
        }
        this.write(i);
      } else if (s === St.Resting) {
        this.timer[i] += dt;
        if (this.timer[i] > 4.5) this.state[i] = St.Gone;
        if (this.timer[i] > 3) this.write(i);
        if (this.state[i] === St.Gone) this.write(i);
      }
    }
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
  }
}

/**
 * Short-lived particles (dust, chunks, water, fire). Shrink to nothing over their life.
 * Live particles are kept packed in [0, n) (a dead one is swapped with the last), so the GPU only draws live ones
 * (mesh.count = n) and only the live range of the matrix / colour buffers is uploaded.
 */
export class Particles {
  mesh: THREE.InstancedMesh;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  max: Float32Array;
  size: Float32Array;
  grow: Float32Array;
  grav: Float32Array;
  /** live particles (packed at the front) */
  n = 0;
  next = 0; // when full, the slot that gets overwritten next
  private colDirty = false;
  private col = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, public cap: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap).fill(1);
    this.size = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    m4.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      this.mesh.setMatrixAt(i, m4);
      this.mesh.setColorAt(i, this.col.set(0xffffff));
    }
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  /** Alive particle count (tests and QA scripts). */
  alive(): number {
    return this.n;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, grav = -30, grow = 0): void {
    let i: number;
    if (this.n < this.cap) i = this.n++;
    else {
      i = this.next;
      this.next = (this.next + 1) % this.cap;
    }
    const p = i * 3;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.vel[p] = vx;
    this.vel[p + 1] = vy;
    this.vel[p + 2] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.mesh.setColorAt(i, this.col.set(color));
    this.colDirty = true;
  }

  /** Remove every particle (level load). */
  clear(): void {
    this.life.fill(0);
    this.n = 0;
    this.next = 0;
    this.mesh.count = 0;
  }

  private writeM(i: number): void {
    const p = i * 3;
    const t = Math.max(0, this.life[i] / this.max[i]);
    const s = this.life[i] <= 0 ? 0 : this.size[i] * (1 + this.grow[i] * (1 - t)) * Math.min(1, t * 3);
    m4.makeScale(s, s, s);
    m4.setPosition(this.pos[p], this.pos[p + 1], this.pos[p + 2]);
    this.mesh.setMatrixAt(i, m4);
  }

  /** Move the last live particle into slot i (i is dead). */
  private kill(i: number): void {
    const j = --this.n;
    if (this.next > this.n) this.next = 0;
    if (i === j) return;
    const a = i * 3;
    const b = j * 3;
    this.pos[a] = this.pos[b];
    this.pos[a + 1] = this.pos[b + 1];
    this.pos[a + 2] = this.pos[b + 2];
    this.vel[a] = this.vel[b];
    this.vel[a + 1] = this.vel[b + 1];
    this.vel[a + 2] = this.vel[b + 2];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.size[i] = this.size[j];
    this.grow[i] = this.grow[j];
    this.grav[i] = this.grav[j];
    this.mesh.getColorAt(j, this.col);
    this.mesh.setColorAt(i, this.col);
    this.colDirty = true;
    this.writeM(i);
  }

  step(dt: number): void {
    // backwards: a dead slot gets the last particle, which was already stepped this frame
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const p = i * 3;
      this.vel[p + 1] += this.grav[i] * dt;
      this.vel[p] *= 1 - dt * 0.8;
      this.vel[p + 2] *= 1 - dt * 0.8;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      if (this.pos[p + 1] < 0.3) {
        this.pos[p + 1] = 0.3;
        this.vel[p + 1] *= -0.3;
      }
      this.writeM(i);
    }
    const n = this.n;
    this.mesh.count = n;
    if (n === 0) return;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, n * 16);
    im.needsUpdate = true;
    if (this.colDirty && this.mesh.instanceColor) {
      const ic = this.mesh.instanceColor;
      ic.clearUpdateRanges();
      ic.addUpdateRange(0, n * 3);
      ic.needsUpdate = true;
      this.colDirty = false;
    }
  }
}
