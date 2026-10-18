/**
 * Host protocol (POC.md §11.2), shared by the POC LocalHost (a Worker) and the Phase 2 pawlegends-server
 * (WebSocket). Every message is a plain object with a `t` tag; `snap` carries a transferable ArrayBuffer built by
 * `encodeSnap`. Keep this file transport-agnostic: no DOM, no Worker globals.
 */
import type {
  Difficulty,
  EntityKind,
  EntitySnap,
  HeroId,
  MatchPhase,
  MatchResult,
  PickupKind,
  ReplayRecord,
  SimEvent,
  Slot,
  Snapshot,
  Team,
  TrickId,
  UnitStateName,
} from '../sim/api';

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------------------------------------------
// client → host

export interface JoinMsg {
  t: 'join';
  slot: Slot;
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  /** Only from a dare link; otherwise the host draws the seed. */
  seed?: number;
  /**
   * LocalHost only: wall-clock speed multiplier (1 = 30 ticks a second). Never reaches the sim, the replay or the
   * hash, so a sped-up match verifies like any other. Clamped to 1..64; the Phase 2 server ignores it.
   */
  speed?: number;
}

export interface CmdMsg {
  t: 'cmd';
  /** The tick the client meant (the host applies it on its next tick in the POC). */
  tick: number;
  /** One command, `encodeCommand` (§11.3). */
  bytes: Uint8Array;
}

export interface LeaveMsg {
  t: 'leave';
}

/** LocalHost only: freeze or resume the tick loop (Esc menu, host `pause`). The Phase 2 server ignores it. */
export interface PauseMsg {
  t: 'pause';
  paused: boolean;
}

export type ClientMsg = JoinMsg | CmdMsg | LeaveMsg | PauseMsg;

// ---------------------------------------------------------------------------------------------------------------
// host → client

export interface WelcomeMsg {
  t: 'welcome';
  matchId: string;
  seed: number;
  simVersion: number;
  slot: Slot;
  team: Team;
  picks: HeroId[];
  tricks: TrickId[];
}

/** 30 Hz in the POC. `buf` is transferable; decode with `decodeSnap`. */
export interface SnapMsg {
  t: 'snap';
  buf: ArrayBuffer;
}

export interface EventsMsg {
  t: 'events';
  tick: number;
  list: SimEvent[];
}

export interface EndMsg {
  t: 'end';
  outcome: MatchResult['outcome'];
  stats: MatchResult['stats'];
  result: MatchResult;
  replay: ReplayRecord;
}

export type HostMsg = WelcomeMsg | SnapMsg | EventsMsg | EndMsg;

export type ClientMsgType = ClientMsg['t'];
export type HostMsgType = HostMsg['t'];

// ---------------------------------------------------------------------------------------------------------------
// Binary snapshot: header, then per visible entity a fixed record. Projectiles and zones follow.
//
// header (24 B): u32 tick, u8 team, u8 phase, u16 entityCount, u16 projectileCount, u16 zoneCount,
//                u16 kills0, u16 kills1, u8 towers0, u8 towers1, u16 seconds, u32 nextPhaseIn
// entity (56 B): u8 id, u8 kind, u8 team, u8 slot, i32 x, i32 y, u16 facing, u8 state, u8 hero | 0x80+variant,
//                i32 hp, i32 maxHp, i32 shield, u32 buffs, u8 level, u8 lane, u16 respawnIn, u16 cooldowns[5],
//                u8 flags (1 cooldowns present, 2 respawnIn present, 4 hero extras present),
//                u8 bountyStreak (heroes, sim v4; was padding), u16 xp, u8 resource, u8 talents (2 bits per tier:
//                choice + 1), u8 pickup sub (sim v4: index into PICKUP_SUBS + 1, 0 = none), u8[3] reserved
// projectile (24 B): u8 index, u8 team, u8 kind, u8 owner, i32 x, i32 y, i32 vx, i32 vy, u32 reserved
// zone (24 B): u8 index, u8 team, u8 kind, u8 owner, i32 x, i32 y, i32 radius, i32 ttl, u32 reserved

