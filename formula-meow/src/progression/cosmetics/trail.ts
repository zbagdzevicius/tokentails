/**
 * The player's kart trail (content/ids.ts TRAIL_IDS: sparkle, fish bones, hearts, paw prints, rainbow): one pooled
 * InstancedMesh (one draw call) of small shapes dropped behind the kart while it moves. Render only, reads the kart's
 * on-screen transform, never the sim. Reduced motion keeps the trail but drops the float and spin.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  Euler,
  Vector3,
  type Scene,
} from 'three';
import { GeoBuilder } from '../../core/render/geo';
import { TRAIL_IDS } from '../../content/ids';
import { TRAIL_INFO } from '../../content/cosmetics';

const POOL = 72;
/** the rainbow lays six lanes per drop */
const RAINBOW_POOL = 168;

interface P {
  /** z scale (rainbow lanes stretch to meet the next drop) */
  len: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  rot: number;
  spin: number;
  age: number;
  life: number;
  size: number;
  color: number;
}

/** The shape of one particle, white vertex colours (the instance colour tints it). */
export function trailGeometry(kind: string): BufferGeometry {
  const g = new GeoBuilder();
  const W = 0xffffff;
  const o = { vary: 0 };
  switch (kind) {
    case 'fishbones':
      g.box(0.5, 0.05, 0.05, W, {}, o);
      for (const x of [-0.12, 0, 0.12]) g.box(0.03, 0.05, 0.26, W, { x }, o);
      g.cone(0.12, 0.18, 3, W, { x: 0.3, rz: -Math.PI / 2, sz: 0.4 }, o);
      g.cone(0.1, 0.14, 3, W, { x: -0.3, rz: Math.PI / 2, sz: 0.4 }, o);
      return g.build();
    case 'hearts':
      g.sphere(0.13, W, { x: -0.09, y: 0.04, sz: 0.35 }, o, 7, 4);
      g.sphere(0.13, W, { x: 0.09, y: 0.04, sz: 0.35 }, o, 7, 4);
      g.cone(0.19, 0.24, 4, W, { y: -0.1, rz: Math.PI, ry: Math.PI / 4, sz: 0.4 }, o);
      return g.build();
    case 'pawprints':
      g.cyl(0.13, 0.13, 0.02, 8, W, { sx: 1, sz: 0.85 }, o);
      for (const [x, z] of [
        [-0.14, 0.15],
        [-0.05, 0.21],
        [0.05, 0.21],
        [0.14, 0.15],
      ])
        g.cyl(0.05, 0.05, 0.02, 6, W, { x, z }, o);
      return g.build();
    case 'rainbow':
      // one lane of the ribbon, 1 m long (scaled to the gap between drops)
      g.box(0.2, 0.02, 1, W, {}, o);
      return g.build();
    default: {
      const s = new OctahedronGeometry(0.14, 0);
      g.add(s, W, {}, o);
      return g.build();
    }
  }
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class KartTrail {
  private mesh: InstancedMesh | null = null;
  private kind = '';
  private parts: P[] = [];
  private next = 0;
  private acc = 0;
  private time = 0;
  private side = 1;

  constructor(private readonly scene: Scene) {}

  /** Switch to trail `index` (0 = none). */
  set(index: number): void {
    const id = TRAIL_IDS[index] ?? 'none';
    if (id === this.kind) return;
    this.dispose();
    this.kind = id;
    if (id === 'none') return;
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, side: DoubleSide });
    const pool = id === 'rainbow' ? RAINBOW_POOL : POOL;
    this.mesh = new InstancedMesh(trailGeometry(id), mat, pool);
    this.mesh.name = 'fm-trail';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    this.parts = [];
    for (let i = 0; i < pool; i++) this.parts.push({ len: 1, x: 0, y: 0, z: 0, vy: 0, rot: 0, spin: 0, age: 1, life: 0, size: 0, color: 0xffffff });
    // the instance colour buffer exists from the start
    for (let i = 0; i < pool; i++) this.mesh.setColorAt(i, _c.setHex(0xffffff));
    this.scene.add(this.mesh);
  }

  private take(): P {
    const p = this.parts[this.next];
    this.next = (this.next + 1) % this.parts.length;
    return p;
  }

  /** Forget every particle (new race). */
  clear(): void {
    for (const p of this.parts) p.age = p.life = 0;
    if (this.mesh) this.mesh.count = 0;
  }

  /**
   * One frame. `x, y, z, heading` are the kart's on-screen transform; `speed` in m/s. `emit` is false on the grid,
   * while paused and while the kart is hidden.
   */
  update(dt: number, x: number, y: number, z: number, heading: number, speed: number, emit: boolean, reduced: boolean): void {
    const m = this.mesh;
    if (!m) return;
    this.time += dt;
    const info = TRAIL_INFO[this.kind as keyof typeof TRAIL_INFO];
    const cols = info?.colors ?? [0xffffff];
    const ground = this.kind === 'pawprints' || this.kind === 'rainbow';
    if (emit && speed > 3) {
      const rate = this.kind === 'pawprints' ? 0.12 : this.kind === 'rainbow' ? 0.035 : 0.045;
      this.acc += dt;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      while (this.acc >= rate) {
        this.acc -= rate;
        if (this.kind === 'rainbow') {
          // six coloured lanes side by side, each stretched to the distance covered until the next drop
          const len = Math.max(0.3, speed * rate * 1.15);
          for (let lane = 0; lane < 6; lane++) {
            const p = this.take();
            const lat = (lane - 2.5) * 0.2;
            p.x = x - fx * (1.3 + len / 2) + fz * lat;
            p.z = z - fz * (1.3 + len / 2) - fx * lat;
            p.y = y + 0.05;
            p.vy = 0;
            p.rot = heading;
            p.spin = 0;
            p.age = 0;
            p.life = 0.55;
            p.size = 1;
            p.len = len;
            p.color = cols[lane % cols.length];
          }
          continue;
        }
        const p = this.take();
        let lat = (Math.random() - 0.5) * 0.7;
        if (this.kind === 'pawprints') {
          this.side = -this.side;
          lat = this.side * 0.3;
        }
        const back = 1.35;
        p.x = x - fx * back + fz * lat;
        p.z = z - fz * back - fx * lat;
        p.y = y + (ground ? 0.05 : 0.5 + Math.random() * 0.35);
        p.vy = ground || reduced ? 0 : 0.5 + Math.random() * 0.6;
        p.rot = ground ? heading : Math.random() * Math.PI * 2;
        p.spin = ground || reduced ? 0 : (Math.random() - 0.5) * 6;
        p.age = 0;
        p.life = this.kind === 'pawprints' ? 0.9 : 0.75;
        p.size = this.kind === 'pawprints' ? 0.75 : 0.7 + Math.random() * 0.45;
        p.len = 1;
        p.color = cols[Math.floor(Math.random() * cols.length)] ?? 0xffffff;
      }
    }
    let n = 0;
    for (const p of this.parts) {
      if (p.age >= p.life) continue;
      p.age += dt;
      if (p.age >= p.life) continue;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const k = p.age / p.life;
      const sc = p.size * (ground ? (this.kind === 'rainbow' ? 1 - k * 0.5 : 1) : 1 - k * 0.7);
      _e.set(0, p.rot, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(p.x, p.y, p.z);
      _s.set(sc, sc, sc * p.len);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(n, _m);
      // fade by darkening toward the end (one material for every instance)
      m.setColorAt(n, _c.setHex(p.color).multiplyScalar(ground ? 1 - k * 0.6 : 1));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  get object(): Object3D | null {
    return this.mesh;
  }

  dispose(): void {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
    this.mesh = null;
    this.kind = '';
  }
}
