/**
 * Seeded random numbers (plan F10, G7 deterministic capture).
 *
 * mulberry32: tiny, fast, and good enough for spawn positions, fireflies and idle timers. The
 * same seed gives the same sequence on every device, so captures and tests are reproducible.
 * Gameplay that feeds a saved score must keep using its own documented source.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive (like Phaser.Math.Between). */
  between(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  pick<T>(items: readonly T[]): T | undefined;
  /** An independent generator derived from this seed and a label. */
  fork(label: string): Rng;
  readonly seed: number;
}

/** 32-bit FNV-1a of a string, as an unsigned integer. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRng(seed: number | string): Rng {
  const initial = (typeof seed === "string" ? hashString(seed) : Math.floor(seed)) >>> 0;
  let state = initial;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    seed: initial,
    next,
    between(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    pick(items) {
      if (!items.length) return undefined;
      return items[Math.floor(next() * items.length)];
    },
    fork(label) {
      return createRng(hashString(`${initial}:${label}`));
    },
  };
  return rng;
}
