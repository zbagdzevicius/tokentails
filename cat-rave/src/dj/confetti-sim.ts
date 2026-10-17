/**
 * L-DJ: physics-lite for the pink bow confetti. Pure typed arrays, no three.js, unit tested.
 *
 * Bows are light ribbon: gravity with strong air drag (terminal speed ~1.6 m/s), a sideways
 * flutter, tumbling spin that slows as they settle. On the floor they lie flat for a while, then
 * shrink away. Dead bows are swap-removed so the live ones are always 0..count-1 (one instanced
 * draw with `mesh.count = count`).
 */

export interface BurstOptions {
  /** Booth top centre in world space; bows spawn around and above it. */
  cx: number;
  cy: number;
  cz: number;
  /** Rain radius around the booth (metres). */
  radius: number;
  /** 0..1 share of bows fired up from the booth cannons (the rest rain from the sky). */
  cannon: number;
}

export const BOW_GRAVITY = 5.2;
/**
 * Airborne bows face the camera (bows.ts billboards them) and only tilt this far (rad, ±35°) around
 * that, in a slow flutter: the bow shape reads face-on most of the time, never as an edge-on petal.
 */
export const BOW_TUMBLE_MAX = (35 * Math.PI) / 180;
export const BOW_DRAG = 3.2;
/** Seconds a landed bow stays on the floor before shrinking. */
export const BOW_REST = 2.6;
export const BOW_SHRINK = 0.7;
/** Floor height bows land on. */
export const BOW_FLOOR_Y = 0.012;

export type Rng = () => number;

export class BowSim {
  readonly capacity: number;
  /** Live bows: indices 0..count-1. */
  count = 0;
  /** Current cap (quality); never above capacity. */
  limit: number;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  /**
   * Euler angles (x, y, z). Airborne: the tilt away from facing the camera (|each| <= BOW_TUMBLE_MAX);
   * landed: the world orientation (flat on the floor). `spin`: per-axis flutter speed (rad/s).
   */
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  /** Per bow: [flutter phase, flutter freq, size, shade 0..1]. */
  readonly look: Float32Array;
  /** Seconds since landing; < 0 while airborne. */
  readonly landed: Float32Array;
  /** Seconds alive. */
  readonly age: Float32Array;

