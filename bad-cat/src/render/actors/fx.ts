/**
 * Small actor effects: the cosmetic trail behind the player's cat (tinsel, paw prints, glitter; off with Reduce
 * Motion), the Napper's floating Zzz that grow with the noise meter, and world-anchored name labels (ghosts).
 * Trail particles spawn per distance walked and age in render ticks, so the clip pass (same ticks) redraws them
 * the same way. One InstancedMesh (pool of 96) for the trail.
 */
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRAIL_STYLES, type TrailStyle } from './cosmetics';
import { hash01 } from '../geo';
import { labelTexture } from '../overlays';

const POOL = 96;

interface Particle {
  pos: Vector3;
  vel: Vector3;
  born: number;
  life: number;
  rot: number;
  spin: number;
  size: number;
}

function pawGeometry(): BufferGeometry {
  const pad = new CircleGeometry(0.03, 12);
  const toes = [
    [-0.03, 0.035],
    [-0.01, 0.05],
    [0.012, 0.05],
    [0.032, 0.035],
  ].map(([x, y]) => new CircleGeometry(0.012, 8).translate(x, y, 0));
  const g = mergeGeometries([pad, ...toes]);
  g.rotateX(-Math.PI / 2);
  return g;
}

export class TrailFx {
  readonly mesh: InstancedMesh;
  private style: TrailStyle | null = null;
  private id = 0;
  private parts: Particle[] = [];
  private last: Vector3 | null = null;
  private walked = 0;
  private seq = 0;
  private mat = new MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly _m = new Matrix4();
  private readonly _q = new Quaternion();
  private readonly _c = new Color();

