/**
 * CatSpec link codec (GDD 6.6): v:4, pattern:3, ears:1, tail:2, body:2, eyes:3, base:16, secondary:16,
 * tertiary:16, collar:8, hat:8, reserved:9 = 88 bits (11 bytes), then CRC-16 (2 bytes), base64url.
 * 13 bytes -> 18 characters. (The GDD's "15 chars" is the 11-byte payload alone; the CRC adds 3.)
 * The name travels separately (`n=`) and is filtered on decode.
 */
import { DEFAULT_CAT, PATTERNS, type CatSpec } from '../types';
import { BitReader, BitWriter } from './bits';
import { fromBase64url, toBase64url } from './base64url';
import { checkCrc16, withCrc16 } from './crc16';
import { filterName } from './text-filter';

export const CAT_CODE_VERSION = 1;
export const CAT_CODE_LENGTH = 18;
const EARS: readonly CatSpec['ears'][] = ['normal', 'fold'];
const TAILS: readonly CatSpec['tail'][] = ['normal', 'fluffy', 'bob'];
const BODIES: readonly CatSpec['body'][] = ['slim', 'normal', 'chonk'];

function idx<T>(list: readonly T[], v: T, fallback: number): number {
  const i = list.indexOf(v);
  return i < 0 ? fallback : i;
}

export function encodeCat(c: CatSpec): string {
  const w = new BitWriter();
  w.write(CAT_CODE_VERSION, 4);
  w.write(idx(PATTERNS, c.pattern, 0), 3);
  w.write(idx(EARS, c.ears, 0), 1);
  w.write(idx(TAILS, c.tail, 0), 2);
  w.write(idx(BODIES, c.body, 1), 2);
  w.write(c.eyes >= 0 && c.eyes <= 5 ? c.eyes | 0 : 0, 3);
  w.write(c.base & 0xffff, 16);
  w.write(c.secondary & 0xffff, 16);
  w.write(c.tertiary & 0xffff, 16);
  w.write(c.collar & 0xff, 8);
  w.write(c.hat & 0xff, 8);
  w.write(0, 9);
  return toBase64url(withCrc16(w.bytes()));
}

/** null on a wrong length, bad character, CRC mismatch, unknown version or out-of-range field. */
export function decodeCat(code: string, name?: string): CatSpec | null {
  if (typeof code !== 'string' || code.length !== CAT_CODE_LENGTH) return null;
  const raw = fromBase64url(code);
  if (!raw) return null;
  const body = checkCrc16(raw);
  if (!body || body.length !== 11) return null;
  const r = new BitReader(body);
  if (r.read(4) !== CAT_CODE_VERSION) return null;
  const pattern = r.read(3);
  const ears = r.read(1);
  const tail = r.read(2);
  const bodyType = r.read(2);
  const eyes = r.read(3);
  if (pattern >= PATTERNS.length || tail >= TAILS.length || bodyType >= BODIES.length || eyes > 5) return null;
  const base = r.read(16);
  const secondary = r.read(16);
  const tertiary = r.read(16);
  const collar = r.read(8);
  const hat = r.read(8);
  return {
    pattern: PATTERNS[pattern],
    ears: EARS[ears],
    tail: TAILS[tail],
    body: BODIES[bodyType],
    eyes,
    base,
    secondary,
    tertiary,
    collar,
    hat,
    name: name === undefined ? '' : filterName(name),
  };
}

/** decodeCat with the house cat as fallback (links never crash the game). */
export function decodeCatOrDefault(code: string | null | undefined, name?: string): CatSpec {
  const c = code ? decodeCat(code, name) : null;
  if (c) return c;
  return { ...DEFAULT_CAT, name: name === undefined ? DEFAULT_CAT.name : filterName(name) || DEFAULT_CAT.name };
}
