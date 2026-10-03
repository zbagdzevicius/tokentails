/**
 * Voxel particles (one InstancedMesh of cubes, one draw call) and expanding floor rings
 * (meow sound waves, swap pulses). Render-side only: floats and Math.random are fine here.
 */
import * as THREE from 'three';
import { PALETTE } from '../types';

const MAX_PARTICLES = 600;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  gravity: number;
  drag: number;
  spin: number;
  color: THREE.Color;
  glow: number;
}

export interface BurstOptions {
  count: number;
  colors: string[];
  speed?: number;
  up?: number;
  size?: number;
  life?: number;
  gravity?: number;
  spread?: number;
  drag?: number;
  /** Colour multiplier (> 1 blooms on the high tier). */
  glow?: number;
}

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Particle[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly colorCache = new Map<string, THREE.Color>();
  private readonly tmpC = new THREE.Color();
  /** Live instances uploaded last frame (0 twice in a row = nothing to send). */
  private uploaded = 0;

  constructor() {
    // Unlit so per-instance colours can exceed 1 (HDR) and bloom.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'particles';
  }

  private col(hex: string): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colorCache.set(hex, c);
    }
    return c;
  }

  burst(x: number, y: number, z: number, o: BurstOptions): void {
    const speed = o.speed ?? 2;
    const spread = o.spread ?? 0.15;
    for (let i = 0; i < o.count; i++) {
      if (this.list.length >= MAX_PARTICLES) this.list.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.65);
      const life = (o.life ?? 0.8) * (0.6 + Math.random() * 0.6);
      this.list.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + Math.random() * spread,
        z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * sp,
        vy: (o.up ?? 2.5) * (0.5 + Math.random() * 0.8),
        vz: Math.sin(a) * sp,
        life,
        max: life,
        size: (o.size ?? 0.07) * (0.7 + Math.random() * 0.6),
        gravity: o.gravity ?? 7,
        drag: o.drag ?? 1.5,
        spin: (Math.random() - 0.5) * 12,
        color: this.col(o.colors[i % o.colors.length]),
        glow: o.glow ?? 1,
      });
    }
  }

  coin(x: number, z: number): void {
    this.burst(x, 0.45, z, { count: 18, colors: ['#9be15d', '#5fbf3a', PALETTE.coin, PALETTE.cream], speed: 1.8, up: 3.2, size: 0.07, life: 0.7, glow: 1.8 });
    this.burst(x, 0.5, z, { count: 8, colors: ['#eaffc0', '#ffffff'], speed: 0.9, up: 2.2, size: 0.045, life: 0.9, gravity: 1.2, glow: 3 });
  }

  key(x: number, z: number): void {
    this.burst(x, 0.5, z, { count: 26, colors: [PALETTE.coin, PALETTE.cream, '#ffffff'], speed: 2.2, up: 3.6, size: 0.07, life: 0.9, glow: 2.4 });
  }

  /** Footstep dust: a few soft voxels kicked back from the feet. */
  step(x: number, z: number, vx: number, vz: number): void {
    const sp = Math.hypot(vx, vz) || 1;
    const bx = x - (vx / sp) * 0.18, bz = z - (vz / sp) * 0.18;
    this.burst(bx, 0.04, bz, { count: 3, colors: ['#b9a6d8', '#8f7ab8', '#d8ccee'], speed: 0.45, up: 0.55, size: 0.055, life: 0.45, gravity: 0.6, drag: 4, spread: 0.18 });
  }

  puff(x: number, z: number): void {
    this.burst(x, 0.3, z, { count: 22, colors: [PALETTE.lilac, '#ffffff', PALETTE.lavender], speed: 1.6, up: 1.4, size: 0.12, life: 0.6, gravity: -0.8, drag: 3.5, spread: 0.4 });
    this.burst(x, 0.5, z, { count: 10, colors: [PALETTE.ember, '#ff3b2e'], speed: 2.4, up: 2.5, size: 0.07, life: 0.5 });
  }

  hearts(x: number, z: number): void {
    this.burst(x, 0.7, z, { count: 30, colors: [PALETTE.pink, '#ff4d7e', PALETTE.lilac, PALETTE.cream], speed: 1.5, up: 3, size: 0.08, life: 1.2, gravity: 2.5 });
  }

  sparkle(x: number, z: number, color: string = PALETTE.mint): void {
    this.burst(x, 0.15, z, { count: 14, colors: [color, '#ffffff'], speed: 0.8, up: 2.2, size: 0.06, life: 0.9, gravity: 0.5, spread: 0.6, glow: 2.2 });
  }

  dust(x: number, z: number): void {
    this.burst(x, 0.1, z, { count: 12, colors: ['#8a6fa8', '#b89ad6'], speed: 1.2, up: 0.8, size: 0.08, life: 0.5, gravity: 1, drag: 3, spread: 0.7 });
  }

  confetti(x: number, z: number): void {
    const colors = [PALETTE.coin, PALETTE.pink, PALETTE.mint, PALETTE.sky, PALETTE.lilac, PALETTE.rust, PALETTE.cream];
    this.burst(x, 1.2, z, { count: 150, colors, speed: 2.6, up: 3.6, size: 0.085, life: 2.4, gravity: 3.2, drag: 1.4, spread: 1.2 });
    this.burst(x, 0.6, z, { count: 22, colors: ['#ffffff', PALETTE.coin], speed: 3.4, up: 5, size: 0.045, life: 1.2, gravity: 2.5, drag: 1.2, spread: 0.6, glow: 1.7 });
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      this.list[w++] = p;
    }
    this.list.length = w;
    for (let i = 0; i < w; i++) {
      const p = this.list[i];
      const t = p.life / p.max;
      const sc = p.size * Math.min(1, t * 3);
      const r = (p.max - p.life) * p.spin;
      this.e.set(r, r * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.set(sc, sc, sc);
      this.p.set(p.x, p.y, p.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, p.glow === 1 ? p.color : this.tmpC.copy(p.color).multiplyScalar(p.glow));
    }
    this.mesh.count = w;
    // Upload only the live instances, and nothing at all while there are none.
    if (w > 0 || this.uploaded > 0) {
      markRange(this.mesh.instanceMatrix, w * 16);
      if (this.mesh.instanceColor) markRange(this.mesh.instanceColor, w * 3);
    }
    this.uploaded = w;
  }

  clear(): void {
    this.list.length = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Flag an attribute for upload of its first `count` components only (skipped when 0). */
export function markRange(a: THREE.BufferAttribute, count: number): void {
  if (count <= 0) return;
  a.clearUpdateRanges();
  a.addUpdateRange(0, count);
  a.needsUpdate = true;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  from: number;
  to: number;
  alpha: number;
}

/** Pool of flat expanding rings on the floor (meow waves, swap pulses). */
export class Rings {
  readonly group = new THREE.Group();
  private readonly pool: Ring[] = [];
  private readonly geo = new THREE.RingGeometry(0.86, 1, 40, 1);

  constructor(size = 8) {
    this.geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.pool.push({ mesh, t: 0, dur: 1, from: 0, to: 1, alpha: 1 });
    }
    this.group.name = 'rings';
  }

  spawn(x: number, z: number, color: string, from: number, to: number, dur: number, alpha = 0.8, y = 0.04): void {
    const r = this.pool.find((p) => !p.mesh.visible) ?? this.pool.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(1.7);
    r.t = 0;
    r.dur = dur;
    r.from = from;
    r.to = to;
    r.alpha = alpha;
  }

  /** Hide every ring (a restarted run starts with a clean floor). */
  clear(): void {
    for (const r of this.pool) r.mesh.visible = false;
  }

  meow(x: number, z: number, radius: number): void {
    this.spawn(x, z, PALETTE.pink, 0.3, radius, 0.9, 0.85);
    this.spawn(x, z, PALETTE.lilac, 0.2, radius * 0.7, 0.75, 0.6);
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - k) * (1 - k);
      const s = r.from + (r.to - r.from) * e;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.alpha * (1 - k);
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const r of this.pool) (r.mesh.material as THREE.Material).dispose();
  }
}

