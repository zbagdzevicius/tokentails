/**
 * Party play wire protocol (docs/plans/moba/MULTIPLAYER.md §2). Shared by the game (src/net) and the backend relay:
 * `npm run vendor-sim` copies this file verbatim to backend/src/vendor/pawlegends-net/pawlegends-net.bundle.ts, and
 * `vendor-sim:check` fails when the copy is stale. So: pure TypeScript, NO imports, no DOM, no Node APIs.
 *
 * Two kinds of frames on one WebSocket (subprotocol `pl.1`):
 * - JSON text frames `{t, ...}` for lobby and control. Every frame is <= 1 KB, its length is checked before
 *   JSON.parse, and `parseClientJson` checks the type of every field and refuses unknown keys.
 * - Binary frames whose first byte is the type: CMD, BEAT, HASH (client to server), TURN, CATCHUP, ECHO (server to
 *   client). Sizes are checked per type before decoding. Varints are unsigned LEB128, as in sim/commands.ts.
 *
 * Bump PROTO on ANY wire change, including the order of bits in TURN masks (tests/unit/net-proto.test.ts pins golden
 * bytes for every frame type).
 */

export const PROTO = 5;
/**
 * The oldest PROTO the relay still accepts (M1a, docs/plans/moba/M1A-IMPL.md §5.5). PROTO 2 only adds the `mm.*`
 * JSON frames (Quick Play co-op); the binary frames and the framing are unchanged, so the subprotocol stays `pl.1`. The
 * relay echoes the socket's own proto in `welcome` and never sends an `mm.*` frame or a new error code to a PROTO 1
 * socket.
 */
export const PROTO_MIN = 1;
/**
 * PROTO 3 (M1b casual PvP, docs/plans/moba/V16.md §4.3): the `casual` queue, `mm.accept`, `mm.found.mode`, `void`,
 * team-scoped votes (`remake`), and six human slots on the wire. A co-op or party room never seats slots 3..5, so its
 * TURN bytes are the same as PROTO 2's: only a PvP room (never sent to a PROTO 2 socket) sets a mode or ack bit above
 * 0x07. The subprotocol stays `pl.1`.
 */
export const PROTO_PVP = 3;
/**
 * PROTO 4 (5v5 Classic, docs/plans/moba/MAP-5V5.md §2.7): the `classic` queue (Hearthwood Divide, sim v19+), ten human
 * slots on the wire, `map` and `teamSize` on the party, match and found frames. Masks are varints and an entry's slot
 * has a fourth bit (0x20), so every TURN of a 3v3 room keeps its PROTO 3 bytes; only a Hearthwood room (never sent to
 * a PROTO 3 socket: the relay answers `update_required`) sets a mask bit above 0x3f or a slot above 7.
 */
export const PROTO_CLASSIC = 4;
/**
 * PROTO 5 (friends chat, docs/plans/moba/CHAT-AVATARS.md §5): party chat in the lobby, pick and results (`chat.say` →
 * `chat.msg` to the party, or to the own team in a matchmade party; `chat.reject`), DM notices (`chat.notice`, no body),
 * an avatar per member (`MemberView.av`) and the chat tier, thread id and own blocks on the party view. No binary frame
 * changes. A PROTO 4 socket never gets a `chat.*` frame, and its `chat.say` is refused as unknown.
 */
export const PROTO_CHAT = 5;
export const SUBPROTOCOL = 'pl.1';
/**
 * Quick Play queues: co-op (M1a), casual PvP (M1b, PROTO 3 on a sim >= PVP_SINCE) and 5v5 Classic (PROTO 4 on a sim
 * whose MAP_IDS has 'hearthwood'). 'ranked' is M2.
 */
export const MM_QUEUES = Object.freeze(['coop', 'casual', 'classic'] as const);
export type MmQueue = (typeof MM_QUEUES)[number];
/** The side a queued player asks for: cats, dogs, or either. A team is never mixed. */
export const MM_SIDES = Object.freeze(['cat', 'dog', 'any'] as const);
export type MmSide = (typeof MM_SIDES)[number];
/** Ticks per lockstep turn (D3: 2 ticks, 66.7 ms, 15 Hz). */
export const TURN_TICKS = 2;
export const TURN_MS = 200 / 3;
/**
 * Human slots on the wire: 0..2 are team 0, 3..5 team 1 (PvP only, PROTO 3); on Hearthwood (PROTO 4) 0..4 and 5..9.
 * Party and co-op rooms seat 0..2 only (`COOP_HUMANS`), so their frames never carry a bit above 0x07.
 */
