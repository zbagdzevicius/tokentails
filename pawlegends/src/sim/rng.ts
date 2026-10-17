/**
 * Seeded integer RNG: mulberry32 (pattern: catnip-heist/src/sim/rng.ts). The state is a uint32 the world hashes.
 * `fork(label)` derives an independent stream from the root seed and a label, so adding a draw in one system never
 * shifts another system's draws (picks, bot aim, coin toss).
 */
import { fnvString, FNV_OFFSET } from './hash';

export function mulberry32(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

/** Output of the state reached by `mulberry32(state)`. */
export function mulberryOut(state: number): number {
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

export class Rng {
  /** Current uint32 state (hashed by the world). */
  state: number;

  constructor(
    readonly seed: number,
    state?: number,
  ) {
    this.state = (state ?? seed) >>> 0;
  }

  /** Next uint32. */
  next(): number {
    this.state = mulberry32(this.state);
    return mulberryOut(this.state);
  }

  /** Integer in [0, n), n >= 1. */
  int(n: number): number {
    return this.next() % n;
  }

  /** Integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability bp / 10000. */
  chanceBp(bp: number): boolean {
    return this.int(10000) < bp;
  }

  /** Independent stream for `label`, derived from the root seed only (not the current state). */
  fork(label: string): Rng {
    return new Rng(forkSeed(this.seed, label));
  }
}

export function forkSeed(seed: number, label: string): number {
  return (fnvString(FNV_OFFSET ^ (seed >>> 0), label) ^ 0x9e3779b9) >>> 0;
}