  constructor() {
    this.mesh = new InstancedMesh(new PlaneGeometry(0.02, 0.06), this.mat, POOL);
    this.mesh.name = 'cat-trail';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < POOL; i++) this.mesh.setColorAt(i, this._c.setHex(0xffffff));
  }

  set(id: number): void {
    const st = TRAIL_STYLES[id] ?? null;
    if (id === this.id) return;
    this.id = id;
    this.style = st;
    this.reset();
    const old = this.mesh.geometry;
    // toy scale: the cat is ~1.9x life size, so are its trails
    this.mesh.geometry = !st ? new PlaneGeometry(0.02, 0.06) : st.kind === 'paws' ? pawGeometry().scale(1.9, 1.9, 1.9) : st.kind === 'glitter' ? new OctahedronGeometry(0.026) : st.kind === 'bubbles' ? new IcosahedronGeometry(0.03, 1) : new PlaneGeometry(0.026, 0.1);
    old.dispose();
  }

  reset(): void {
    this.parts = [];
    this.last = null;
    this.walked = 0;
    this.mesh.count = 0;
  }

  /** pos: the cat's world position (feet); surfaceY: the surface under it. */
  update(pos: Vector3, surfaceY: number, yaw: number, T: number, dtT: number, on: boolean): void {
    const st = this.style;
    if (!st || !on) {
      this.mesh.count = 0;
      this.parts = [];
      this.last = null;
      return;
    }
    if (this.last) this.walked += Math.hypot(pos.x - this.last.x, pos.z - this.last.z);
    this.last = pos.clone();
    const every = st.kind === 'paws' ? 0.16 : 0.08;
    while (this.walked >= every) {
      this.walked -= every;
      for (let k = 0; k < st.perStep; k++) this.spawn(st, pos, surfaceY, yaw, T);
    }
    const dt = dtT / 30;
    const alive: Particle[] = [];
    for (const p of this.parts) {
      if (T - p.born >= p.life) continue;
      if (st.kind !== 'paws') {
        // bubbles float up and drift (Phase 2 shop trail); everything else falls
        p.vel.y -= (st.kind === 'tinsel' ? 0.6 : st.kind === 'bubbles' ? -0.05 : 0.25) * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < p.size) {
          p.pos.y = p.size;
          p.vel.set(0, 0, 0);
        }
        p.rot += p.spin * dt;
      }
      alive.push(p);
    }
    this.parts = alive.slice(-POOL);
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const age = (T - p.born) / p.life;
      const fade = st.kind === 'paws' ? 1 - age * age : age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
      const tw = st.kind === 'glitter' ? 0.6 + 0.4 * Math.abs(Math.sin(T * 0.5 + i)) : st.kind === 'bubbles' ? 0.8 + 0.4 * age : 1;
      this._q.setFromAxisAngle(new Vector3(0, 1, 0), p.rot);
      if (st.kind === 'tinsel') this._q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), p.rot * 1.7));
      const s = Math.max(0.001, fade * tw);
      this._m.compose(p.pos, this._q, new Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, this._c.setHex(st.colors[(i + this.seq) % st.colors.length]));
    }
    this.mesh.count = this.parts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private spawn(st: TrailStyle, pos: Vector3, y: number, yaw: number, T: number): void {
    const n = this.seq++;
    const r = (k: number) => hash01(n * 7 + k * 131 + 11);
    if (st.kind === 'paws') {
      // alternate left/right prints under the cat
      const side = n % 2 ? 1 : -1;
      const p = new Vector3(pos.x + Math.cos(yaw) * 0.07 * side, y + 0.004, pos.z - Math.sin(yaw) * 0.07 * side);
      this.parts.push({ pos: p, vel: new Vector3(), born: T, life: st.life, rot: yaw, spin: 0, size: 0 });
      return;
    }
    const p = new Vector3(pos.x + (r(1) - 0.5) * 0.12, y + 0.12 + r(2) * 0.15, pos.z + (r(3) - 0.5) * 0.12);
    const v = new Vector3((r(4) - 0.5) * 0.3, 0.2 + r(5) * 0.4, (r(6) - 0.5) * 0.3);
    this.parts.push({ pos: p, vel: v, born: T, life: st.life * (0.7 + r(7) * 0.6), rot: r(8) * 6.28, spin: (r(9) - 0.5) * 12, size: y + 0.01 });
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

/** The Napper's Zzz: three letters floating up from the head, bigger and redder as the noise meter fills. */
export class Zzz {
  readonly sprites: Sprite[] = [];
  private tex: (Texture | null)[] = [];
  private mats: SpriteMaterial[] = [];

  constructor() {
    for (let i = 0; i < 3; i++) {
      const m = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
      const s = new Sprite(m);
      s.name = `zzz${i}`;
      s.renderOrder = 10;
      s.visible = false;
      this.mats.push(m);
      this.sprites.push(s);
    }
  }

  prewarm(): Texture[] {
    if (!this.tex.length) {
      this.tex = ['z', 'Z', 'Z'].map((t, i) => labelTexture(t, ['#cfe3ff', '#e9f1ff', '#ffffff'][i]));
      this.tex.forEach((t, i) => {
        this.mats[i].map = t;
        this.mats[i].needsUpdate = true;
      });
    }
    return this.tex.filter((t): t is Texture => !!t);
  }

  /** noise 0..1 of the meter; asleep 0..1 (fades them). */
  update(head: Vector3, T: number, noise: number, asleep: number): void {
    const on = asleep > 0.5;
    if (on) this.prewarm();
    for (let i = 0; i < 3; i++) {
      const s = this.sprites[i];
      s.visible = on && !!this.tex[i];
      if (!s.visible) continue;
      const u = ((T / 45 + i / 3) % 1 + 1) % 1;
      const grow = 1 + noise * 1.4;
      const sc = (0.022 + 0.018 * u) * grow;
      s.scale.set(sc * 1.6, sc * 0.6, 1);
      s.position.set(head.x + 0.08 + u * 0.18 + Math.sin(u * 6 + i) * 0.03, head.y + 0.05 + u * 0.4, head.z);
      this.mats[i].opacity = Math.sin(u * Math.PI) * asleep;
      // the meter fills toward red
      this.mats[i].color.setRGB(1, 1 - noise * 0.55, 1 - noise * 0.7);
    }
  }

  dispose(): void {
    for (const t of this.tex) t?.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** World-anchored name label (ghost names), screen-constant size. */
export class NameLabel {
  readonly sprite: Sprite;
  private mat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, opacity: 0.85 });
  private tex: Texture | null = null;
  private text = '';

  constructor() {
    this.sprite = new Sprite(this.mat);
    this.sprite.name = 'name-label';
    this.sprite.renderOrder = 10;
    this.sprite.center.set(0.5, 0);
    this.sprite.visible = false;
  }

  set(text: string, fill = '#cfe3ff'): void {
    if (text === this.text) return;
    this.text = text;
    this.tex?.dispose();
    this.tex = text ? labelTexture(text, fill) : null;
    this.mat.map = this.tex;
    this.mat.needsUpdate = true;
  }

  update(at: Vector3 | null): void {
    this.sprite.visible = !!at && !!this.tex;
    if (!at || !this.tex) return;
    this.sprite.position.copy(at);
    this.sprite.scale.set(0.09, 0.034, 1);
  }

  dispose(): void {
    this.tex?.dispose();
    this.mat.dispose();
  }
}
