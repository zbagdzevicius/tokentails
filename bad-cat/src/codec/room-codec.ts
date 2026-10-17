/**
 * Player room codec (GDD 6.4, 6.6 `r`). encodeRoom writes v2; decodeRoom reads v1 (exactly as before) and v2.
 *
 * v1 (read only): v:4, shell:3, routine:2, event:2, size:2, spawn x:4 z:4, prop count:6, per prop kind:7 x:4 z:4
 * level:2 rot:2 target:1, ancestors count:2 + 12 base64url chars each, CRC-16, base64url.
 *
 * v2: v:4, shell:4, routine:4, routine2:4 (15 = none), event:4, theme:3 (RoomTheme declaration order), boss:1,
 * telegraph:5 (0 = none, else ticks), size:2 (0 = 12x10 / RUN_TICKS, 1 = 14x12 / BOSS_TICKS), spawn x:4 z:4,
 * count:6, per prop kind:7 x:4 z:4 level:2 rot:2 target:1 ext:1 [w-1:3 d-1:3 when ext] cable:1 [x:4 z:4 when cable]
 * — that is the "gameplay part" — then the text part: title byteLen:7 + UTF-8, author byteLen:6 + UTF-8,
 * ancestor count:2 + (byteLen:6 + UTF-8) each, then CRC-16 and base64url. Text is filtered on encode and on decode
 * (title <= 24, author and each ancestor <= 12 code points).
 *
 * Ids: v1 rooms keep 'ugc-<crc32 of the whole v1 body>'. v2 rooms are 'ugc-<crc32 of the gameplay part>', so a
 * renamed or remixed-but-unchanged room keeps its id, seed and ghosts. The seed is that CRC-32.
 */
import {
  BOSS_TICKS,
  ROOM_D,
  ROOM_W,
  RUN_TICKS,
  type Level,
  type PropPlacement,
  type RoomDef,
  type RoomEventKind,
  type RoomTheme,
} from '../types';
import { BitReader, BitWriter } from './bits';
import { fromBase64url, toBase64url } from './base64url';
import { checkCrc16, crc32, withCrc16 } from './crc16';
import { filterName, filterTitle } from './text-filter';

export const ROOM_CODE_VERSION = 2;
const V1 = 1;
const SIZES: readonly { w: number; d: number; ticks: number }[] = [
  { w: ROOM_W, d: ROOM_D, ticks: RUN_TICKS },
  { w: 14, d: 12, ticks: BOSS_TICKS },
];
/** RoomTheme in declaration order (3 bits). */
export const ROOM_THEMES: readonly RoomTheme[] = ['default', 'xmas', 'birthday', 'wedding', 'nye', 'valentine', 'thanksgiving', 'spring'];
export const ROOM_MAX_PROPS = 63;
export const ROOM_TITLE_MAX = 24;
export const ROOM_NAME_MAX = 12;
export const ROOM_MAX_ANCESTORS = 3;
const ROUTINE2_NONE = 15;
const ANCESTOR_RE = /^[A-Za-z0-9_-]{12}$/;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function sizeIndex(r: RoomDef): number {
  const i = SIZES.findIndex((s) => s.w === r.width && s.d === r.depth);
  if (i < 0) throw new RangeError(`room size ${r.width}x${r.depth} not encodable`);
  return i;
}

function u(v: unknown, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  return n < 0 ? 0 : n > max ? max : n;
}

