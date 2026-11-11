/**
 * The bot chatter's own PRNG (docs/plans/moba/MATCH-CHAT.md §5.1): mulberry32 over a 32-bit seed, and an FNV-1a string
 * hash for seeds. Never Math.random, never the sim's RNG (the chatter must not touch the deterministic sim).
 *
 * Pure, no imports: vendored verbatim into backend/src/vendor/pawlegends-chat (TypeScript 4.8 compatible).
 */

/** FNV-1a over the UTF-16 code units of `s`, as a uint32. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** A float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** A float in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  pick<T>(a: readonly T[]): T {
    return a[this.int(a.length)];
  }

  /** A weighted index of `weights` (they need not sum to 1). */
  weighted(weights: readonly number[]): number {
    let sum = 0;
    for (const w of weights) sum += w;
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** A standard normal sample (Box–Muller). */
  normal(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** A lognormal sample with median `median` and log-sigma `sigma`. */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal());
  }
}
