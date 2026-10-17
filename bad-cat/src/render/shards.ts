/**
 * Visual-only debris (GDD 4.4, 11.1): one InstancedMesh pool of 300 generic chunks tinted from the
 * broken prop's palette, plus a small pool of spill puddles. Bursts are seeded from the prop index
 * and the tick it broke, and integrate with the frame's tick delta, so a clip re-render (same ticks,
 * same deltas) draws the same shards. Never touches SimState.
 */
import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from 'three';

export const SHARD_POOL = 300;
const PUDDLE_POOL = 16;
/** Hero chunks reserved at the end of the pool (round 3: the room piles up wreckage for the end shot). */
export const HERO_POOL = 24;

/** mulberry32: tiny seeded RNG for visuals only. */
export function visRng(seed: number): () => number {
  let a = seed >>> 0 || 0x2545f491;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Material-aware burst styles (FULL build). `shardColors(kind)` in props-view.ts tags its palette array with the
 * prop kind, so `burst()` recognises the material without any change at the call site: balloons pop into confetti,
 * flour puffs into a slow cloud, popcorn bursts and bounces, glass glitters, food splats into flat blobs, paper
 * flutters down, tinsel and ornaments sparkle. `burstFor(kind, ...)` does the same explicitly.
 */
export type BurstStyle = 'default' | 'confetti' | 'cloud' | 'popcorn' | 'glitter' | 'splat' | 'paper' | 'tinsel';

/** Per-style multipliers and particle behaviour. */
export interface StyleSpec {
  count: number;
  speed: number;
  up: number;
  size: number;
  /** air drag per second (0..1): paper and confetti flutter down */
  drag: number;
  /** size growth per second (cloud puffs swell) */
  grow: number;
  /** vertical squash of the chunk (splat blobs, paper sheets) */
  flat: number;
  gravity: number;
  /** seconds to live (Infinity = settle as debris) */
  life: number;
  /** side-to-side flutter amplitude (m/s) */
  flutter: number;
}

export const BURST_STYLES: Readonly<Record<BurstStyle, StyleSpec>> = {
  default: { count: 1, speed: 1, up: 1, size: 1, drag: 0, grow: 0, flat: 1, gravity: 1, life: Infinity, flutter: 0 },
  confetti: { count: 1.3, speed: 1.1, up: 1.35, size: 0.75, drag: 0.85, grow: 0, flat: 0.25, gravity: 0.32, life: Infinity, flutter: 0.9 },
  cloud: { count: 0.8, speed: 0.45, up: 0.55, size: 2.4, drag: 0.9, grow: 0.7, flat: 1, gravity: -0.02, life: 1.6, flutter: 0.2 },
  popcorn: { count: 1.2, speed: 0.9, up: 1.5, size: 1.05, drag: 0.1, grow: 0, flat: 1.1, gravity: 1, life: Infinity, flutter: 0 },
  glitter: { count: 1.15, speed: 1.15, up: 1.05, size: 0.7, drag: 0.15, grow: 0, flat: 0.6, gravity: 1, life: Infinity, flutter: 0 },
  splat: { count: 0.8, speed: 0.8, up: 0.8, size: 1.5, drag: 0.2, grow: 0, flat: 0.28, gravity: 1.2, life: Infinity, flutter: 0 },
  paper: { count: 0.9, speed: 0.8, up: 1.2, size: 1.3, drag: 0.92, grow: 0, flat: 0.12, gravity: 0.22, life: Infinity, flutter: 1.2 },
  tinsel: { count: 1.2, speed: 1.2, up: 1.3, size: 0.65, drag: 0.6, grow: 0, flat: 0.3, gravity: 0.45, life: Infinity, flutter: 0.7 },
};

/** Burst style by prop kind (material + a few named exceptions). */
export function burstStyle(kind: number): BurstStyle {
  switch (kind) {
    case 28:
    case 32:
      return 'confetti'; // balloon, candles
    case 37:
      return 'cloud'; // flour
    case 22:
      return 'popcorn';
    case 16:
    case 60:
    case 61:
      return 'tinsel'; // ornament, snow globe, gift wrap
    case 1:
    case 13:
    case 31:
    case 44:
    case 45:
    case 55:
    case 58:
    case 62:
      return 'glitter'; // glass
    case 5:
    case 6:
    case 38:
    case 47:
    case 48:
    case 49:
    case 36:
    case 41:
      return 'splat'; // food
    case 12:
    case 15:
    case 30:
    case 40:
    case 51:
    case 53:
      return 'paper';
    default:
      return 'default';
  }
}

const TAGGED = new WeakMap<readonly number[], number>();
/** Mark a palette array as belonging to prop `kind` (props-view.ts shardColors). Returns the same array. */
export function tagShardColors<T extends number[]>(colors: T, kind: number): T {
  TAGGED.set(colors, kind);
  return colors;
}

export interface BurstOpts {
  count: number;
  colors: number[];
  seed: number;
  /** horizontal speed scale (m/s) */
  speed?: number;
  /** upward kick (m/s) */
  up?: number;
  /** push direction bias */
  dirX?: number;
  dirZ?: number;
  /** seconds to live; Infinity = settle and stay as debris */
  life?: number;
  /** Round 3: this many big "hero" chunks (0.04–0.06 m) that stay near the landing cell for the rest of the run. */
  hero?: number;
  /** gravity multiplier (negative floats up: hearts) */
  gravity?: number;
  size?: number;
  /** FULL build: material style (default: from a tagged palette, else 'default') */
  style?: BurstStyle;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class Shards {
  readonly mesh: InstancedMesh;
  readonly puddles: InstancedMesh;
  private pos = new Float32Array(SHARD_POOL * 3);
  private vel = new Float32Array(SHARD_POOL * 3);
  private rot = new Float32Array(SHARD_POOL * 3);
  private spin = new Float32Array(SHARD_POOL * 3);
  private size = new Float32Array(SHARD_POOL);
  private floor = new Float32Array(SHARD_POOL);
  private life = new Float32Array(SHARD_POOL);
  private age = new Float32Array(SHARD_POOL);
  private grav = new Float32Array(SHARD_POOL);
  private drag = new Float32Array(SHARD_POOL);
  private grow = new Float32Array(SHARD_POOL);
  private flat = new Float32Array(SHARD_POOL);
  private flut = new Float32Array(SHARD_POOL);
  private state = new Uint8Array(SHARD_POOL); // 0 free, 1 flying, 2 settled
  private next = 0;
  private pud: { x: number; y: number; z: number; r: number; age: number; on: boolean; rot: number }[] = [];
  private nextPud = 0;
  private dirty = false;
  /** Room floor rectangle (half extents in m, minus 0.05): shards never settle outside the dollhouse. */
  private hx = Infinity;
  private hz = Infinity;
  /** Hero chunks live in their own small ring at the end of the pool, so a later burst never recycles them early. */
  private nextHero = 0;

  constructor() {
    const geo = new OctahedronGeometry(0.03, 0);
    geo.scale(1, 0.5, 0.8);
    const mat = new MeshLambertMaterial({ flatShading: true });
    this.mesh = new InstancedMesh(geo, mat, SHARD_POOL);
    this.mesh.name = 'shards';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SHARD_POOL; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, _c.setHex(0xffffff));
    }
    // irregular puddle blob
    const pg = new CircleGeometry(1, 14);
    const pa = pg.getAttribute('position');
    for (let i = 1; i < pa.count; i++) {
      const k = 0.78 + 0.22 * Math.abs(Math.sin(i * 2.7));
      pa.setXY(i, pa.getX(i) * k, pa.getY(i) * k);
    }
    pg.rotateX(-Math.PI / 2);
    const pm = new MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.puddles = new InstancedMesh(pg, pm, PUDDLE_POOL);
    this.puddles.name = 'puddles';
    this.puddles.frustumCulled = false;
    for (let i = 0; i < PUDDLE_POOL; i++) {
      this.puddles.setMatrixAt(i, zero);
      this.puddles.setColorAt(i, _c.setHex(0xffffff));
      this.pud.push({ x: 0, y: 0, z: 0, r: 0, age: 0, on: false, rot: 0 });
    }
  }

  /** The room's floor rectangle (half width, half depth in m). Shards are clamped inside it, minus 0.05 m. */
  setBounds(halfW: number, halfD: number): void {
    this.hx = Math.max(0, halfW - 0.05);
    this.hz = Math.max(0, halfD - 0.05);
  }

  burst(at: Vector3, floorY: number, o: BurstOpts): void {
    const rnd = visRng(o.seed);
    const tagged = TAGGED.get(o.colors);
    const st = BURST_STYLES[o.style ?? (tagged !== undefined ? burstStyle(tagged) : 'default')];
    const sp = (o.speed ?? 1.6) * st.speed;
    const up = (o.up ?? 1.8) * st.up;
    const count = Math.min(SHARD_POOL - HERO_POOL, Math.round(o.count * st.count));
    const hero = st.life === Infinity ? Math.min(HERO_POOL, Math.max(0, o.hero ?? 0)) : 0;
    for (let n = 0; n < count + hero; n++) {
      const isHero = n >= count;
      let i: number;
      if (isHero) {
        i = SHARD_POOL - HERO_POOL + this.nextHero;
        this.nextHero = (this.nextHero + 1) % HERO_POOL;
      } else {
        i = this.next;
        this.next = (this.next + 1) % (SHARD_POOL - HERO_POOL);
      }
      const a = rnd() * Math.PI * 2;
      const v = sp * (0.35 + rnd() * 0.65);
      this.pos[i * 3] = at.x + (rnd() - 0.5) * 0.08;
      this.pos[i * 3 + 1] = at.y + 0.03 + rnd() * 0.05;
      this.pos[i * 3 + 2] = at.z + (rnd() - 0.5) * 0.08;
      this.vel[i * 3] = Math.cos(a) * v + (o.dirX ?? 0) * sp * 0.4;
      this.vel[i * 3 + 1] = up * (0.5 + rnd() * 0.7);
      this.vel[i * 3 + 2] = Math.sin(a) * v + (o.dirZ ?? 0) * sp * 0.4;
      for (let k = 0; k < 3; k++) {
        this.rot[i * 3 + k] = rnd() * 6.28;
        this.spin[i * 3 + k] = (rnd() - 0.5) * 22;
      }
      this.size[i] = (o.size ?? 1) * st.size * (0.55 + rnd() * 0.9);
      this.drag[i] = st.drag;
      this.grow[i] = st.grow;
      this.flat[i] = st.flat;
      this.flut[i] = st.flutter * (rnd() - 0.5) * 2;
      if (isHero) {
        // big chunks hop a little and settle by the landing cell (0.04–0.06 m across)
        this.vel[i * 3] *= 0.18;
        this.vel[i * 3 + 2] *= 0.18;
        this.vel[i * 3 + 1] *= 0.45;
        this.size[i] = 1.4 + rnd() * 0.6;
      }
      this.floor[i] = floorY + 0.004;
      this.life[i] = o.life ?? st.life;
      this.age[i] = 0;
      this.grav[i] = (o.gravity ?? 1) * st.gravity;
      if (isHero) {
        this.drag[i] = 0;
        this.flat[i] = Math.max(0.5, st.flat);
        this.flut[i] = 0;
        this.grow[i] = 0;
      }
      this.state[i] = 1;
      this.mesh.setColorAt(i, _c.setHex(o.colors[Math.floor(rnd() * o.colors.length) % o.colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = true;
  }

  /** Material-aware burst for prop `kind` (style from `burstStyle`); colours from the caller's palette. */
  burstFor(kind: number, at: Vector3, floorY: number, o: Omit<BurstOpts, 'style'>): void {
    this.burst(at, floorY, { ...o, style: burstStyle(kind) });
  }

  puddle(at: Vector3, color: number, radius: number, seed: number): void {
    const i = this.nextPud;
    this.nextPud = (this.nextPud + 1) % PUDDLE_POOL;
    const p = this.pud[i];
    p.x = at.x;
    // above rug tops (0.018 m) when it lands on the floor, so a spill on a rug shows
    p.y = at.y < 0.05 ? 0.021 : at.y + 0.003;
    p.z = at.z;
    p.r = radius;
    p.age = 0;
    p.on = true;
    p.rot = visRng(seed)() * 6.28;
    this.puddles.setColorAt(i, _c.setHex(color));
    if (this.puddles.instanceColor) this.puddles.instanceColor.needsUpdate = true;
  }

  /** Advance by dt seconds (0 = just redraw). */
  update(dt: number): void {
    const g = 9.8;
    let any = this.dirty;
    for (let i = 0; i < SHARD_POOL; i++) {
      const st = this.state[i];
      if (st === 0) continue;
      if (st === 1 && dt > 0) {
        any = true;
        this.age[i] += dt;
        if (this.age[i] > this.life[i]) {
          this.state[i] = 0;
          this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
          continue;
        }
        const j = i * 3;
        this.vel[j + 1] -= g * this.grav[i] * dt;
        const dr = this.drag[i];
        if (dr > 0) {
          const k = Math.pow(1 - dr, dt);
          this.vel[j] *= k;
          this.vel[j + 2] *= k;
          // falling sheets reach a slow terminal speed
          if (this.vel[j + 1] < 0) this.vel[j + 1] *= Math.pow(1 - dr * 0.7, dt);
          if (this.flut[i] !== 0) this.vel[j] += Math.sin(this.age[i] * 9 + i) * this.flut[i] * dt * 4;
        }
        if (this.grow[i] > 0) this.size[i] *= 1 + this.grow[i] * dt;
        this.pos[j] += this.vel[j] * dt;
        this.pos[j + 1] += this.vel[j + 1] * dt;
        this.pos[j + 2] += this.vel[j + 2] * dt;
        this.rot[j] += this.spin[j] * dt;
        this.rot[j + 1] += this.spin[j + 1] * dt;
        this.rot[j + 2] += this.spin[j + 2] * dt;
        if (this.grav[i] > 0 && this.pos[j + 1] < this.floor[i]) {
          // round 3: a shard that left the dollhouse and drops past the floor is gone (it used to lie in the void
          // below the room for the rest of the run, and on the share poster)
          if (this.floor[i] <= 0.01 && (Math.abs(this.pos[j]) > this.hx || Math.abs(this.pos[j + 2]) > this.hz)) {
            this.state[i] = 0;
            this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
            continue;
          }
          // a raised landing (table top) keeps its shards inside the room rectangle too
          this.pos[j] = Math.max(-this.hx, Math.min(this.hx, this.pos[j]));
          this.pos[j + 2] = Math.max(-this.hz, Math.min(this.hz, this.pos[j + 2]));
          this.pos[j + 1] = this.floor[i];
          if (Math.abs(this.vel[j + 1]) < 0.6) {
            this.vel[j] = this.vel[j + 1] = this.vel[j + 2] = 0;
            this.rot[j] = 0;
            this.rot[j + 2] = 0;
            if (this.life[i] === Infinity) this.state[i] = 2;
          } else {
            this.vel[j + 1] *= -0.32;
            this.vel[j] *= 0.55;
            this.vel[j + 2] *= 0.55;
            this.spin[j] *= 0.5;
            this.spin[j + 2] *= 0.5;
          }
        }
      } else if (!any && st === 2) continue;
      const j = i * 3;
      let sc = this.size[i];
      if (this.life[i] !== Infinity) sc *= 1 - Math.max(0, (this.age[i] - this.life[i] * 0.6) / (this.life[i] * 0.4));
      _e.set(this.rot[j], this.rot[j + 1], this.rot[j + 2]);
      _q.setFromEuler(_e);
      _m.compose(_p.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]), _q, _s.set(sc, sc * this.flat[i], sc));
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
    let pd = false;
    for (let i = 0; i < PUDDLE_POOL; i++) {
      const p = this.pud[i];
      if (!p.on) continue;
      if (p.age < 1 || dt === 0) {
        p.age = Math.min(1, p.age + dt * 2.5);
        const k = 1 - Math.pow(1 - p.age, 3);
        _q.setFromAxisAngle(_p.set(0, 1, 0), p.rot);
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.r * k, 1, p.r * k * 0.85));
        this.puddles.setMatrixAt(i, _m);
        pd = true;
      }
    }
    if (pd) this.puddles.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    const zero = _m.makeScale(0, 0, 0);
    for (let i = 0; i < SHARD_POOL; i++) {
      this.state[i] = 0;
      this.mesh.setMatrixAt(i, zero);
    }
    for (let i = 0; i < PUDDLE_POOL; i++) {
      this.pud[i].on = false;
      this.puddles.setMatrixAt(i, zero);
    }
    this.next = 0;
    this.nextHero = 0;
    this.nextPud = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.puddles.instanceMatrix.needsUpdate = true;
  }

  /** Live shard count (tests / debug). */
  get alive(): number {
    let n = 0;
    for (let i = 0; i < SHARD_POOL; i++) if (this.state[i]) n++;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
    this.mesh.dispose();
    this.puddles.geometry.dispose();
    (this.puddles.material as MeshLambertMaterial).dispose();
    this.puddles.dispose();
  }
}
