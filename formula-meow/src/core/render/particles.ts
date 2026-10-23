/**
 * Pooled particles (feel lane, GDD 11): each pool is ONE InstancedMesh with a fixed capacity and a ring buffer, so a
 * whole effect family costs a single draw call however busy the race gets.
 *
 *  - `puffs`: soft low-poly smoke balls (exhaust puffs on gas, dust on off-road, splashes on low grip, landing
 *    puffs, catnip clouds, hairball fluff). Normal blending, shaded from above, grow and fade over their life.
 *  - `shards`: little tumbling cubes (item boxes shatter into 8, hit debris). Gravity, spin, fade at the end.
 *
 * Render-only: random numbers here never touch the sim.
 */
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  Object3D,
  ShaderMaterial,
  type BufferGeometry,
  type Scene,
} from 'three';

const _o = new Object3D();
const _c = new Color();

export interface PoolOptions {
  capacity: number;
  geometry: BufferGeometry;
  /** m/s² downwards */
  gravity: number;
  /** velocity kept per second (0..1) */
  drag: number;
  /** size multiplier reached at the end of life */
  grow: number;
  /** tumble while alive */
  spin: boolean;
  /** opacity is the life fraction to this power (puffs fade softly, shards stay solid then pop) */
  fadePow: number;
  renderOrder: number;
}

const VS = /* glsl */ `
attribute float aAlpha;
varying vec3 vC; varying float vA; varying vec3 vN;
void main(){
  vC = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
  #endif
  vA = aAlpha;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  // never fill the lens: particles fade out within a few metres of the camera
  vA *= smoothstep(3.0, 6.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */ `
varying vec3 vC; varying float vA; varying vec3 vN;
void main(){
  if (vA <= 0.01) discard;
  float l = 0.72 + 0.28 * clamp(vN.y * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(vC * l, vA);
}`;

export class ParticlePool {
  readonly mesh: InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly rot: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly alphaAttr: InstancedBufferAttribute;
  private next = 0;
  private live = 0;

  constructor(
    private readonly scene: Scene,
    private readonly o: PoolOptions,
  ) {
    const n = o.capacity;
    const mat = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: NormalBlending });
    this.mesh = new InstancedMesh(o.geometry, mat, n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    this.alpha = new Float32Array(n);
    this.alphaAttr = new InstancedBufferAttribute(this.alpha, 1).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    o.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder;
    this.mesh.count = n;
    this.mesh.visible = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.rot = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      _o.position.set(0, -9999, 0);
      _o.scale.setScalar(0);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    scene.add(this.mesh);
  }

  /** Spawn one particle. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number): void {
    const p = this.next;
    this.next = (p + 1) % this.o.capacity;
    if (this.life[p] <= 0) this.live++;
    this.pos[p * 3] = x;
    this.pos[p * 3 + 1] = y;
    this.pos[p * 3 + 2] = z;
    this.vel[p * 3] = vx;
    this.vel[p * 3 + 1] = vy;
    this.vel[p * 3 + 2] = vz;
    this.rot[p * 3] = Math.random() * 6.28;
    this.rot[p * 3 + 1] = Math.random() * 6.28;
    this.rot[p * 3 + 2] = Math.random() * 6.28;
    this.life[p] = life;
    this.max[p] = life;
    this.size[p] = size;
    _c.setHex(color);
    this.mesh.setColorAt(p, _c);
  }

  /** A ring of `n` particles bursting outward on the ground plane (landing puffs, splashes). */
  ring(x: number, y: number, z: number, n: number, speed: number, color: number, size: number, life: number, up = 0.6): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const s = speed * (0.7 + Math.random() * 0.5);
      this.spawn(x, y, z, Math.cos(a) * s, up + Math.random() * up, Math.sin(a) * s, color, size * (0.8 + Math.random() * 0.4), life * (0.8 + Math.random() * 0.4));
    }
  }

  update(dt: number): void {
    if (this.live <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const o = this.o;
    const keep = Math.pow(o.drag, dt);
    let live = 0;
    for (let p = 0; p < o.capacity; p++) {
      if (this.life[p] <= 0) continue;
      this.life[p] -= dt;
      if (this.life[p] <= 0) {
        this.alpha[p] = 0;
        _o.position.set(0, -9999, 0);
        _o.scale.setScalar(0);
        _o.rotation.set(0, 0, 0);
        _o.updateMatrix();
        this.mesh.setMatrixAt(p, _o.matrix);
        continue;
      }
      live++;
      const i3 = p * 3;
      this.vel[i3] *= keep;
      this.vel[i3 + 2] *= keep;
      this.vel[i3 + 1] = this.vel[i3 + 1] * keep - o.gravity * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const u = 1 - this.life[p] / this.max[p]; // 0 → 1
      const s = this.size[p] * (1 + (o.grow - 1) * u);
      if (o.spin) {
        this.rot[i3] += dt * 9;
        this.rot[i3 + 1] += dt * 7;
      }
      _o.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      _o.rotation.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
      _o.scale.setScalar(s);
      _o.updateMatrix();
      this.mesh.setMatrixAt(p, _o.matrix);
      this.alpha[p] = Math.pow(1 - u, o.fadePow) * (o.spin ? Math.min(1, (1 - u) * 4) : 1);
    }
    this.live = live;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.mesh.dispose();
  }
}

/** Soft smoke balls. */
export function puffPool(scene: Scene, capacity = 160): ParticlePool {
  return new ParticlePool(scene, { capacity, geometry: new IcosahedronGeometry(1, 1), gravity: -0.6, drag: 0.25, grow: 2.2, spin: false, fadePow: 1.4, renderOrder: 7 });
}

/** Tumbling cubes. */
export function shardPool(scene: Scene, capacity = 96): ParticlePool {
  return new ParticlePool(scene, { capacity, geometry: new BoxGeometry(1, 1, 1), gravity: 16, drag: 0.6, grow: 0.6, spin: true, fadePow: 0.3, renderOrder: 7 });
}