export const MAX_HUMANS = 10;
/** Human slots of a party or co-op room (all on team 0, D1). */
export const COOP_HUMANS = 3;
/** Slots per team on Purrhaven Crossing (slot s is on team `teamOfSlot(s)`); Hearthwood passes 5. */
export const SLOTS_PER_TEAM = 3;
/** The maps a room can be on (the sim's MAP_IDS, append only) and their team sizes. */
export type MapId = 'crossing' | 'hearthwood';
export const MAP_TEAM_SIZE: Readonly<Record<MapId, 3 | 5>> = Object.freeze({ crossing: 3, hearthwood: 5 });
/** Seats per team of a room on `map` (omitted: Crossing). */
export const teamSizeOfMap = (map?: MapId | string | null): 3 | 5 => (map === 'hearthwood' ? 5 : 3);
export const teamOfSlot = (slot: number, teamSize: number = SLOTS_PER_TEAM): 0 | 1 => (slot >= teamSize ? 1 : 0);
/** Each team's lead seat in PvP (its pings and its surrender go into this slot's stream). */
export const leadSlotOf = (team: 0 | 1, teamSize: number = SLOTS_PER_TEAM): number => team * teamSize;
/** Bits of a mode or ack mask: 10 slots (a 3v3 room only ever sets the low 6, which encode as one varint byte). */
const SLOT_MASK = (1 << MAX_HUMANS) - 1;
export const WS_PATH = '/pawlegends/ws';