/** The gameplay part of a v2 payload (everything the sim sees). Also hashed for the id and seed. */
function writeGameplay(w: BitWriter, r: RoomDef): void {
  if (r.props.length > ROOM_MAX_PROPS) throw new RangeError(`too many props (max ${ROOM_MAX_PROPS})`);
  const size = sizeIndex(r);
  const theme = ROOM_THEMES.indexOf(r.theme ?? 'default');
  w.write(ROOM_CODE_VERSION, 4);
  w.write(u(r.shell, 15), 4);
  w.write(u(r.routine, 15), 4);
  w.write(r.routine2 === undefined ? ROUTINE2_NONE : u(r.routine2, 14), 4);
  w.write(u(r.event, 15), 4);
  w.write(theme < 0 ? 0 : theme, 3);
  w.write(r.boss ? 1 : 0, 1);
  w.write(u(r.telegraph, 31), 5);
  w.write(size, 2);
  w.write(r.spawn.x & 15, 4);
  w.write(r.spawn.z & 15, 4);
  w.write(r.props.length, 6);
  for (const p of r.props) {
    w.write(p.kind & 127, 7);
    w.write(p.x & 15, 4);
    w.write(p.z & 15, 4);
    w.write(p.level & 3, 2);
    w.write(p.rot & 3, 2);
    w.write(p.target ? 1 : 0, 1);
    const ext = p.w !== undefined || p.d !== undefined;
    w.write(ext ? 1 : 0, 1);
    if (ext) {
      w.write(Math.max(1, u(p.w ?? 1, 8)) - 1, 3);
      w.write(Math.max(1, u(p.d ?? 1, 8)) - 1, 3);
    }
    w.write(p.cable ? 1 : 0, 1);
    if (p.cable) {
      w.write(p.cable.x & 15, 4);
      w.write(p.cable.z & 15, 4);
    }
  }
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function writeText(w: BitWriter, s: string, lenBits: number): void {
  const max = (1 << lenBits) - 1;
  let cps = Array.from(s);
  let b = utf8(s);
  while (b.length > max) b = utf8((cps = cps.slice(0, -1)).join('')); // unreachable after the filter caps
  w.write(b.length, lenBits);
  for (const x of b) w.write(x, 8);
}

function readText(r: BitReader, lenBits: number): string {
  const n = r.read(lenBits);
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = r.read(8);
  return new TextDecoder('utf-8', { fatal: false }).decode(b);
}

/** Ancestor names to write: filtered, non-empty, at most 3 (the last 3, nearest ancestors). */
function ancestorNames(r: RoomDef): string[] {
  const out: string[] = [];
  for (const a of r.ancestors ?? []) {
    const n = filterName(a, ROOM_NAME_MAX);
    if (n) out.push(n);
  }
  return out.slice(-ROOM_MAX_ANCESTORS);
}

function payloadV2(r: RoomDef): Uint8Array {
  const w = new BitWriter();
  writeGameplay(w, r);
  writeText(w, r.title ? filterTitle(r.title, ROOM_TITLE_MAX) : '', 7);
  writeText(w, r.author ? filterName(r.author, ROOM_NAME_MAX) : '', 6);
  const anc = ancestorNames(r);
  w.write(anc.length, 2);
  for (const a of anc) writeText(w, a, 6);
  return w.bytes();
}

/** v2 room code (title, author and ancestor names travel inside it, filtered). Throws on an unencodable size or > 63 props. */
export function encodeRoom(r: RoomDef): string {
  return toBase64url(withCrc16(payloadV2(r)));
}

/** CRC-32 id and seed of a v2 room: over the gameplay part only. */
export function roomGameplayHash(r: RoomDef): number {
  const w = new BitWriter();
  writeGameplay(w, r);
  return crc32(w.bytes());
}

/** null on any malformed payload. */
export function decodeRoom(code: string): RoomDef | null {
  if (typeof code !== 'string' || code.length < 8 || code.length > 2000) return null;
  const raw = fromBase64url(code);
  if (!raw) return null;
  const body = checkCrc16(raw);
  if (!body) return null;
  try {
    const v = body[0] >> 4;
    if (v === V1) return decodeV1(body);
    if (v === ROOM_CODE_VERSION) return decodeV2(body);
    return null;
  } catch {
    return null;
  }
}

function decodeV1(body: Uint8Array): RoomDef | null {
  const r = new BitReader(body);
  if (r.read(4) !== V1) return null;
  const shell = r.read(3);
  const routine = r.read(2);
  const event = r.read(2) as RoomEventKind;
  const size = SIZES[r.read(2)];
  if (!size) return null;
  const spawn = { x: r.read(4), z: r.read(4) };
  if (spawn.x >= size.w || spawn.z >= size.d) return null;
  const n = r.read(6);
  const props: PropPlacement[] = [];
  for (let i = 0; i < n; i++) {
    const kind = r.read(7);
    const x = r.read(4);
    const z = r.read(4);
    const level = r.read(2) as Level;
    const rot = r.read(2) as PropPlacement['rot'];
    const target = r.read(1) === 1;
    if (x >= size.w || z >= size.d) return null;
    const p: PropPlacement = { kind, x, z, level, rot };
    if (target) p.target = true;
    props.push(p);
  }
  const ancestors: string[] = [];
  const na = r.read(2);
  for (let i = 0; i < na; i++) {
    let a = '';
    for (let k = 0; k < 12; k++) a += B64[r.read(6)];
    if (ANCESTOR_RE.test(a)) ancestors.push(a);
  }
  if (r.remaining >= 8) return null;
  const id = crc32(body);
  const room: RoomDef = {
    id: `ugc-${id.toString(16).padStart(8, '0')}`,
    shell,
    routine,
    event,
    width: size.w,
    depth: size.d,
    spawn,
    props,
    seed: id,
    ticks: size.ticks,
  };
  if (ancestors.length) room.ancestors = ancestors;
  return room;
}

function decodeV2(body: Uint8Array): RoomDef | null {
  const r = new BitReader(body);
  if (r.read(4) !== ROOM_CODE_VERSION) return null;
  const shell = r.read(4);
  const routine = r.read(4);
  const routine2 = r.read(4);
  const event = r.read(4);
  if (event > 11) return null;
  const theme = ROOM_THEMES[r.read(3)];
  const boss = r.read(1) === 1;
  const telegraph = r.read(5);
  const size = SIZES[r.read(2)];
  if (!size) return null;
  const spawn = { x: r.read(4), z: r.read(4) };
  if (spawn.x >= size.w || spawn.z >= size.d) return null;
  const n = r.read(6);
  const props: PropPlacement[] = [];
  for (let i = 0; i < n; i++) {
    const kind = r.read(7);
    const x = r.read(4);
    const z = r.read(4);
    const level = r.read(2) as Level;
    const rot = r.read(2) as PropPlacement['rot'];
    const target = r.read(1) === 1;
    if (x >= size.w || z >= size.d) return null;
    const p: PropPlacement = { kind, x, z, level, rot };
    if (target) p.target = true;
    if (r.read(1) === 1) {
      p.w = r.read(3) + 1;
      p.d = r.read(3) + 1;
      if (x + p.w > size.w || z + p.d > size.d) return null;
    }
    if (r.read(1) === 1) {
      const cx = r.read(4);
      const cz = r.read(4);
      if (cx >= size.w || cz >= size.d) return null;
      p.cable = { x: cx, z: cz };
    }
    props.push(p);
  }
  const title = filterTitle(readText(r, 7), ROOM_TITLE_MAX);
  const author = filterName(readText(r, 6), ROOM_NAME_MAX);
  const na = r.read(2);
  const ancestors: string[] = [];
  for (let i = 0; i < na; i++) {
    const a = filterName(readText(r, 6), ROOM_NAME_MAX);
    if (a) ancestors.push(a);
  }
  if (r.remaining >= 8) return null;
  const room: RoomDef = {
    id: '',
    shell,
    routine,
    event,
    width: size.w,
    depth: size.d,
    spawn,
    props,
    seed: 0,
    ticks: size.ticks,
  };
  if (routine2 !== ROUTINE2_NONE) room.routine2 = routine2;
  if (theme !== 'default') room.theme = theme;
  if (boss) room.boss = true;
  if (telegraph) room.telegraph = telegraph;
  const h = roomGameplayHash(room);
  room.id = `ugc-${h.toString(16).padStart(8, '0')}`;
  room.seed = h;
  if (title) room.title = title;
  if (author) room.author = author;
  if (ancestors.length) room.ancestors = ancestors;
  return room;
}
