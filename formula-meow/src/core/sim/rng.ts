// Copied from catnip-heist/src/sim/rng.ts (copy, never import), plus stream seeding (GDD 3.1).
/** Seeded integer RNG (xorshift32). A state is a uint32 stored in the sim state. */
import { fnvInt, FNV_OFFSET } from './hash';

/** Turn any integer seed into a non-zero uint32 RNG state. */
export function seedRng(seed: number): number {
  let s = (seed | 0) ^ 0x9e3779b9;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
  s ^= s >>> 16;
  s >>>= 0;
  return s === 0 ? 0x6d2b79f5 : s;
}

/** Advance the RNG state. */
export function nextRng(s: number): number {
  let x = s | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/** Integer in [0, n) derived from a (post-advance) RNG state. */
export function rngInt(s: number, n: number): number {
  return (s >>> 8) % n;
}

/** Float in [0, 1) derived from a (post-advance) RNG state. */
export function rngFloat(s: number): number {
  return (s >>> 8) / 16777216;
}

/** Stream ids: adding a draw to one stream never shifts another. */
export const STREAM = { items: 1, ai: 2, hazards: 3, personality: 4 } as const;

/** RNG state for (seed, stream, index), e.g. the items stream of kart 3. */
export function streamSeed(seed: number, stream: number, index = 0): number {
  return seedRng(fnvInt(fnvInt(fnvInt(FNV_OFFSET, seed), stream), index));
}

/**
 * Draw from a stream held in an object field: `const r = draw(kart, 'rngAi')` advances kart.rngAi and returns
 * a float in [0, 1).
 */
export function draw<K extends string>(holder: Record<K, number>, key: K): number {
  const s = nextRng(holder[key]);
  holder[key] = s;
  return rngFloat(s);
}