export class ProtoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtoError';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Commands: the sim's `encodeCommand` bytes (opcode + payload). The table mirrors sim/commands.ts OP_SIZE (a unit test
// keeps them equal); the relay decodes the payload with the vendored sim, this file only frames it.

export const CMD_OP = Object.freeze({ Move: 1, AttackMove: 2, Attack: 3, Cast: 4, Trick: 5, Stop: 6, Nap: 7, Talent: 8, Ping: 9, Forfeit: 10 } as const);
/** Command size by opcode, opcode included (index = opcode; 0 = unknown). */
export const CMD_SIZE: readonly number[] = Object.freeze([0, 5, 5, 2, 7, 5, 1, 1, 2, 7, 1]);
export const cmdSize = (op: number): number => (op > 0 && op < CMD_SIZE.length ? CMD_SIZE[op] : 0);

// ---------------------------------------------------------------------------------------------------------------
// Byte helpers

class Writer {
  private buf: Uint8Array;
  length = 0;
  constructor(cap = 64) {
    this.buf = new Uint8Array(cap);
  }
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
  u32(v: number): void {
    this.ensure(4);
    const x = v >>> 0;
    this.buf[this.length++] = x & 0xff;
    this.buf[this.length++] = (x >>> 8) & 0xff;
    this.buf[this.length++] = (x >>> 16) & 0xff;
    this.buf[this.length++] = (x >>> 24) & 0xff;
  }
  varint(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xfffffff) throw new ProtoError(`varint out of range: ${v}`);
    let x = v;
    while (x >= 0x80) {
      this.u8((x & 0x7f) | 0x80);
      x = Math.floor(x / 0x80);
    }
    this.u8(x);
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  out(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

class Reader {
  at = 0;
  constructor(readonly b: Uint8Array) {}
  get left(): number {
    return this.b.length - this.at;
  }
  u8(): number {
    if (this.at >= this.b.length) throw new ProtoError('truncated');
    return this.b[this.at++];
  }
  u32(): number {
    if (this.at + 4 > this.b.length) throw new ProtoError('truncated');
    const b = this.b;
    const v = (b[this.at] | (b[this.at + 1] << 8) | (b[this.at + 2] << 16) | (b[this.at + 3] << 24)) >>> 0;
    this.at += 4;
    return v;
  }
  /** At most 4 bytes (28 bits): every varint on this wire is a turn, a tick or a sequence number. */
  varint(): number {
    let v = 0;
    let mul = 1;
    for (let k = 0; k < 4; k++) {
      const x = this.u8();
      v += (x & 0x7f) * mul;
      if ((x & 0x80) === 0) return v;
      mul *= 0x80;
    }
    throw new ProtoError('varint too long');
  }
  take(n: number): Uint8Array {
    if (n < 0 || this.at + n > this.b.length) throw new ProtoError('truncated');
    const out = this.b.slice(this.at, this.at + n);
    this.at += n;
    return out;
  }
  end(): void {
    if (this.at !== this.b.length) throw new ProtoError('trailing bytes');
  }
}

/** Read one framed command (opcode + payload) from `r`; refuses unknown opcodes. */
function readCmd(r: Reader): Uint8Array {
  const op = r.b[r.at];
  const size = cmdSize(op ?? 0);
  if (size === 0) throw new ProtoError(`unknown opcode ${String(op)}`);
  return r.take(size);
}

// ---------------------------------------------------------------------------------------------------------------
// Binary frames

export const Frame = Object.freeze({ CMD: 0x01, BEAT: 0x02, HASH: 0x03, TURN: 0x81, CATCHUP: 0x82, ECHO: 0x83 } as const);

/** Largest accepted frame per type (checked before decoding). */
export const MAX_FRAME: Readonly<Record<number, number>> = Object.freeze({
  [Frame.CMD]: 10,
  [Frame.BEAT]: 8,
  [Frame.HASH]: 8,
  // PROTO 4: a 5v5 turn carries up to 10 slots × 2 ticks × (ping + command); a co-op turn stays far under 128 bytes
  [Frame.TURN]: 512,
  [Frame.CATCHUP]: 16 * 1024,
  [Frame.ECHO]: 9,
});
export const MAX_JSON = 1024;
/** CATCHUP chunk body budget (the whole frame stays <= MAX_FRAME[CATCHUP]). */
export const CATCHUP_CHUNK = 16 * 1024 - 16;

export interface CmdFrame {
  seq: number;
  cmd: Uint8Array;
}
export interface BeatFrame {
  lastTurn: number;
  clientMs: number;
}
export interface HashFrame {
  tick: number;
  hash: number;
}
export interface EchoFrame {
  clientMs: number;
  serverMs: number;
}

/** One command of a turn. `sub` 0 = the turn's first tick, 1 = its second. `pilot`: the relay's bot sent it. */
export interface TurnEntry {
  slot: number;
  sub: 0 | 1;
  pilot: boolean;
  cmd: Uint8Array;
}

export interface TurnFrame {
  turn: number;
  /** Bit s set = slot s is piloted this turn. */
  modeMask: number;
  /** acks[s]: the last command sequence number of slot s the relay took, when it changed this turn. */
  acks: (number | undefined)[];
  entries: TurnEntry[];
}

export interface CatchupFrame {
  fromTurn: number;
  toTurn: number;
  last: boolean;
  turns: TurnFrame[];
}

export const encodeCmdFrame = (f: CmdFrame): Uint8Array => {
  const w = new Writer(12);
  w.u8(Frame.CMD);
  w.varint(f.seq);
  if (cmdSize(f.cmd[0] ?? 0) !== f.cmd.length) throw new ProtoError('bad command bytes');
  w.bytes(f.cmd);
  return w.out();
};

export const encodeBeat = (f: BeatFrame): Uint8Array => {
  const w = new Writer(8);
  w.u8(Frame.BEAT);
  w.varint(f.lastTurn);
  w.u32(f.clientMs);
  return w.out();
};

export const encodeHash = (f: HashFrame): Uint8Array => {
  const w = new Writer(8);
  w.u8(Frame.HASH);
  w.varint(f.tick);
  w.u32(f.hash);
  return w.out();
};

export const encodeEcho = (f: EchoFrame): Uint8Array => {
  const w = new Writer(9);
  w.u8(Frame.ECHO);
  w.u32(f.clientMs);
  w.u32(f.serverMs);
  return w.out();
};

function writeTurnBody(w: Writer, f: TurnFrame): void {
  w.varint(f.turn);
  // PROTO 4: varint masks (a mask below 0x80 is the same single byte PROTO 3 wrote)
  w.varint(f.modeMask & SLOT_MASK);
  let ackMask = 0;
  for (let s = 0; s < MAX_HUMANS; s++) if (f.acks[s] !== undefined) ackMask |= 1 << s;
  w.varint(ackMask);
  for (let s = 0; s < MAX_HUMANS; s++) if (f.acks[s] !== undefined) w.varint(f.acks[s]!);
  if (f.entries.length > 0xff) throw new ProtoError('too many entries');
  w.u8(f.entries.length);
  for (const e of f.entries) {
    if (e.slot < 0 || e.slot >= MAX_HUMANS) throw new ProtoError('bad entry slot');
    if (cmdSize(e.cmd[0] ?? 0) !== e.cmd.length) throw new ProtoError('bad entry command');
    // slot bits 0..2 low, bit 3 at 0x20 (PROTO 4: slots 8 and 9), sub at 0x08, pilot at 0x10
    w.u8((e.slot & 0x07) | ((e.slot & 0x08) << 2) | ((e.sub & 1) << 3) | (e.pilot ? 0x10 : 0));
    w.bytes(e.cmd);
  }
}

function readTurnBody(r: Reader): TurnFrame {
  const turn = r.varint();
  const modeMask = r.varint();
  if (modeMask > SLOT_MASK) throw new ProtoError('bad mode mask');
  const ackMask = r.varint();
  if (ackMask > SLOT_MASK) throw new ProtoError('bad ack mask');
  const acks: (number | undefined)[] = [];
  for (let s = 0; s < MAX_HUMANS; s++) if (ackMask & (1 << s)) acks[s] = r.varint();
  const n = r.u8();
  const entries: TurnEntry[] = [];
  for (let i = 0; i < n; i++) {
    const p = r.u8();
    if (p & 0xc0) throw new ProtoError('bad entry flags');
    const slot = (p & 0x07) | ((p & 0x20) >> 2);
    if (slot >= MAX_HUMANS) throw new ProtoError('bad entry slot');
    entries.push({ slot, sub: ((p >> 3) & 1) as 0 | 1, pilot: (p & 0x10) !== 0, cmd: readCmd(r) });
  }
  return { turn, modeMask, acks, entries };
}

/** A TURN body without the type byte (what the room log and CATCHUP carry). */
export const encodeTurnBody = (f: TurnFrame): Uint8Array => {
  const w = new Writer(32);
  writeTurnBody(w, f);
  return w.out();
};

export const encodeTurn = (f: TurnFrame): Uint8Array => {
  const w = new Writer(32);
  w.u8(Frame.TURN);
  writeTurnBody(w, f);
  return w.out();
};

/** A TURN frame from a stored body (no re-encode). */
export const turnFromBody = (body: Uint8Array): Uint8Array => {
  const out = new Uint8Array(body.length + 1);
  out[0] = Frame.TURN;
  out.set(body, 1);
  return out;
};

export const decodeTurnBody = (body: Uint8Array): TurnFrame => {
  const r = new Reader(body);
  const f = readTurnBody(r);
  r.end();
  return f;
};

/** Split concatenated TURN bodies (the room log, a CATCHUP payload). */
export function splitTurnBodies(bytes: Uint8Array): TurnFrame[] {
  const r = new Reader(bytes);
  const out: TurnFrame[] = [];
  while (r.left > 0) out.push(readTurnBody(r));
  return out;
}

export const encodeCatchup = (fromTurn: number, toTurn: number, last: boolean, bodies: Uint8Array): Uint8Array => {
  const w = new Writer(bodies.length + 12);
  w.u8(Frame.CATCHUP);
  w.varint(fromTurn);
  w.varint(toTurn);
  w.u8(last ? 1 : 0);
  w.bytes(bodies);
  return w.out();
};

/** The concatenated TURN bodies of a CATCHUP frame (after its header). */
export function catchupBodies(frame: Uint8Array): Uint8Array {
  const r = new Reader(frame);
  if (r.u8() !== Frame.CATCHUP) throw new ProtoError('not a catchup frame');
  r.varint();
  r.varint();
  r.u8();
  return frame.slice(r.at);
}

export type ClientBinary = { type: typeof Frame.CMD; f: CmdFrame } | { type: typeof Frame.BEAT; f: BeatFrame } | { type: typeof Frame.HASH; f: HashFrame };
export type ServerBinary = { type: typeof Frame.TURN; f: TurnFrame } | { type: typeof Frame.CATCHUP; f: CatchupFrame } | { type: typeof Frame.ECHO; f: EchoFrame };

function checkSize(b: Uint8Array): number {
  if (b.length < 1) throw new ProtoError('empty frame');
  const type = b[0];
  const max = MAX_FRAME[type];
  if (max === undefined) throw new ProtoError(`unknown frame type ${type}`);
  if (b.length > max) throw new ProtoError(`frame ${type} over ${max} bytes`);
  return type;
}

/** Decode a client-to-server binary frame. Throws ProtoError on anything malformed (a strike at the relay). */
export function decodeClientBinary(b: Uint8Array): ClientBinary {
  const type = checkSize(b);
  const r = new Reader(b);
  r.u8();
  if (type === Frame.CMD) {
    const seq = r.varint();
    const cmd = readCmd(r);
    r.end();
    return { type, f: { seq, cmd } };
  }
  if (type === Frame.BEAT) {
    const lastTurn = r.varint();
    const clientMs = r.u32();
    r.end();
    return { type, f: { lastTurn, clientMs } };
  }
  if (type === Frame.HASH) {
    const tick = r.varint();
    const hash = r.u32();
    r.end();
    return { type, f: { tick, hash } };
  }
  throw new ProtoError(`frame ${type} is not a client frame`);
}

/** Decode a server-to-client binary frame. */
export function decodeServerBinary(b: Uint8Array): ServerBinary {
  const type = checkSize(b);
  const r = new Reader(b);
  r.u8();
  if (type === Frame.TURN) {
    const f = readTurnBody(r);
    r.end();
    return { type, f };
  }
  if (type === Frame.CATCHUP) {
    const fromTurn = r.varint();
    const toTurn = r.varint();
    const last = r.u8();
    if (last > 1) throw new ProtoError('bad last flag');
    const turns: TurnFrame[] = [];
    while (r.left > 0) turns.push(readTurnBody(r));
    return { type, f: { fromTurn, toTurn, last: last === 1, turns } };
  }
  if (type === Frame.ECHO) {
    const clientMs = r.u32();
    const serverMs = r.u32();
    r.end();
    return { type, f: { clientMs, serverMs } };
  }
  throw new ProtoError(`frame ${type} is not a server frame`);
}

// ---------------------------------------------------------------------------------------------------------------
// Party codes (§9.1): 6 characters from 31, no 0/O/1/I/L.

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
/** Upper-case, drop spaces and dashes; null unless it is a valid code. */
export function normalizeCode(s: unknown): string | null {
  if (typeof s !== 'string' || s.length > 16) return null;
  const c = s.toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(c) ? c : null;
}
/** "K7QX2M" → "K7Q X2M". */
export const displayCode = (c: string): string => `${c.slice(0, 3)} ${c.slice(3)}`;

// ---------------------------------------------------------------------------------------------------------------
// JSON frames

export const ERROR_CODES = [
  'update_required',
  'bad_ticket',
  'party_not_found',
  'party_ended',
  'party_full',
  'party_busy',
  'party_locked',
  'kicked',
  'rate_limited',
  'server_busy',
  'room_gone',
  'seat_elsewhere',
  'bad_message',
  /** A second seat for the same person (another tab with the same guest key or account). */
  'already_in_party',
  /** The party is alive but this code was replaced (New code, or the leader removed someone): ask for the new link. */
  'code_changed',
  /** PROTO 2: Quick Play refused for now (too many queue joins from this player, address or network); `retryMs`. */
  'mm_locked',
  /** PROTO 2: the seat this member left was given to another player (backfill); there is no seat to come back to. */
  'seat_taken',
  /** PROTO 3: casual PvP needs a newer game (the socket's PROTO or sim is older than PvP). */
  'pvp_update_required',
  /**
   * Live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md): this relay is draining. Reconnect after `retryMs` (the
   * socket closes with 1012); the party, the queue and the match continue on the new relay. Never shown to the player.
   */
  'server_moving',
  /** The room of this resume token lives on another relay right now: reconnect after `retryMs`. Never shown. */
  'room_elsewhere',
  /** The match of this resume token ended (or was abandoned) while the player was away: leave the match screen. */
  'room_over',
  /**
   * The party of this `party.join` code lives on another relay right now (LIVE-MATCH-DEPLOYS.md §14): reconnect after
   * `retryMs` (the socket closes with 4013) and send the join again. The client retries a bounded number of times.
   */
  'party_elsewhere',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type VoteKind = 'surrender' | 'pause' | 'resume' | 'rematch' | 'remake';
export type SocialKind = 'ping' | 'chat' | 'emote';

/**
 * Social ids (MULTIPLAYER.md §7 M2-M3, D8: no player text ever reaches a peer): each kind has ids 0..count-1 (pings
 * are the PING_KINDS order, chat the 8 quick lines and emotes the 4 of src/data/social.ts). The relay drops any other
 * id; the client mirrors the rate limit (1 per 2 s, 10 per 30 s per member).
 */
export const SOCIAL_COUNT = Object.freeze({ ping: 8, chat: 8, emote: 4 } as const);
export const SOCIAL_RATE = Object.freeze({ gapMs: 2000, windowMs: 30_000, perWindow: 10 });
/** Map bounds social coordinates are clamped to (sim units, data/map.ts MAP). */
export const SOCIAL_BOUNDS = Object.freeze({ width: 100_000, height: 60_000 });
/** PROTO 4: the bounds per map (Hearthwood Divide is 128 m square). */
export const SOCIAL_BOUNDS_BY_MAP: Readonly<Record<MapId, { width: number; height: number }>> = Object.freeze({
  crossing: SOCIAL_BOUNDS,
  hearthwood: Object.freeze({ width: 128_000, height: 128_000 }),
});

export const socialIdOk = (kind: SocialKind, id: number): boolean =>
  Number.isInteger(id) && id >= 0 && id < (SOCIAL_COUNT[kind] ?? 0);

/** Clamp a social point to the map as integers (never reaches the sim). */
export function clampSocialPoint(x: number, y: number, map?: MapId): { x: number; y: number } {
  const c = (v: number, max: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
  const b = map === 'hearthwood' ? SOCIAL_BOUNDS_BY_MAP.hearthwood : SOCIAL_BOUNDS;
  return { x: c(x, b.width), y: c(y, b.height) };
}

/** A member's social rate limit (the relay's and the client's mirror). Times in ms. */
export class SocialLimiter {
  private at: number[] = [];
  allow(now: number): boolean {
    this.at = this.at.filter((t) => now - t < SOCIAL_RATE.windowMs);
    if (this.at.length >= SOCIAL_RATE.perWindow) return false;
    if (this.at.length && now - this.at[this.at.length - 1] < SOCIAL_RATE.gapMs) return false;
    this.at.push(now);
    return true;
  }
}
export type PartyPhase = 'lobby' | 'pick' | 'loading' | 'match' | 'results';
export type SlotReason = 'drop' | 'afk' | 'away' | 'late' | 'left' | 'back' | 'desync' | 'restore' | 'open';

export interface HelloMsg {
  t: 'hello';
  proto: number;
  sim: number;
  simHash: string;
  build: string;
  ticket?: string;
  guestKey?: string;
  resume?: { token: string };
  /** `matches` (PROTO 3): completed matches, the casual PvP newbie lock (a hint: matching only, never trusted). */
  hint?: { maxDifficulty: string; newbie: boolean; matches?: number };
}

export type ClientJson =
  | HelloMsg
  | { t: 'party.create'; difficulty: string }
  | { t: 'party.join'; code: string }
  | { t: 'party.leave' }
  | { t: 'party.kick'; member: string }
  | { t: 'party.lead'; member: string }
  | { t: 'party.set'; difficulty?: string; openSeats?: boolean; locked?: boolean }
  | { t: 'party.newcode' }
  | { t: 'party.card'; catId: string | null }
  | { t: 'party.start' }
  | { t: 'party.nudge'; member: string }
  | { t: 'pick.hover'; hero: string }
  | { t: 'pick.lock'; hero: string; trick: string }
  | { t: 'pick.unlock' }
  | { t: 'load'; pct: number }
  | { t: 'loaded' }
  | { t: 'vote'; kind: VoteKind; yes: boolean }
  | { t: 'social'; kind: SocialKind; id: number; x?: number; y?: number; target?: number }
  | { t: 'sync'; fromTurn: number }
  | { t: 'away' }
  | { t: 'back' }
  | { t: 'bye' }
  // PROTO 2 (Quick Play co-op)
  | { t: 'mm.join'; queue: MmQueue; side: MmSide; region?: string }
  | { t: 'mm.leave' }
  | { t: 'mm.side'; side: MmSide }
  | { t: 'mm.backfill'; offer: string; yes: boolean }
  /** PROTO 3: the answer to a casual `mm.found` (10 s; a decline or no answer is a dodge). */
  | { t: 'mm.accept'; match: string; yes: boolean }
  /** A stranger's closed tab: take this identity's own live Quick Play seat back (a stranger has no code to rejoin by). */
  | { t: 'mm.back' }
  /**
   * PROTO 5: one party chat line (lobby, pick, results): a phrase id (`q`), a sticker id (`s`) or, in a party where
   * every member is a registered 16+ account, filtered text (`t`, at most CHAT_SAY_MAX_TEXT characters before the
   * server's normalisation).
   */
  | { t: 'chat.say'; k: ChatKind; id?: number; text?: string };

export type ClientJsonType = ClientJson['t'];

export type ChatKind = 't' | 'q' | 's';
/** The raw text a `chat.say` may carry (the server cuts to 120 characters after normalising, or refuses). */
export const CHAT_SAY_MAX_TEXT = 240;
/** A party chat line's sender rate: 5 in 10 s per socket, its own bucket (not the in-match social one). */
export const CHAT_SAY_RATE = Object.freeze({ windowMs: 10_000, perWindow: 5 });

/** The avatar a member wears (CHAT-AVATARS.md §7.3): icon key, bucket art, frame, title, ranked tier. */
export interface AvatarWire {
  i: string;
  img?: string;
  f?: string;
  t?: string;
  r?: string;
}

type FieldCheck = (v: unknown) => boolean;
const isStr =
  (re: RegExp): FieldCheck =>
  (v) =>
    typeof v === 'string' && re.test(v);
const isInt =
  (min: number, max: number): FieldCheck =>
  (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isBool: FieldCheck = (v) => typeof v === 'boolean';
const ID = /^[a-z][a-z0-9]{0,23}$/;
const TOKEN = /^[A-Za-z0-9_.\-]{8,512}$/;
const MEMBER = /^[a-zA-Z0-9_-]{6,32}$/;

/** Field rules per message type: [check, optional]. Any key not listed is refused. */
const SCHEMA: Readonly<Record<ClientJsonType, Readonly<Record<string, readonly [FieldCheck, boolean]>>>> = {
  hello: {
    proto: [isInt(0, 1000), false],
    sim: [isInt(0, 10000), false],
    simHash: [isStr(/^[0-9a-f]{16}$/), false],
    build: [isStr(/^[a-z0-9.\-]{1,32}$/), false],
    ticket: [isStr(TOKEN), true],
    guestKey: [isStr(/^[A-Za-z0-9_-]{8,64}$/), true],
    resume: [(v) => isPlain(v) && keysOnly(v as object, ['token']) && isStr(TOKEN)((v as { token: unknown }).token), true],
    hint: [
      (v) =>
        isPlain(v) &&
        keysOnly(v as object, ['maxDifficulty', 'newbie', 'matches']) &&
        isStr(ID)((v as { maxDifficulty: unknown }).maxDifficulty) &&
        isBool((v as { newbie: unknown }).newbie) &&
        ((v as { matches?: unknown }).matches === undefined || isInt(0, 1_000_000)((v as { matches: unknown }).matches)),
      true,
    ],
  },
  'party.create': { difficulty: [isStr(ID), false] },
  'party.join': { code: [(v) => normalizeCode(v) !== null, false] },
  'party.leave': {},
  'party.kick': { member: [isStr(MEMBER), false] },
  'party.lead': { member: [isStr(MEMBER), false] },
  'party.set': { difficulty: [isStr(ID), true], openSeats: [isBool, true], locked: [isBool, true] },
  'party.newcode': {},
  'party.card': { catId: [(v) => v === null || isStr(/^[A-Za-z0-9_-]{1,64}$/)(v), false] },
  'party.start': {},
  'party.nudge': { member: [isStr(MEMBER), false] },
  'pick.hover': { hero: [isStr(ID), false] },
  'pick.lock': { hero: [isStr(ID), false], trick: [isStr(ID), false] },
  'pick.unlock': {},
  load: { pct: [isInt(0, 100), false] },
  loaded: {},
  vote: { kind: [(v) => v === 'surrender' || v === 'pause' || v === 'resume' || v === 'rematch' || v === 'remake', false], yes: [isBool, false] },
  social: {
    kind: [(v) => v === 'ping' || v === 'chat' || v === 'emote', false],
    id: [isInt(0, 63), false],
    x: [isInt(-1_000_000, 1_000_000), true],
    y: [isInt(-1_000_000, 1_000_000), true],
    target: [isInt(0, 255), true],
  },
  sync: { fromTurn: [isInt(0, 0xfffffff), false] },
  away: {},
  back: {},
  bye: {},
  'mm.join': {
    queue: [(v) => typeof v === 'string' && (MM_QUEUES as readonly string[]).includes(v), false],
    side: [(v) => typeof v === 'string' && (MM_SIDES as readonly string[]).includes(v), false],
    region: [isStr(/^[a-z0-9-]{1,16}$/), true],
  },
  'mm.leave': {},
  'mm.side': { side: [(v) => typeof v === 'string' && (MM_SIDES as readonly string[]).includes(v), false] },
  'mm.backfill': { offer: [isStr(/^[a-z0-9]{12}$/), false], yes: [isBool, false] },
  'mm.accept': { match: [isStr(/^[a-z0-9]{12}$/), false], yes: [isBool, false] },
  'mm.back': {},
  'chat.say': {
    k: [(v) => v === 't' || v === 'q' || v === 's', false],
    id: [isInt(0, 63), true],
    text: [(v) => typeof v === 'string' && v.length >= 1 && v.length <= CHAT_SAY_MAX_TEXT, true],
  },
};

/** JSON frame types that only a PROTO 2 socket may send or receive. */
export const isMmType = (t: string): boolean => t.startsWith('mm.');

function isPlain(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
function keysOnly(o: object, allowed: readonly string[]): boolean {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return false;
  return true;
}

/**
 * Parse and validate a client JSON frame. The length is checked before JSON.parse; every field is type-checked;
 * unknown keys or types throw ProtoError (never echo the input back).
 */
export function parseClientJson(text: string): ClientJson {
  if (typeof text !== 'string' || text.length > MAX_JSON) throw new ProtoError('json too large');
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new ProtoError('bad json');
  }
  if (!isPlain(v)) throw new ProtoError('not an object');
  const o = v as Record<string, unknown>;
  const t = o.t;
  if (typeof t !== 'string' || !Object.prototype.hasOwnProperty.call(SCHEMA, t)) throw new ProtoError('unknown type');
  const rules = SCHEMA[t as ClientJsonType];
  for (const k of Object.keys(o)) {
    if (k === 't') continue;
    // own keys only: `constructor`, `__proto__` and friends are unknown keys, never inherited rules
    const rule = Object.prototype.hasOwnProperty.call(rules, k) ? rules[k] : undefined;
    if (!rule) throw new ProtoError('unknown key');
    if (o[k] === undefined && rule[1]) continue;
    if (!rule[0](o[k])) throw new ProtoError('bad field');
  }
  for (const k of Object.keys(rules)) if (!rules[k][1] && !Object.prototype.hasOwnProperty.call(o, k)) throw new ProtoError('missing field');
  if (t === 'party.join') o.code = normalizeCode(o.code);
  return o as unknown as ClientJson;
}

// Server to client

export interface MemberView {
  id: string;
  name: string;
  guest: boolean;
  newbie?: boolean;
  card?: { image: string; element: string; tier: string; catId?: string };
  /** The custom cat name: only in the owner's own copy. */
  ownName?: string;
  conn: 'on' | 'away' | 'off';
  slot?: number;
  hero?: string;
  trick?: string;
  locked?: boolean;
  loadPct?: number;
  /** Results phase: this member pressed "Play again together" (lane M6 counts them). */
  again?: boolean;
  /** PROTO 5: the member's avatar (a default hero icon until the account's own resolves; guests show a paw). */
  av?: AvatarWire;
}

export interface PartyView {
  t: 'party';
  code: string;
  phase: PartyPhase;
  leader: string;
  difficulty: string;
  openSeats: boolean;
  locked: boolean;
  deadlineMs?: number;
  waiting?: string[];
  members: MemberView[];
  /** The recipient's own member id. */
  you: string;
  /**
   * PROTO 2: a Quick Play party (strangers matched by the queue). The side is fixed for the whole party. PROTO 3
   * casual: `side` is the recipient's own team's species, `mode: 'casual'`, `team` the recipient's team and `species`
   * both teams' (the other team's heroes stay hidden until loading).
   */
  mm?: {
    side: 'cat' | 'dog';
    strangers: boolean;
    mode?: 'casual';
    team?: 0 | 1;
    species?: ['cat' | 'dog', 'cat' | 'dog'];
    /** PROTO 4 classic: the map and seats per team (absent: Crossing, 3). */
    map?: MapId;
    teamSize?: 3 | 5;
  };
  /** PROTO 2: the friend party is queued for Quick Play (every member shows the queue card). */
  queue?: { sinceMs: number; side: MmSide };
  /**
   * PROTO 5: party chat. `tier` 'text' only when every member is a registered 16+ account in a friend party (never with
   * strangers); `thread` is the id a report names.
   */
  chat?: { tier: 'text' | 'quick'; thread: string };
  /** PROTO 5: member ids the recipient blocked (only in the recipient's own copy): their chat lines are hidden. */
  blocks?: string[];
}

export interface MatchConfigView {
  seed: number;
  picks: string[];
  tricks: string[];
  difficulty: string;
  humans: number[];
  /** PROTO 3 casual: 'pvp' seats humans on both teams (slots 0..5 with 0 and 3), sim v16+. */
  mode?: 'pvp';
  /** PvP: the bot profile of each team's fill seats. */
  fillDifficulty?: [string, string];
  /** PROTO 4 classic (sim v19+): 'hearthwood' plays 5v5 (10 slots; PvP leads 0 and 5). Absent: Crossing. */
  map?: MapId;
}

export interface MatchMsg {
  t: 'match';
  room: string;
  config: MatchConfigView;
  cosmetics: { heroSkins: (string | null)[] };
  you: { slot: number };
  /** Display names per hero slot (humans only; null = a bot). */
  names: (string | null)[];
  turnTicks: number;
  startTurn: number;
  startInMs: number;
  lastSeq: number;
  simVersion: number;
  /** PROTO 2: 'coop' for a Quick Play room (absent for a friend party); PROTO 3: 'casual' for a PvP room. */
  mode?: 'coop' | 'casual';
  /** PROTO 3 casual: the species of each team ([team 0, team 1]). */
  species?: ['cat' | 'dog', 'cat' | 'dog'];
  /** PROTO 4 classic: the map and seats per team (absent: Crossing, 3). */
  map?: MapId;
  teamSize?: 3 | 5;
}

export type ServerJson =
  | { t: 'welcome'; proto: number; member: string; resumeToken: string; serverMs: number; lastSeq?: number }
  /** `reason` (PROTO 3): why `mm_locked` refused a casual search ('pvp_newbie': fewer than 5 matches). */
  | { t: 'error'; code: ErrorCode; retryMs?: number; reason?: 'pvp_newbie' }
  | PartyView
  | MatchMsg
  | { t: 'slot'; slot: number; reason: SlotReason; joined?: boolean; name?: string; laggy?: boolean }
  /** `yes` lists the slots that voted yes (match votes) or member ids. */
  | { t: 'vote'; kind: VoteKind; yes?: (string | number)[]; need?: number; endsMs?: number; result?: 'pass' | 'fail'; team?: 0 | 1 }
  /** PROTO 3: the match was voided (a remake): nobody gains or loses anything. */
  | { t: 'void'; reason: 'remake' }
  | { t: 'social'; kind: SocialKind; id: number; x?: number; y?: number; target?: number; from: string; slot: number }
  | { t: 'nudge'; from: string }
  | { t: 'resync'; reason: 'desync' | 'gap' }
  | { t: 'end'; winner: number; outcome: string; ticks: number; finalHash: string; scored: boolean; why?: string }
  | { t: 'local'; difficulty: string }
  | { t: 'afk'; inMs: number }
  | { t: 'paused'; paused: boolean; leftMs?: number; resuming?: boolean }
  // PROTO 2 (Quick Play co-op): only ever sent to a PROTO 2 socket
  | {
      t: 'mm.status';
      queue: MmQueue;
      side: MmSide;
      waitedMs: number;
      estimateMs: number;
      found: number;
      lowPriorityMs?: number;
      warn?: 'leaver';
      /** PROTO 3 casual: humans found per team ([yours, theirs]). */
      teams?: [number, number];
      /** PROTO 3: no PvP opponent by 45 s, so the search moved to co-op (Keep waiting re-sends casual). */
      from?: 'casual';
      /** PROTO 3: back at the front after someone declined a found match. */
      requeued?: boolean;
    }
  | {
      t: 'mm.found';
      side: 'cat' | 'dog';
      humans: number;
      bots: number;
      difficulty: string;
      /** PROTO 3 casual: the match to accept, counts per team ([humans, bots] for [your team, theirs]) and the timer. */
      mode?: 'casual';
      match?: string;
      teams?: [[number, number], [number, number]];
      acceptByMs?: number;
      /** PROTO 4 classic: the map and seats per team. */
      map?: MapId;
      teamSize?: 3 | 5;
    }
  /** PROTO 3 casual: who accepted so far (counts only). */
  | { t: 'mm.accepted'; match: string; yes: number; need: number }
  | { t: 'mm.cancel'; reason: 'left' | 'away' | 'party' | 'server' | 'update' | 'declined' | 'timeout' }
  | { t: 'mm.backfill.offer'; offer: string; side: 'cat' | 'dog'; clockS: number; score: [number, number]; expiresMs: number }
  /** PROTO 5: a party chat line. `from` is the member id (never an account id); `mid` names it for a report. */
  | { t: 'chat.msg'; mid: string; from: string; k: ChatKind; text?: string; id?: number; at: number }
  /** PROTO 5: your `chat.say` was not sent (`why`: words, contact, link, charset, long, rate, quick_only, phase, muted, cooldown, scope). */
  | { t: 'chat.reject'; why: string; until?: number }
  /** PROTO 5: a friend sent you a DM (no body: read it over the API). Held in loading and match, sent on results. */
  | { t: 'chat.notice'; thread: string };

export type ServerJsonType = ServerJson['t'];
const SERVER_TYPES: readonly ServerJsonType[] = [
  'welcome',
  'error',
  'party',
  'match',
  'slot',
  'vote',
  'social',
  'nudge',
  'resync',
  'end',
  'local',
  'afk',
  'paused',
  'mm.status',
  'mm.found',
  'mm.cancel',
  'mm.backfill.offer',
  'mm.accepted',
  'void',
  'chat.msg',
  'chat.reject',
  'chat.notice',
];

/** Parse a server JSON frame (the client trusts the relay's fields but still refuses unknown types). */
export function parseServerJson(text: string): ServerJson {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new ProtoError('bad json');
  }
  if (!isPlain(v) || !SERVER_TYPES.includes((v as { t: ServerJsonType }).t)) throw new ProtoError('unknown type');
  return v as ServerJson;
}