const PHASES: readonly MatchPhase[] = ['gate', 'play', 'sunset', 'suddenDeath', 'ended'];
/** Append only: the index travels on the wire ('pickup' is sim v4). */
const KINDS: readonly EntityKind[] = ['hero', 'minion', 'tower', 'core', 'fountain', 'camp', 'pudding', 'pickup'];
const PICKUP_SUBS: readonly PickupKind[] = ['frenzy', 'snack'];
const STATES: readonly UnitStateName[] = ['idle', 'moving', 'attacking', 'casting', 'dead', 'napping'];
const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw'];
const VARIANTS: readonly string[] = ['', 'melee', 'ranged', 'siege', 'outer', 'inner'];
const LANES: readonly ('sunny' | 'puddle')[] = ['sunny', 'puddle'];
const NONE = 0xff;
const NO_OWNER = 0xff;

export const HEADER_BYTES = 24;
export const ENTITY_BYTES = 56;
export const PROJECTILE_BYTES = 24;
export const ZONE_BYTES = 24;

const HAS_COOLDOWNS = 1;
const HAS_RESPAWN = 2;
const HAS_EXTRA = 4;

/** Encode the snapshot (minus `events`, which travel in an `events` message) into a transferable buffer. */
export function encodeSnap(s: Snapshot): ArrayBuffer {
  const size = HEADER_BYTES + s.entities.length * ENTITY_BYTES + s.projectiles.length * PROJECTILE_BYTES + s.zones.length * ZONE_BYTES;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint32(0, s.clock.tick, true);
  v.setUint8(4, s.team);
  v.setUint8(5, PHASES.indexOf(s.clock.phase));
  v.setUint16(6, s.entities.length, true);
  v.setUint16(8, s.projectiles.length, true);
  v.setUint16(10, s.zones.length, true);
  v.setUint16(12, s.score.kills[0], true);
  v.setUint16(14, s.score.kills[1], true);
  v.setUint8(16, s.score.towers[0]);
  v.setUint8(17, s.score.towers[1]);
  v.setUint16(18, s.clock.seconds, true);
  v.setUint32(20, s.clock.nextPhaseIn, true);
  let o = HEADER_BYTES;
  for (const e of s.entities) {
    v.setUint8(o, e.id);
    v.setUint8(o + 1, KINDS.indexOf(e.kind));
    v.setUint8(o + 2, e.team);
    v.setUint8(o + 3, e.slot);
    v.setInt32(o + 4, e.x, true);
    v.setInt32(o + 8, e.y, true);
    v.setUint16(o + 12, e.facing, true);
    v.setUint8(o + 14, STATES.indexOf(e.state));
    v.setUint8(o + 15, e.hero ? HEROES.indexOf(e.hero) : e.variant ? 0x80 | VARIANTS.indexOf(e.variant) : NONE);
    v.setInt32(o + 16, e.hp, true);
    v.setInt32(o + 20, e.maxHp, true);
    v.setInt32(o + 24, e.shield, true);
    v.setUint32(o + 28, e.buffs, true);
    v.setUint8(o + 32, e.level ?? 0);
    v.setUint8(o + 33, e.lane ? LANES.indexOf(e.lane) : NONE);
    v.setUint16(o + 34, e.respawnIn ?? 0, true);
    const cd = e.cooldowns;
    for (let k = 0; k < 5; k++) v.setUint16(o + 36 + k * 2, cd ? cd[k] : 0, true);
    const extra = e.xp !== undefined;
    v.setUint8(o + 46, (cd ? HAS_COOLDOWNS : 0) | (e.respawnIn !== undefined ? HAS_RESPAWN : 0) | (extra ? HAS_EXTRA : 0));
    v.setUint8(o + 47, Math.min(255, e.bountyStreak ?? 0));
    v.setUint8(o + 52, e.sub ? PICKUP_SUBS.indexOf(e.sub) + 1 : 0);
    if (extra) {
      v.setUint16(o + 48, e.xp ?? 0, true);
      v.setUint8(o + 50, e.resource ?? 0);
      const t = e.talents ?? [-1, -1, -1];
      v.setUint8(o + 51, (t[0] + 1) | ((t[1] + 1) << 2) | ((t[2] + 1) << 4));
    }
    o += ENTITY_BYTES;
  }
  for (const p of s.projectiles) {
    v.setUint8(o, p.index);
    v.setUint8(o + 1, p.team);
    v.setUint8(o + 2, p.kind);
    v.setUint8(o + 3, p.owner < 0 ? NO_OWNER : p.owner);
    v.setInt32(o + 4, p.x, true);
    v.setInt32(o + 8, p.y, true);
    v.setInt32(o + 12, p.vx, true);
    v.setInt32(o + 16, p.vy, true);
    o += PROJECTILE_BYTES;
  }
  for (const z of s.zones) {
    v.setUint8(o, z.index);
    v.setUint8(o + 1, z.team);
    v.setUint8(o + 2, z.kind);
    v.setUint8(o + 3, z.owner < 0 ? NO_OWNER : z.owner);
    v.setInt32(o + 4, z.x, true);
    v.setInt32(o + 8, z.y, true);
    v.setInt32(o + 12, z.radius, true);
    v.setInt32(o + 16, z.ttl, true);
    o += ZONE_BYTES;
  }
  return buf;
}

