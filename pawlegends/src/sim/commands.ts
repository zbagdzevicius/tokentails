/**
 * Binary command stream (POC.md §11.3): per record a varint tick delta, a 1-byte opcode, then the payload.
 * Coordinates are quantised to 250 mm (uint16, little-endian). Sizes without the tick delta:
 * move 5 B, attackMove 5 B, attack 2 B, cast 7 B, trick 5 B, stop 1 B, nap 1 B, talent 2 B, ping 7 B (sim v10: kind,
 * x, y, id), forfeit 1 B (sim v10).
 *
 * The sim only ever sees quantised commands (`quantize`), so a live match and its replay apply identical inputs.
 */
import { MAP } from '../data/map';
import { PING_KINDS } from '../data/pings';
import { Op, type CastSlot, type Command, type TalentTier, type TimedCommand } from './api';
import { clamp, idiv } from './fixed';

/** mm per coordinate unit in the stream. */
export const COORD_QUANTUM = 250;
const MAX_QX = idiv(MAP.width, COORD_QUANTUM);
const MAX_QY = idiv(MAP.height, COORD_QUANTUM);

const qx = (x: number): number => clamp(idiv(x + idiv(COORD_QUANTUM, 2), COORD_QUANTUM), 0, MAX_QX);
const qy = (y: number): number => clamp(idiv(y + idiv(COORD_QUANTUM, 2), COORD_QUANTUM), 0, MAX_QY);

/** Payload size in bytes, opcode included. */
export const OP_SIZE: Readonly<Record<number, number>> = Object.freeze({
  [Op.Move]: 5,
  [Op.AttackMove]: 5,
  [Op.Attack]: 2,
  [Op.Cast]: 7,
  [Op.Trick]: 5,
  [Op.Stop]: 1,
  [Op.Nap]: 1,
  [Op.Talent]: 2,
  [Op.Ping]: 7,
  [Op.Forfeit]: 1,
});

/** The command exactly as a decode of its encoding gives it back (coordinates snapped, ids masked). */
export function quantize(cmd: Command): Command {
  switch (cmd.op) {
    case Op.Move:
    case Op.AttackMove:
    case Op.Trick:
      return { op: cmd.op, x: qx(cmd.x) * COORD_QUANTUM, y: qy(cmd.y) * COORD_QUANTUM };
    case Op.Attack:
      return { op: cmd.op, id: cmd.id & 0xff };
    case Op.Cast:
      return { op: cmd.op, slot: (cmd.slot & 3) as CastSlot, x: qx(cmd.x) * COORD_QUANTUM, y: qy(cmd.y) * COORD_QUANTUM, id: cmd.id & 0xff };
    case Op.Talent:
      return { op: cmd.op, tier: clamp(cmd.tier, 0, 2) as TalentTier, choice: (cmd.choice & 1) as 0 | 1 };
    case Op.Ping:
      return { op: cmd.op, kind: clamp(cmd.kind, 0, PING_KINDS.length - 1), x: qx(cmd.x) * COORD_QUANTUM, y: qy(cmd.y) * COORD_QUANTUM, id: cmd.id & 0xff };
    default:
      return { op: cmd.op };
  }
}

