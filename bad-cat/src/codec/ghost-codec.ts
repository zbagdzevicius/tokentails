/**
 * Ghost / replay input codec (GDD 6.6, `g`, `g2`, `rp`).
 *
 * Wire format: byte 0 = version:4 | flags:4 (bit 0 = body is deflate-raw), body, CRC-16 over everything
 * before it, base64url.
 * Body (bit-packed, MSB first): roomKey:32 (FNV-1a of the room id, see ids.ts), simVersion:8, ticks:12,
 * then RLE runs until `ticks` inputs are covered: dir:4, speed:2, buttons:4, count as 3-bit groups with a
 * continuation bit (count 1..8 = 4 bits, 9..72 = 8 bits, ...). The GDD sketch used count:8; the variable
 * count is smaller for the many 1-tick button runs and never needs a run split.
 *
 * The sync pair writes the uncompressed form (used by buildLink, which is sync); the async pair deflates
 * with CompressionStream('deflate-raw') when available and smaller, and decodes both forms.
 */
import { SIM_VERSION, type Dir8, type Speed, type TickInput } from '../types';
import { BitReader, BitWriter } from './bits';
import { fromBase64url, toBase64url } from './base64url';
import { checkCrc16, withCrc16 } from './crc16';
import { roomKey } from './ids';

export const GHOST_VERSION = 1;
const FLAG_DEFLATE = 1;
/** ticks:12 */
export const GHOST_MAX_TICKS = 4095;

export interface DecodedGhost {
  inputs: TickInput[];
  roomHash: number;
  simVersion: number;
}

type Run = [dir: number, speed: number, buttons: number, count: number];

function runsOf(inputs: readonly TickInput[]): Run[] {
  const runs: Run[] = [];
  for (const i of inputs) {
    const last = runs[runs.length - 1];
    const d = i.dir | 0;
    const s = i.speed | 0;
    const b = i.buttons & 15;
    if (last && last[0] === d && last[1] === s && last[2] === b) last[3]++;
    else runs.push([d, s, b, 1]);
  }
  return runs;
}

function packBody(inputs: readonly TickInput[], key: number, simVersion: number): Uint8Array {
  const ins = inputs.length > GHOST_MAX_TICKS ? inputs.slice(0, GHOST_MAX_TICKS) : inputs;
  const w = new BitWriter();
  w.write(key >>> 0, 32);
  w.write(simVersion & 0xff, 8);
  w.write(ins.length, 12);
  for (const [d, s, b, count] of runsOf(ins)) {
    w.write(d, 4);
    w.write(s, 2);
    w.write(b, 4);
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

function unpackBody(body: Uint8Array): DecodedGhost | null {
  try {
    const r = new BitReader(body);
    const roomHash = r.read(32);
    const simVersion = r.read(8);
    const ticks = r.read(12);
    const inputs: TickInput[] = [];
    while (inputs.length < ticks) {
      const dir = r.read(4);
      const speed = r.read(2);
      const buttons = r.read(4);
      if (dir > 8 || speed > 2) return null;
      let count = 0;
      let shift = 0;
      for (;;) {
        const more = r.read(1);
        count += r.read(3) * 2 ** shift;
        shift += 3;
        if (!more) break;
        if (shift > 12) return null;
      }
      count += 1;
      if (inputs.length + count > ticks) return null;
      const input: TickInput = { dir: dir as Dir8, speed: speed as Speed, buttons };
      for (let k = 0; k < count; k++) inputs.push(input);
    }
    if (r.remaining >= 8) return null; // trailing garbage
    return { inputs, roomHash, simVersion };
  } catch {
    return null;
  }
}

function frame(flags: number, body: Uint8Array): string {
  const out = new Uint8Array(body.length + 1);
  out[0] = (GHOST_VERSION << 4) | (flags & 15);
  out.set(body, 1);
  return toBase64url(withCrc16(out));
}

function unframe(payload: string): { flags: number; body: Uint8Array } | null {
  if (typeof payload !== 'string' || payload.length < 4 || payload.length > 4000) return null;
  const raw = fromBase64url(payload);
  if (!raw) return null;
  const bytes = checkCrc16(raw);
  if (!bytes || bytes.length < 2) return null;
  if (bytes[0] >> 4 !== GHOST_VERSION) return null;
  return { flags: bytes[0] & 15, body: bytes.subarray(1) };
}

/** Uncompressed ghost (sync). `key` is a room id ('daily-018', 'glass') or an already-hashed room key. */
export function encodeGhostSync(inputs: readonly TickInput[], key: string | number, simVersion = SIM_VERSION): string {
  return frame(0, packBody(inputs, typeof key === 'number' ? key : roomKey(key), simVersion));
}

/** Sync decode; null for a compressed ghost (use decodeGhost) or any malformed payload. */
export function decodeGhostSync(payload: string): DecodedGhost | null {
  const f = unframe(payload);
  if (!f || f.flags & FLAG_DEFLATE) return null;
  return unpackBody(f.body);
}

/** True if the payload is a deflated ghost (needs the async decoder). */
export function isDeflatedGhost(payload: string): boolean {
  const f = unframe(payload);
  return !!f && (f.flags & FLAG_DEFLATE) !== 0;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

/** Deflated when CompressionStream exists and it saves bytes, else uncompressed. Never throws. */
export async function encodeGhost(inputs: readonly TickInput[], roomId: string, simVersion = SIM_VERSION): Promise<string> {
  const body = packBody(inputs, roomKey(roomId), simVersion);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const z = await pipe(body, new CompressionStream('deflate-raw'));
      if (z.length < body.length) return frame(FLAG_DEFLATE, z);
    } catch {
      /* fall through to uncompressed */
    }
  }
  return frame(0, body);
}

/**
 * Largest body a real ghost can have: the 52-bit header plus GHOST_MAX_TICKS one-tick runs of 14 bits, rounded up.
 * A deflated payload that inflates past this is refused (a 4,000-character bomb could reach ~3 MB).
 */
export const GHOST_MAX_BODY_BYTES = Math.ceil((52 + GHOST_MAX_TICKS * 14) / 8) + 16;

/** Inflate piece by piece and give up past `limit` bytes (as save codes do). */
async function inflateCapped(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
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
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

export async function decodeGhost(payload: string): Promise<DecodedGhost | null> {
  const f = unframe(payload);
  if (!f) return null;
  if (!(f.flags & FLAG_DEFLATE)) return unpackBody(f.body);
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const body = await inflateCapped(f.body, GHOST_MAX_BODY_BYTES);
    return body ? unpackBody(body) : null;
  } catch {
    return null;
  }
}