/** Decode a `snap` buffer. `events` is empty (merge the `events` message for the same tick). */
export function decodeSnap(buf: ArrayBuffer): Snapshot {
  const v = new DataView(buf);
  const tick = v.getUint32(0, true);
  const team = v.getUint8(4) as Team;
  const phase = PHASES[v.getUint8(5)];
  const ne = v.getUint16(6, true);
  const np = v.getUint16(8, true);
  const nz = v.getUint16(10, true);
  const entities: EntitySnap[] = [];
  let o = HEADER_BYTES;
  for (let i = 0; i < ne; i++) {
    const hv = v.getUint8(o + 15);
    const flags = v.getUint8(o + 46);
    const kind = KINDS[v.getUint8(o + 1)];
    const lane = v.getUint8(o + 33);
    const e: EntitySnap = {
      id: v.getUint8(o),
      kind,
      team: v.getUint8(o + 2) as 0 | 1 | 2,
      slot: v.getUint8(o + 3),
      x: v.getInt32(o + 4, true),
      y: v.getInt32(o + 8, true),
      hp: v.getInt32(o + 16, true),
      maxHp: v.getInt32(o + 20, true),
      shield: v.getInt32(o + 24, true),
      state: STATES[v.getUint8(o + 14)],
      facing: v.getUint16(o + 12, true),
      buffs: v.getUint32(o + 28, true),
    };
    if (hv !== NONE) {
      if (hv & 0x80) e.variant = VARIANTS[hv & 0x7f];
      else e.hero = HEROES[hv];
    }
    if (kind === 'hero') {
      e.level = v.getUint8(o + 32);
      e.bountyStreak = v.getUint8(o + 47);
    }
    const sub = v.getUint8(o + 52);
    if (sub !== 0) e.sub = PICKUP_SUBS[sub - 1];
    if (lane !== NONE) e.lane = LANES[lane];
    if (flags & HAS_RESPAWN) e.respawnIn = v.getUint16(o + 34, true);
    if (flags & HAS_COOLDOWNS) {
      const c = (k: number): number => v.getUint16(o + 36 + k * 2, true);
      e.cooldowns = [c(0), c(1), c(2), c(3), c(4)];
    }
    if (flags & HAS_EXTRA) {
      e.xp = v.getUint16(o + 48, true);
      const tb = v.getUint8(o + 51);
      e.talents = [(tb & 3) - 1, ((tb >> 2) & 3) - 1, ((tb >> 4) & 3) - 1];
      e.resource = v.getUint8(o + 50);
    }
    entities.push(e);
    o += ENTITY_BYTES;
  }
  const projectiles: Snapshot['projectiles'] = [];
  for (let i = 0; i < np; i++) {
    const owner = v.getUint8(o + 3);
    projectiles.push({
      index: v.getUint8(o),
      team: v.getUint8(o + 1) as Team,
      kind: v.getUint8(o + 2),
      owner: owner === NO_OWNER ? -1 : owner,
      x: v.getInt32(o + 4, true),
      y: v.getInt32(o + 8, true),
      vx: v.getInt32(o + 12, true),
      vy: v.getInt32(o + 16, true),
    });
    o += PROJECTILE_BYTES;
  }
  const zones: Snapshot['zones'] = [];
  for (let i = 0; i < nz; i++) {
    const owner = v.getUint8(o + 3);
    zones.push({
      index: v.getUint8(o),
      team: v.getUint8(o + 1) as 0 | 1 | 2,
      kind: v.getUint8(o + 2),
      owner: owner === NO_OWNER ? -1 : owner,
      x: v.getInt32(o + 4, true),
      y: v.getInt32(o + 8, true),
      radius: v.getInt32(o + 12, true),
      ttl: v.getInt32(o + 16, true),
    });
    o += ZONE_BYTES;
  }
  return {
    team,
    clock: { tick, seconds: v.getUint16(18, true), phase, nextPhaseIn: v.getUint32(20, true) },
    score: { kills: [v.getUint16(12, true), v.getUint16(14, true)], towers: [v.getUint8(16), v.getUint8(17)] },
    entities,
    projectiles,
    zones,
    events: [],
  };
}