class ByteWriter {
  private buf = new Uint8Array(256);
  length = 0;
  private ensure(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  u8(v: number): void {
    this.ensure(1);
    this.buf[this.length++] = v & 0xff;
  }
  u16(v: number): void {
    this.ensure(2);
    this.buf[this.length++] = v & 0xff;
    this.buf[this.length++] = (v >>> 8) & 0xff;
  }
  varint(v: number): void {
    let x = v;
    while (x >= 0x80) {
      this.u8((x & 0x7f) | 0x80);
      x = idiv(x, 0x80);
    }
    this.u8(x);
  }
  bytes(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Encode one command (no tick delta): what the protocol `cmd` message carries. */
export function encodeCommand(cmd: Command): Uint8Array {
  const w = new ByteWriter();
  writeCommand(w, cmd);
  return w.bytes();
}

function writeCommand(w: ByteWriter, cmd: Command): void {
  w.u8(cmd.op);
  switch (cmd.op) {
    case Op.Move:
    case Op.AttackMove:
    case Op.Trick:
      w.u16(qx(cmd.x));
      w.u16(qy(cmd.y));
      break;
    case Op.Attack:
      w.u8(cmd.id);
      break;
    case Op.Cast:
      w.u8(cmd.slot & 3);
      w.u16(qx(cmd.x));
      w.u16(qy(cmd.y));
      w.u8(cmd.id);
      break;
    case Op.Talent:
      w.u8((clamp(cmd.tier, 0, 2) << 4) | (cmd.choice & 1));
      break;
    case Op.Ping:
      w.u8(clamp(cmd.kind, 0, PING_KINDS.length - 1));
      w.u16(qx(cmd.x));
      w.u16(qy(cmd.y));
      w.u8(cmd.id);
      break;
    default:
      break;
  }
}

export class DecodeError extends Error {}

/** Decode one command starting at `at`; returns the command and the next offset. Throws DecodeError. */
export function readCommand(bytes: Uint8Array, at: number): { cmd: Command; next: number } {
  const op = bytes[at];
  const size = OP_SIZE[op];
  if (size === undefined) throw new DecodeError(`unknown opcode ${op} at ${at}`);
  if (at + size > bytes.length) throw new DecodeError(`truncated command at ${at}`);
  const u16 = (o: number): number => bytes[at + o] | (bytes[at + o + 1] << 8);
  const coord = (o: number): { x: number; y: number } => {
    const x = u16(o);
    const y = u16(o + 2);
    if (x > MAX_QX || y > MAX_QY) throw new DecodeError(`coordinate out of map at ${at}`);
    return { x: x * COORD_QUANTUM, y: y * COORD_QUANTUM };
  };
  let cmd: Command;
  switch (op) {
    case Op.Move:
    case Op.AttackMove:
    case Op.Trick: {
      const c = coord(1);
      cmd = { op, x: c.x, y: c.y };
      break;
    }
    case Op.Attack:
      cmd = { op, id: bytes[at + 1] };
      break;
    case Op.Cast: {
      const slot = bytes[at + 1];
      if (slot > 3) throw new DecodeError(`bad cast slot at ${at}`);
      const c = coord(2);
      cmd = { op, slot: slot as CastSlot, x: c.x, y: c.y, id: bytes[at + 6] };
      break;
    }
    case Op.Talent: {
      const b = bytes[at + 1];
      const tier = b >>> 4;
      const choice = b & 0x0f;
      if (tier > 2 || choice > 1) throw new DecodeError(`bad talent at ${at}`);
      cmd = { op, tier: tier as TalentTier, choice: choice as 0 | 1 };
      break;
    }
    case Op.Ping: {
      const kind = bytes[at + 1];
      if (kind >= PING_KINDS.length) throw new DecodeError(`bad ping kind at ${at}`);
      const c = coord(2);
      cmd = { op, kind, x: c.x, y: c.y, id: bytes[at + 6] };
      break;
    }
    default:
      cmd = { op: op as typeof Op.Stop | typeof Op.Nap | typeof Op.Forfeit };
  }
  return { cmd, next: at + size };
}

/** Decode a single protocol `cmd` payload. */
export function decodeCommand(bytes: Uint8Array): Command {
  const r = readCommand(bytes, 0);
  if (r.next !== bytes.length) throw new DecodeError('trailing bytes after command');
  return r.cmd;
}

/** Encode a command stream. Ticks must be non-decreasing. */
export function encodeStream(list: readonly TimedCommand[]): Uint8Array {
  const w = new ByteWriter();
  let last = 0;
  for (let i = 0; i < list.length; i++) {
    const { tick, cmd } = list[i];
    if (tick < last) throw new RangeError(`ticks out of order at ${i}`);
    w.varint(tick - last);
    last = tick;
    writeCommand(w, cmd);
  }
  return w.bytes();
}

/** Decode a command stream. Throws DecodeError on any malformed byte. */
export function decodeStream(bytes: Uint8Array, maxTick = Number.MAX_SAFE_INTEGER): TimedCommand[] {
  const out: TimedCommand[] = [];
  let at = 0;
  let tick = 0;
  while (at < bytes.length) {
    let delta = 0;
    let mul = 1;
    for (let k = 0; ; k++) {
      if (at >= bytes.length || k > 4) throw new DecodeError(`bad varint at ${at}`);
      const b = bytes[at++];
      delta += (b & 0x7f) * mul;
      mul *= 0x80;
      if ((b & 0x80) === 0) break;
    }
    tick += delta;
    if (tick > maxTick) throw new DecodeError(`command after tick ${maxTick}`);
    const r = readCommand(bytes, at);
    out.push({ tick, cmd: r.cmd });
    at = r.next;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// base64 (no Buffer / btoa dependency: the same code runs in the browser, the Worker and Node)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    s += `${B64[(n >>> 18) & 63]}${B64[(n >>> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += `${B64[(n >>> 18) & 63]}${B64[(n >>> 12) & 63]}${B64[(n >>> 6) & 63]}=`;
  }
  return s;
}

/** Strict decode: canonical padding only. Throws DecodeError. */
export function fromBase64(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new DecodeError('base64 length');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(idiv(s.length, 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = s.charCodeAt(i + k);
      const last = i + 4 === s.length;
      if (c === 61 && last && k >= 4 - pad) {
        n <<= 6;
        continue;
      }
      const v = c < 128 ? B64_INDEX[c] : -1;
      if (v < 0) throw new DecodeError('base64 character');
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >>> 16) & 0xff;
    if (o < out.length) out[o++] = (n >>> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  if (toBase64(out) !== s) throw new DecodeError('non-canonical base64');
  return out;
}
