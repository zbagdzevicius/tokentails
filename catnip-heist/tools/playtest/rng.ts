/** Seeded PRNG for the bots (mulberry32). Never Math.random: every run must be reproducible from its seed. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
    if (this.s === 0) this.s = 1;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return p > 0 && this.next() < p;
  }

  range(r: readonly [number, number]): number {
    return this.int(r[0], r[1]);
  }

  /** Independent child stream (so adding draws in one subsystem does not shift another). */
  fork(salt: number): Rng {
    return new Rng((Math.floor(this.next() * 4294967296) ^ Math.imul(salt + 1, 0x27d4eb2d)) >>> 0);
  }
}
