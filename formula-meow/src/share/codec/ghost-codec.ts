/**
 * Ghost codec (GDD 8.1, share lane). Adapted from bad-cat/src/codec/ghost-codec.ts at 4889ed41 for the kart sim:
 * the race setup sits in a plain header (so the route can be read synchronously at boot), the input stream after it
 * may be deflate-raw, and a CRC-16 covers everything. base64url.
 *
 *   byte 0      version:4 | flags:4 (bit 0 = runs are deflate-raw)
 *   header      trackKey:32  seed:32  cls:2 modifiers:6  forgiving:1 slot:3 reserved:4  simVersion:8  ticks:16
 *   (v2 only)   body:3 mode:3 reserved:2      (iteration 2: the player's kart body and the race mode)
 *   runs        packed TickInput:10 (types.ts packInput), count as 3-bit groups with a continuation bit
 *   crc16
 *
 * The runs are lossless (no extra latching here): the input mux already latches at 30 Hz, so pairs of equal ticks
 * merge into runs on their own. A ghost carries no time: opening one re-simulates it and shows the recomputed time.
 * Pure, no DOM.
 */
import { RACE_MODES, SIM_VERSION, type BodyId, type RaceClass, type RaceMode } from '../../types';
import { BitReader, BitWriter } from './bits';
import { fromBase64url, toBase64url } from './base64url';
import { checkCrc16, withCrc16 } from './crc16';

/** v2 (SIM_VERSION 4) adds the body and mode byte; v1 links still decode (they open as a target-time race). */
export const GHOST_VERSION = 2;
const FLAG_DEFLATE = 1;
const HEADER_BYTES_V1 = 13; // 104 header bits
const HEADER_BYTES = 14; // + body:3 mode:3 reserved:2
/** ticks:16 (18 minutes at 60 Hz; races stop long before) */
export const GHOST_MAX_TICKS = 65535;
/** longest payload accepted from a link */
export const GHOST_MAX_CHARS = 12000;

export interface GhostHeader {
  trackKey: number;
  seed: number;
  cls: RaceClass;
  modifiers: number;
  forgiving: boolean;
  /** grid slot of the recorded kart (0..7) */
  slot: number;
  simVersion: number;
  ticks: number;
  /** the recorded kart's body (0 for v1 links) */
  body?: BodyId;
  /** race mode (v1 links: 'race') */
  mode?: RaceMode;
}

export interface Ghost extends GhostHeader {
  /** packed inputs per tick (types.ts packInput) */
  inputs: number[];
}

