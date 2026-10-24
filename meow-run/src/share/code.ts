// Challenge codes (SHARE lane), pure (node-importable). A challenge link is shareBase()?c=<code>.
//
// Code = base64url( flags u8 | [deflated: u16 compressed length] | body ), flags bit 0 = body is deflated
// (CompressionStream('deflate-raw'), when the runtime has it; the length catches junk after the stream). Body, LE:
//   u8 v (1) | u8 stage (0 meadow, 1 gorge, 2 sunset, 3 daily, 4 trail) | u32 score | u16 chain | 6 B look (base 36)
//   | u8 nameLen + UTF-8 name | daily: u32 seed + u8 theme | trail: u8 len + ASCII trail code | u16 ghostLen + ghost
//   | optional: u16 scoresLen + score track (scores.ts; older links end after the ghost)
// Decoding never throws: anything malformed, too big (> 16 KB decoded) or out of range is null. Names are untrusted:
// they pass sanitizeName and are only ever shown as text.
import type { ThemeId } from '../core/types';
import { sanitizeName } from '../meta/save';
import { resampleGhost, truncateGhost, unpackGhost, packGhost } from './ghost';
import { unpackScores } from './scores';

export const CHALLENGE_STAGES = ['meadow', 'gorge', 'sunset', 'daily', 'trail'] as const;
export type ChallengeStage = (typeof CHALLENGE_STAGES)[number];
const THEMES: readonly ThemeId[] = ['meadow', 'gorge', 'sunset'];
export const MAX_DECODED = 16 * 1024;
export const MAX_SCORE = 1e9;
export const MAX_LINK = 3000;
const LOOK_RE = /^[0-9a-z]{6}$/;
const TRAIL_RE = /^[0-9A-Za-z_.-]{1,200}$/;
const F_DEFLATE = 1;

export interface Challenge {
  v: 1;
  stage: ChallengeStage;
  /** daily: the course seed (makeRng) */
  seed?: number;
  /** daily: the landscape */
  theme?: ThemeId;
  /** trail: the trail code (TRAILS lane format) */
  trail?: string;
  score: number;
  name: string;
  /** 6-char look code (src/wardrobe/look.ts) */
  look: string;
  /** best combo chain of the run */
  chain: number;
  /** packed ghost (ghost.ts); empty = no ghost */
  ghost: Uint8Array;
  /** packed running score (scores.ts); absent or empty = none (the race pill then estimates along the course) */
  scores?: Uint8Array;
}

// ---------------------------------------------------------------- base64url
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64I[B64.charCodeAt(i)] = i;

export function toB64url(b: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    s += B64[v >>> 18] + B64[(v >>> 12) & 63] + B64[(v >>> 6) & 63] + B64[v & 63];
  }
  const r = b.length - i;
  if (r === 1) {
    const v = b[i] << 16;
    s += B64[v >>> 18] + B64[(v >>> 12) & 63];
  } else if (r === 2) {
    const v = (b[i] << 16) | (b[i + 1] << 8);
    s += B64[v >>> 18] + B64[(v >>> 12) & 63] + B64[(v >>> 6) & 63];
  }
  return s;
}
/** null on any character outside base64url or an impossible length */
export function fromB64url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64I[c] : -1;
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 255;
    }
  }
  return out.slice(0, o);
}