/** Type guard for messages arriving over postMessage / WebSocket. */
export function isClientMsg(m: unknown): m is ClientMsg {
  const t = (m as { t?: unknown } | null)?.t;
  return t === 'join' || t === 'cmd' || t === 'leave' || t === 'pause';
}

export function isHostMsg(m: unknown): m is HostMsg {
  const t = (m as { t?: unknown } | null)?.t;
  return t === 'welcome' || t === 'snap' || t === 'events' || t === 'end';
}

// ---------------------------------------------------------------------------------------------------------------
// WebSocket wire format (Phase 2 server; POC.md §11.2). The Worker uses structured clone (postMessage) instead.
// `snap` travels as a binary frame: the snap buffer itself (binary frames carry nothing else). Every other message
// is a JSON text frame; `cmd.bytes` is base64 in the field `b64`.

export type WireFrame = string | ArrayBuffer;

const toB64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

/** One message → one WebSocket frame. */
export function encodeWire(msg: ClientMsg | HostMsg): WireFrame {
  if (msg.t === 'snap') return msg.buf.slice(0);
  if (msg.t === 'cmd') return JSON.stringify({ t: 'cmd', tick: msg.tick, b64: toB64(msg.bytes) });
  return JSON.stringify(msg);
}

/** One WebSocket frame → a message, or null when it is not a protocol message. */
export function decodeWire(frame: WireFrame): ClientMsg | HostMsg | null {
  if (frame instanceof ArrayBuffer) return { t: 'snap', buf: frame };
  let m: unknown;
  try {
    m = JSON.parse(frame);
  } catch {
    return null;
  }
  const x = m as { t?: unknown; tick?: unknown; b64?: unknown };
  if (x && x.t === 'cmd') return typeof x.b64 === 'string' && typeof x.tick === 'number' ? { t: 'cmd', tick: x.tick, bytes: fromB64(x.b64) } : null;
  if (x && x.t === 'snap') return null;
  return isClientMsg(m) || isHostMsg(m) ? (m as ClientMsg | HostMsg) : null;
}
