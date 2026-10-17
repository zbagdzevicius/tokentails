/** FNV-1a 32-bit over the world's typed arrays (pattern: catnip-heist/src/sim/hash.ts). */

export const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Feed one 32-bit integer as 4 little-endian bytes. */
export function fnvInt(h: number, v: number): number {
  let x = v | 0;
  for (let i = 0; i < 4; i++) {
    h ^= x & 0xff;
    h = Math.imul(h, FNV_PRIME);
    x >>>= 8;
  }
  return h >>> 0;
}

/** `fnvInt` over every element, unrolled (same result; the world hash runs it over ~10k values every 30 ticks). */
export function fnvInts(h: number, vs: ArrayLike<number>): number {
  let a = h;
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const x = vs[i] | 0;
    a = Math.imul(a ^ (x & 0xff), FNV_PRIME);
    a = Math.imul(a ^ ((x >>> 8) & 0xff), FNV_PRIME);
    a = Math.imul(a ^ ((x >>> 16) & 0xff), FNV_PRIME);
    a = Math.imul(a ^ (x >>> 24), FNV_PRIME);
  }
  return a >>> 0;
}

/** Feed the UTF-16 code units of a string (labels, ids). */
export function fnvString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= s.charCodeAt(i) >>> 8;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Feed raw bytes (the encoded command stream). */
export function fnvBytes(h: number, bytes: ArrayLike<number>): number {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** 8-digit lowercase hex of a uint32. */
export function hashHex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}
