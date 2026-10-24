// Trail codes (TRAILS lane). Pure (node-importable). A trail is a short string that fits in a ?t= link:
//   '1' version, theme char (m g s), pace digit (0 1 2), seed (3 base-36 chars), the blocks (2 chars each: the block
//   id, then the flags digit 0..3 = mirror + 2*hard), '-', then base64url(utf8 name), and optionally '.' then
//   base64url(utf8 author) (the maker's name: credit travels with the trail; older codes have none).
// e.g. 1m20zk0041a0c2-TW9jaGk  (meadow, turbo, seed 1280, Fish line, Logs mirrored, Jump gap, Tail vault hard)
// decodeTrail never throws and returns null on anything malformed; validation (validate.ts) checks the rest.
import type { ThemeId } from '../core/types';
import { sanitizeName } from '../meta/save';
import { blockById } from '../stages/blocks';

export type Pace = 0 | 1 | 2;
export interface TrailBlock {
  id: string;
  mirror: boolean;
  hard: boolean;
}
export interface Trail {
  v: 1;
  name: string;
  /** who made it ('' = unknown); kept when someone else shares or copies it */
  author?: string;
  theme: ThemeId;
  pace: Pace;
  /** 0 .. SEED_MAX - 1 (three base-36 characters) */
  seed: number;
  blocks: TrailBlock[];
}

export const TRAIL_VERSION = 1;
export const MIN_BLOCKS = 2;
export const MAX_BLOCKS = 24;
export const CODE_MAX = 120;
/** 36^3: the seed is stored as three base-36 characters */
export const SEED_MAX = 46656;
export const DEFAULT_TRAIL_NAME = 'My trail';

const THEME_CHAR: Record<ThemeId, string> = { meadow: 'm', gorge: 'g', sunset: 's' };
const CHAR_THEME: Record<string, ThemeId> = { m: 'meadow', g: 'gorge', s: 'sunset' };
export const THEMES: readonly ThemeId[] = ['meadow', 'gorge', 'sunset'];

/** pace 0 chill 18->24, 1 zoomy 20->28, 2 turbo 22->31 u/s */
export const PACES: readonly { key: string; name: string; start: number; max: number }[] = [
  { key: 'chill', name: 'Chill', start: 18, max: 24 },
  { key: 'zoomy', name: 'Zoomy', start: 20, max: 28 },
  { key: 'turbo', name: 'Turbo', start: 22, max: 31 },
];

// ---------------------------------------------------------------- base64url of utf-8 (no atob/btoa: works anywhere)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (left > 1) out += B64[(n >> 6) & 63];
    if (left > 2) out += B64[n & 63];
  }
  return out;
}
function b64urlDecode(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** a clean copy: sanitised name, clamped seed, known theme and pace (blocks are copied, not checked) */
export function normalizeTrail(t: Trail): Trail {
  return {
    v: 1,
    name: sanitizeName(t.name) || DEFAULT_TRAIL_NAME,
    ...(sanitizeName(t.author ?? '') ? { author: sanitizeName(t.author ?? '') } : {}),
    theme: THEMES.includes(t.theme) ? t.theme : 'meadow',
    pace: (t.pace === 0 || t.pace === 1 || t.pace === 2 ? t.pace : 1) as Pace,
    seed: Math.max(0, Math.min(SEED_MAX - 1, Math.floor(Number.isFinite(t.seed) ? t.seed : 0))),
    blocks: t.blocks.slice(0, MAX_BLOCKS).map((b) => ({ id: b.id, mirror: !!b.mirror, hard: !!b.hard })),
  };
}

/** The ?t= code (at most CODE_MAX characters: a long non-Latin name is shortened to fit). */
export function encodeTrail(trail: Trail): string {
  const t = normalizeTrail(trail);
  let head = `${TRAIL_VERSION}${THEME_CHAR[t.theme]}${t.pace}${t.seed.toString(36).padStart(3, '0')}`;
  for (const b of t.blocks) head += `${b.id}${(b.mirror ? 1 : 0) + (b.hard ? 2 : 0)}`;
  let name = t.name;
  let author = t.author ?? '';
  const make = () => `${head}-${b64urlEncode(utf8(name))}${author ? `.${b64urlEncode(utf8(author))}` : ''}`;
  let code = make();
  // too long: the author gives way first, then the name
  while (code.length > CODE_MAX && author.length > 0) {
    author = [...author].slice(0, -1).join('').trim();
    code = make();
  }
  while (code.length > CODE_MAX && name.length > 0) {
    name = [...name].slice(0, -1).join('').trim();
    code = make();
  }
  return code;
}

/** Parse a code. null = garbage (wrong version, unknown theme or block, bad name bytes, too long). Never throws. */
export function decodeTrail(code: unknown): Trail | null {
  try {
    if (typeof code !== 'string' || code.length < 7 || code.length > CODE_MAX) return null;
    const dash = code.indexOf('-');
    if (dash < 0) return null;
    const head = code.slice(0, dash);
    const tail = code.slice(dash + 1);
    if (head[0] !== String(TRAIL_VERSION)) return null;
    const theme = CHAR_THEME[head[1]];
    if (!theme) return null;
    const pace = Number(head[2]);
    if (!(pace === 0 || pace === 1 || pace === 2)) return null;
    const seedStr = head.slice(3, 6);
    if (!/^[0-9a-z]{3}$/.test(seedStr)) return null;
    const seed = parseInt(seedStr, 36);
    const body = head.slice(6);
    if (body.length % 2 !== 0 || body.length / 2 > MAX_BLOCKS) return null;
    const blocks: TrailBlock[] = [];
    for (let i = 0; i < body.length; i += 2) {
      const id = body[i];
      const f = body[i + 1];
      if (!blockById(id) || !/^[0-3]$/.test(f)) return null;
      const n = Number(f);
      blocks.push({ id, mirror: (n & 1) === 1, hard: (n & 2) === 2 });
    }
    const dot = tail.indexOf('.');
    const bytes = b64urlDecode(dot < 0 ? tail : tail.slice(0, dot));
    if (!bytes) return null;
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const name = sanitizeName(raw) || DEFAULT_TRAIL_NAME;
    let author = '';
    if (dot >= 0) {
      const ab = b64urlDecode(tail.slice(dot + 1));
      if (!ab) return null;
      author = sanitizeName(new TextDecoder('utf-8', { fatal: true }).decode(ab));
    }
    return { v: 1, name, ...(author ? { author } : {}), theme, pace: pace as Pace, seed, blocks };
  } catch {
    return null;
  }
}