  constructor(capacity: number, limit = capacity) {
    this.capacity = capacity;
    this.limit = Math.min(limit, capacity);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);
    this.look = new Float32Array(capacity * 4);
    this.landed = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
  }

  setLimit(limit: number): void {
    this.limit = Math.max(0, Math.min(limit, this.capacity));
    if (this.count > this.limit) this.count = this.limit;
  }

  /**
   * Spawn up to `n` bows (capped by the free room under `limit`; when full, the oldest landed
   * bows are recycled first so a new drop always shows). Returns the number spawned.
   */
  burst(n: number, o: BurstOptions, rng: Rng = Math.random): number {
    let room = this.limit - this.count;
    if (room < n) {
      // Recycle bows already lying on the floor to make room for fresh ones.
      for (let i = this.count - 1; i >= 0 && room < n; i--) {
        if (this.landed[i] >= 0) {
          this.kill(i);
          room++;
        }
      }
    }
    const spawn = Math.max(0, Math.min(n, this.limit - this.count));
    for (let k = 0; k < spawn; k++) {
      const i = this.count++;
      const p = i * 3;
      if (rng() < o.cannon) {
        // Fired up from the booth corners, fanning out towards the crowd.
        const side = rng() < 0.5 ? -1 : 1;
        this.pos[p] = o.cx + side * (0.9 + rng() * 0.3);
        this.pos[p + 1] = o.cy + 0.2;
        this.pos[p + 2] = o.cz + (rng() - 0.3) * 0.8;
        const a = rng() * Math.PI * 2;
        const out = 1.5 + rng() * 3.2;
        this.vel[p] = Math.cos(a) * out + side * 1.2;
        this.vel[p + 1] = 6 + rng() * 5;
        this.vel[p + 2] = Math.sin(a) * out + 1.2;
      } else {
        // Rain from the sky, biased towards the front (+Z, the hero camera side).
        const a = rng() * Math.PI * 2;
        const r = o.radius * Math.sqrt(rng());
        this.pos[p] = o.cx + Math.cos(a) * r;
        this.pos[p + 1] = o.cy + 3 + rng() * 7;
        this.pos[p + 2] = o.cz + Math.abs(Math.sin(a)) * r * 0.9 + (rng() - 0.5) * 2;
        this.vel[p] = (rng() - 0.5) * 0.6;
        this.vel[p + 1] = -0.5 - rng() * 0.8;
        this.vel[p + 2] = (rng() - 0.5) * 0.6;
      }
      // Slow flutter around facing the camera (fast spin made the bows read as moths, a free
      // tumble as edge-on petals).
      this.spin[p] = (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 1.1);
      this.spin[p + 1] = (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.9);
      this.spin[p + 2] = (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.8);
      this.rot[p] = this.rot[p + 1] = this.rot[p + 2] = 0;
      const l = i * 4;
      this.look[l] = rng() * Math.PI * 2;
      this.look[l + 1] = 1.1 + rng() * 1.3;
      this.look[l + 2] = 0.75 + rng() * 0.6;
      this.look[l + 3] = rng();
      this.landed[i] = -1;
      this.age[i] = 0;
    }
    return spawn;
  }

  /** Advance by dt seconds. */
  step(dt: number): void {
    if (dt <= 0) return;
    const drag = Math.exp(-BOW_DRAG * dt);
    for (let i = 0; i < this.count; i++) {
      const p = i * 3;
      this.age[i] += dt;
      if (this.landed[i] >= 0) {
        this.landed[i] += dt;
        if (this.landed[i] > BOW_REST + BOW_SHRINK) {
          this.kill(i);
          i--;
        }
        continue;
      }
      const l = i * 4;
      const flutter = Math.sin(this.age[i] * this.look[l + 1] + this.look[l]);
      this.vel[p + 1] -= BOW_GRAVITY * dt;
      this.vel[p] *= drag;
      this.vel[p + 1] *= drag;
      this.vel[p + 2] *= drag;
      // Flutter: sideways drift plus a little lift on each swing (ribbons see-saw down).
      this.pos[p] += (this.vel[p] + flutter * 0.9) * dt;
      this.pos[p + 1] += (this.vel[p + 1] + Math.abs(flutter) * 0.35) * dt;
      this.pos[p + 2] += (this.vel[p + 2] + Math.cos(this.age[i] * this.look[l + 1] * 0.7) * 0.5) * dt;
      const t = this.age[i];
      const ph = this.look[l];
      this.rot[p] = BOW_TUMBLE_MAX * Math.sin(t * this.spin[p] + ph);
      this.rot[p + 1] = BOW_TUMBLE_MAX * Math.sin(t * this.spin[p + 1] + ph * 1.7);
      this.rot[p + 2] = BOW_TUMBLE_MAX * 0.8 * Math.sin(t * this.spin[p + 2] + ph * 2.3);
      if (this.pos[p + 1] <= BOW_FLOOR_Y) {
        this.pos[p + 1] = BOW_FLOOR_Y;
        this.vel[p] = this.vel[p + 1] = this.vel[p + 2] = 0;
        // Settle flat on the floor (the bow lies in its local XY plane).
        this.rot[p] = -Math.PI / 2;
        this.rot[p + 1] = this.look[l] % (Math.PI * 2);
        this.rot[p + 2] = 0;
        this.landed[i] = 0;
      }
    }
  }

  /** Scale multiplier for bow i (pop in on spawn, shrink out after resting). */
  scaleOf(i: number): number {
    const pop = Math.min(1, this.age[i] / 0.15);
    const l = this.landed[i];
    const out = l < 0 || l < BOW_REST ? 1 : Math.max(0, 1 - (l - BOW_REST) / BOW_SHRINK);
    return this.look[i * 4 + 2] * pop * out;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.rot.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.spin.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.look.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.landed[i] = this.landed[last];
      this.age[i] = this.age[last];
    }
  }

  clear(): void {
    this.count = 0;
  }
}