// ---------------------------------------------------------------- binary writer / reader
class W {
  private b = new Uint8Array(256);
  n = 0;
  private need(k: number): void {
    if (this.n + k <= this.b.length) return;
    const nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k));
    nb.set(this.b);
    this.b = nb;
  }
  u8(v: number): this {
    this.need(1);
    this.b[this.n++] = v & 255;
    return this;
  }
  u16(v: number): this {
    return this.u8(v).u8(v >>> 8);
  }
  u32(v: number): this {
    return this.u16(v & 0xffff).u16(v >>> 16);
  }
  bytes(a: Uint8Array): this {
    this.need(a.length);
    this.b.set(a, this.n);
    this.n += a.length;
    return this;
  }
  out(): Uint8Array {
    return this.b.slice(0, this.n);
  }
}
class R {
  o = 0;
  constructor(private b: Uint8Array) {}
  get left(): number {
    return this.b.length - this.o;
  }
  u8(): number {
    if (this.o >= this.b.length) throw new RangeError('short');
    return this.b[this.o++];
  }
  u16(): number {
    return this.u8() | (this.u8() << 8);
  }
  u32(): number {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  bytes(k: number): Uint8Array {
    if (k > this.left) throw new RangeError('short');
    const s = this.b.subarray(this.o, this.o + k);
    this.o += k;
    return s;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/** Challenge -> body bytes (uncompressed). Inputs are clamped/sanitised so the result always decodes. */
export function challengeBytes(c: Challenge): Uint8Array {
  const st = Math.max(0, CHALLENGE_STAGES.indexOf(c.stage));
  const w = new W();
  w.u8(1).u8(st);
  w.u32(Math.max(0, Math.min(MAX_SCORE, Math.round(+c.score || 0))));
  w.u16(Math.max(0, Math.min(65535, Math.round(+c.chain || 0))));
  w.bytes(enc.encode(LOOK_RE.test(c.look) ? c.look : '000000'));
  const name = enc.encode(sanitizeName(c.name));
  w.u8(name.length).bytes(name);
  if (CHALLENGE_STAGES[st] === 'daily') {
    w.u32((c.seed ?? 1) >>> 0 || 1);
    w.u8(Math.max(0, THEMES.indexOf(c.theme ?? 'meadow')));
  }
  if (CHALLENGE_STAGES[st] === 'trail') {
    const t = enc.encode(typeof c.trail === 'string' && TRAIL_RE.test(c.trail) ? c.trail : '');
    w.u8(t.length).bytes(t);
  }
  const g = c.ghost instanceof Uint8Array ? c.ghost : new Uint8Array(0);
  const gl = g.length <= 65535 ? g : new Uint8Array(0);
  w.u16(gl.length).bytes(gl);
  const sc = c.scores instanceof Uint8Array && c.scores.length > 1 && c.scores.length <= 65535 ? c.scores : null;
  if (sc) w.u16(sc.length).bytes(sc);
  return w.out();
}

/** body bytes -> Challenge, or null */
export function parseChallenge(b: Uint8Array): Challenge | null {
  try {
    if (b.length > MAX_DECODED) return null;
    const r = new R(b);
    if (r.u8() !== 1) return null;
    const st = r.u8();
    if (st >= CHALLENGE_STAGES.length) return null;
    const stage = CHALLENGE_STAGES[st];
    const score = r.u32();
    if (score > MAX_SCORE) return null;
    const chain = r.u16();
    const look = String.fromCharCode(...r.bytes(6));
    if (!LOOK_RE.test(look)) return null;
    const nl = r.u8();
    if (nl > 64) return null;
    const name = sanitizeName(dec.decode(r.bytes(nl)));
    const c: Challenge = { v: 1, stage, score, name, look, chain, ghost: new Uint8Array(0) };
    if (stage === 'daily') {
      const seed = r.u32();
      const th = r.u8();
      if (!seed || th >= THEMES.length) return null;
      c.seed = seed;
      c.theme = THEMES[th];
    }
    if (stage === 'trail') {
      const tl = r.u8();
      const t = String.fromCharCode(...r.bytes(tl));
      if (!TRAIL_RE.test(t)) return null;
      c.trail = t;
    }
    const gl = r.u16();
    const g = r.bytes(gl).slice();
    if (gl > 0 && !unpackGhost(g)) return null;
    c.ghost = g;
    if (r.left > 0) {
      const sl = r.u16();
      const sc = r.bytes(sl).slice();
      if (!unpackScores(sc)) return null;
      c.scores = sc;
    }
    if (r.left !== 0) return null;
    return c;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- deflate-raw (when the runtime has it)
const hasCS = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function readAll(rs: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const rd = rs.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      rd.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function through(bytes: Uint8Array, ts: { writable: WritableStream<BufferSource>; readable: ReadableStream<Uint8Array> }, max: number): Promise<Uint8Array | null> {
  try {
    const w = ts.writable.getWriter();
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    w.write(copy).catch(() => {});
    w.close().catch(() => {});
    return await readAll(ts.readable, max);
  } catch {
    return null;
  }
}
export async function deflateRaw(b: Uint8Array): Promise<Uint8Array | null> {
  if (!hasCS()) return null;
  try {
    return await through(b, new CompressionStream('deflate-raw'), 1 << 22);
  } catch {
    return null;
  }
}
export async function inflateRaw(b: Uint8Array, max = MAX_DECODED): Promise<Uint8Array | null> {
  if (!hasCS()) return null;
  try {
    return await through(b, new DecompressionStream('deflate-raw'), max);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- codes
function wrap(flags: number, body: Uint8Array): string {
  const head = flags & F_DEFLATE ? 3 : 1;
  const all = new Uint8Array(body.length + head);
  all[0] = flags;
  if (head === 3) {
    all[1] = body.length & 255;
    all[2] = body.length >>> 8;
  }
  all.set(body, head);
  return toB64url(all);
}

/** Synchronous code (never compressed): for callers that cannot wait. */
export function encodeChallengeSync(c: Challenge): string {
  return wrap(0, challengeBytes(c));
}

/** The shortest code: deflated when the runtime can and it helps, else raw. */
export async function encodeChallenge(c: Challenge): Promise<string> {
  const body = challengeBytes(c);
  const z = await deflateRaw(body);
  return z && z.length < body.length ? wrap(F_DEFLATE, z) : wrap(0, body);
}

/** code -> Challenge, or null for anything broken (never throws) */
export async function decodeChallenge(s: unknown): Promise<Challenge | null> {
  try {
    if (typeof s !== 'string' || s.length < 2 || s.length > 32768) return null;
    const all = fromB64url(s.trim());
    if (!all || all.length < 2) return null;
    const flags = all[0];
    if (flags & ~F_DEFLATE) return null;
    let body: Uint8Array | null = all.subarray(1);
    if (flags & F_DEFLATE) {
      if (all.length < 4 || (all[1] | (all[2] << 8)) !== all.length - 3) return null;
      body = await inflateRaw(all.subarray(3), MAX_DECODED);
    }
    if (!body || body.length > MAX_DECODED) return null;
    return parseChallenge(body);
  } catch {
    return null;
  }
}

/** ghost variants to try, best first: as recorded, then 4, 3, 2 and 1 Hz, then shorter and shorter, then none */
function* ghostLadder(c: Challenge): Generator<Uint8Array> {
  yield c.ghost;
  const g = unpackGhost(c.ghost);
  if (!g) return;
  let last = g;
  for (const hz of [4, 3, 2, 1]) {
    if (hz >= g.hz) continue;
    last = resampleGhost(g, hz);
    yield packGhost(last);
  }
  for (let n = Math.floor(last.n * 0.75); n >= 2; n = Math.floor(n * 0.75)) yield packGhost(truncateGhost(last, n));
  yield new Uint8Array(0);
}

/**
 * The longest-lived code that fits in maxChars (a link of at most MAX_LINK chars): the ghost is resampled 6 -> 4 -> 3
 * (-> 2 -> 1) Hz, then shortened, until it fits.
 */
export async function fitChallenge(c: Challenge, maxChars: number): Promise<{ code: string; ghost: Uint8Array }> {
  let code = '';
  let ghost = c.ghost;
  for (const gb of ghostLadder(c)) {
    ghost = gb;
    code = await encodeChallenge({ ...c, ghost: gb });
    if (code.length <= maxChars) return { code, ghost };
  }
  // last resort: no score track either
  code = await encodeChallenge({ ...c, ghost, scores: undefined });
  return { code, ghost };
}
/** fitChallenge without compression (sync) */
export function fitChallengeSync(c: Challenge, maxChars: number): { code: string; ghost: Uint8Array } {
  let code = '';
  let ghost = c.ghost;
  for (const gb of ghostLadder(c)) {
    ghost = gb;
    code = encodeChallengeSync({ ...c, ghost: gb });
    if (code.length <= maxChars) return { code, ghost };
  }
  code = encodeChallengeSync({ ...c, ghost, scores: undefined });
  return { code, ghost };
}
