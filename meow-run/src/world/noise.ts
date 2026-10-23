// Small deterministic noise helpers for the world (WORLD-ART). Pure: node-importable, no allocations.

/** hash of one number to [0, 1) */
export function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** hash of two numbers to [0, 1) */
export function hash2(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
  return x - Math.floor(x);
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** smooth 1D value noise in [0, 1] */
export function vnoise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, seed);
  const b = hash2(i + 1, seed);
  return a + (b - a) * fade(f);
}

/** 1D fbm in [0, 1] (3 octaves) */
export function fbm1(x: number, seed = 0): number {
  return (vnoise1(x, seed) * 0.57 + vnoise1(x * 2.03 + 17.1, seed + 3) * 0.29 + vnoise1(x * 4.11 + 41.3, seed + 7) * 0.14);
}

/** smooth 2D value noise in [0, 1] */
export function vnoise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const s = seed * 57.3;
  const a = hash2(ix + s, iy);
  const b = hash2(ix + 1 + s, iy);
  const c = hash2(ix + s, iy + 1);
  const d = hash2(ix + 1 + s, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** mulberry32 seeded rng (chunk scatter, deterministic per chunk) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
