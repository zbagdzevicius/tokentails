/** Seeded integer RNG (xorshift32). State is a uint32 that lives in SimState.rng. */

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