/** FNV-1a 32 of a track id (authored ids, or a UGC track code). */
export function trackKey(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function packHeader(g: GhostHeader): Uint8Array {
  const w = new BitWriter();
  w.write(g.trackKey >>> 0, 32);
  w.write(g.seed >>> 0, 32);
  w.write(g.cls & 3, 2);
  w.write(g.modifiers & 63, 6);
  w.write(g.forgiving ? 1 : 0, 1);
  w.write(g.slot & 7, 3);
  w.write(0, 4);
  w.write(g.simVersion & 0xff, 8);
  w.write(Math.min(GHOST_MAX_TICKS, g.ticks), 16);
  w.write((g.body ?? 0) & 7, 3);
  w.write(Math.max(0, RACE_MODES.indexOf(g.mode ?? 'race')) & 7, 3);
  w.write(0, 2);
  return w.bytes();
}

function readHeader(b: Uint8Array, version: number): GhostHeader | null {
  const size = version === 1 ? HEADER_BYTES_V1 : HEADER_BYTES;
  if (b.length < size) return null;
  const r = new BitReader(b.subarray(0, size));
  const trackKeyV = r.read(32);
  const seedU = r.read(32);
  const cls = r.read(2);
  const modifiers = r.read(6);
  const forgiving = r.read(1) === 1;
  const slot = r.read(3);
  r.read(4);
  const simVersion = r.read(8);
  const ticks = r.read(16);
  if (cls > 2) return null;
  let body: BodyId = 0;
  let mode: RaceMode = 'race';
  if (version >= 2) {
    const bv = r.read(3);
    const mv = r.read(3);
    if (bv > 5 || mv >= RACE_MODES.length) return null;
    body = bv as BodyId;
    mode = RACE_MODES[mv];
  }
  return { trackKey: trackKeyV, seed: seedU | 0, cls: cls as RaceClass, modifiers, forgiving, slot, simVersion, ticks, body, mode };
}

type Run = [value: number, count: number];

function runsOf(inputs: readonly number[]): Run[] {
  const runs: Run[] = [];
  for (const v of inputs) {
    const last = runs[runs.length - 1];
    const x = v & 0x3ff;
    if (last && last[0] === x) last[1]++;
    else runs.push([x, 1]);
  }
  return runs;
}

function packRuns(inputs: readonly number[]): Uint8Array {
  const w = new BitWriter();
  for (const [v, count] of runsOf(inputs)) {
    w.write(v, 10);
    let c = count - 1;
    for (;;) {
      const chunk = c & 7;
      c >>>= 3;
      w.write(c > 0 ? 1 : 0, 1);
      w.write(chunk, 3);
      if (c === 0) break;
    }
  }
  return w.bytes();
}

function unpackRuns(body: Uint8Array, ticks: number): number[] | null {
  try {
    const r = new BitReader(body);
    const out: number[] = [];
    while (out.length < ticks) {
      const v = r.read(10);
      if ((v & 15) > 14) return null; // steer nibble is 0..14
      let count = 0;
      let shift = 0;
      for (;;) {
        const more = r.read(1);
        count += r.read(3) * 2 ** shift;
        shift += 3;
        if (!more) break;
        if (shift > 18) return null;
      }
      count += 1;
      if (out.length + count > ticks) return null;
      for (let k = 0; k < count; k++) out.push(v);
    }
    if (r.remaining >= 8) return null; // trailing garbage
    return out;
  } catch {
    return null;
  }
}

function frame(flags: number, header: Uint8Array, body: Uint8Array): string {
  const out = new Uint8Array(1 + header.length + body.length);
  out[0] = (GHOST_VERSION << 4) | (flags & 15);
  out.set(header, 1);
  out.set(body, 1 + header.length);
  return toBase64url(withCrc16(out));
}

function unframe(payload: string): { flags: number; header: GhostHeader; body: Uint8Array } | null {
  if (typeof payload !== 'string' || payload.length < 8 || payload.length > GHOST_MAX_CHARS) return null;
  const raw = fromBase64url(payload);
  if (!raw) return null;
  const bytes = checkCrc16(raw);
  if (!bytes || bytes.length < 1) return null;
  const version = bytes[0] >> 4;
  if (version !== 1 && version !== GHOST_VERSION) return null;
  const size = version === 1 ? HEADER_BYTES_V1 : HEADER_BYTES;
  if (bytes.length < 1 + size) return null;
  const header = readHeader(bytes.subarray(1, 1 + size), version);
  if (!header) return null;
  return { flags: bytes[0] & 15, header, body: bytes.subarray(1 + size) };
}

function headerOf(g: Omit<GhostHeader, 'ticks' | 'simVersion'> & { simVersion?: number }, inputs: readonly number[]): GhostHeader {
  return { ...g, simVersion: g.simVersion ?? SIM_VERSION, ticks: Math.min(GHOST_MAX_TICKS, inputs.length) };
}

/** Uncompressed ghost (sync). */
export function encodeGhostSync(g: Omit<GhostHeader, 'ticks' | 'simVersion'> & { simVersion?: number }, inputs: readonly number[]): string {
  const ins = inputs.slice(0, GHOST_MAX_TICKS);
  return frame(0, packHeader(headerOf(g, ins)), packRuns(ins));
}

/** The race setup of a ghost, read synchronously (works for deflated ghosts too). Null when malformed. */
export function peekGhost(payload: string): GhostHeader | null {
  return unframe(payload)?.header ?? null;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

/** Deflated when CompressionStream exists and it saves bytes, else uncompressed. Never throws. */
export async function encodeGhost(g: Omit<GhostHeader, 'ticks' | 'simVersion'> & { simVersion?: number }, inputs: readonly number[]): Promise<string> {
  const ins = inputs.slice(0, GHOST_MAX_TICKS);
  const header = packHeader(headerOf(g, ins));
  const body = packRuns(ins);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const z = await pipe(body, new CompressionStream('deflate-raw'));
      if (z.length < body.length) return frame(FLAG_DEFLATE, header, z);
    } catch {
      /* fall through to uncompressed */
    }
  }
  return frame(0, header, body);
}

/** Largest run body a real ghost can have (every tick its own run, 14 bits), plus slack. */
const MAX_BODY_BYTES = Math.ceil((GHOST_MAX_TICKS * 14) / 8) + 16;

async function inflateCapped(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/** Full decode (inflates when needed). Null for anything malformed; never throws. */
export async function decodeGhost(payload: string): Promise<Ghost | null> {
  const f = unframe(payload);
  if (!f) return null;
  let body = f.body;
  if (f.flags & FLAG_DEFLATE) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const b = await inflateCapped(f.body, MAX_BODY_BYTES);
      if (!b) return null;
      body = b;
    } catch {
      return null;
    }
  }
  const inputs = unpackRuns(body, f.header.ticks);
  return inputs ? { ...f.header, inputs } : null;
}