/**
 * Meow sound waves: expanding floor rings masked to the tiles the sound actually reaches (the
 * sim's line of sight from the meowing cat, within the level), so rings never spill past walls
 * into the void. One small pool; each ring samples a per-wave tile mask texture.
 */
export class MeowWaves {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.RingGeometry(0.9, 1, 48, 1);
  private readonly pool: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; to: number; alpha: number }[] = [];
  private readonly masks: THREE.DataTexture[] = [];
  private w = 1;
  private h = 1;
  private next = 0;

  constructor(size = 4) {
    this.geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < size; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMask: { value: null },
          uSize: { value: new THREE.Vector2(1, 1) },
          uColor: { value: new THREE.Color(PALETTE.pink) },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMask;
          uniform vec2 uSize;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vW;
          void main() {
            float m = texture2D(uMask, vW / uSize).r;
            if (m < 0.02) discard;
            gl_FragColor = vec4(uColor, uOpacity * m);
            #include <colorspace_fragment>
          }`,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, t: 0, dur: 1, to: 1, alpha: 1 });
    }
    this.group.name = 'meow-waves';
  }

  /** Level size in tiles (resets the masks). */
  setSize(w: number, h: number): void {
    for (const m of this.masks) m.dispose();
    this.masks.length = 0;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    for (const p of this.pool) {
      p.mesh.visible = false;
      (p.mat.uniforms.uSize.value as THREE.Vector2).set(this.w, this.h);
    }
  }

  /** Spawn a wave at (x, z) reaching `radius` tiles; `hears(tx, ty)` = the sound reaches that tile. */
  meow(x: number, z: number, radius: number, hears: (tx: number, ty: number) => boolean): void {
    const data = new Uint8Array(this.w * this.h * 4);
    for (let ty = 0; ty < this.h; ty++)
      for (let tx = 0; tx < this.w; tx++) {
        if (!hears(tx, ty)) continue;
        const i = (ty * this.w + tx) * 4;
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
      }
    const tex = new THREE.DataTexture(data, this.w, this.h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.masks.push(tex);
    // Two waves share one mask; keep only the textures still in use.
    while (this.masks.length > this.pool.length) this.masks.shift()!.dispose();
    const waves: [string, number, number, number][] = [
      [PALETTE.pink, radius, 0.9, 0.8],
      [PALETTE.lilac, radius * 0.7, 0.75, 0.55],
    ];
    for (const [color, to, dur, alpha] of waves) {
      const r = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      r.mesh.visible = true;
      r.mesh.position.set(x, 0.04, z);
      r.mat.uniforms.uMask.value = tex;
      (r.mat.uniforms.uColor.value as THREE.Color).set(color);
      r.t = 0;
      r.dur = dur;
      r.to = to;
      r.alpha = alpha;
    }
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - k) * (1 - k);
      const s = 0.3 + (r.to - 0.3) * e;
      r.mesh.scale.set(s, 1, s);
      r.mat.uniforms.uOpacity.value = r.alpha * (1 - k);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    for (const r of this.pool) r.mat.dispose();
    for (const m of this.masks) m.dispose();
  }
}
