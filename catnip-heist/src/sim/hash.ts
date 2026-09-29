/** FNV-1a 32-bit over a stream of 32-bit integers (each fed as 4 little-endian bytes). */

export const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnvInt(h: number, v: number): number {
  let x = v | 0;
  for (let i = 0; i < 4; i++) {
    h ^= x & 0xff;
    h = Math.imul(h, FNV_PRIME);
    x >>>= 8;
  }
  return h >>> 0;
}

export function fnvInts(h: number, vs: readonly number[]): number {
  for (let i = 0; i < vs.length; i++) h = fnvInt(h, vs[i]);
  return h;
}
