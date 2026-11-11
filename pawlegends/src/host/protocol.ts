/**
 * Host protocol (POC.md §11.2), shared by the POC LocalHost (a Worker) and the Phase 2 pawlegends-server
 * (WebSocket). Every message is a plain object with a `t` tag; `snap` carries a transferable ArrayBuffer built by
 * `encodeSnap`. Keep this file transport-agnostic: no DOM, no Worker globals.
 */
import type {
  CampSnap,
  FunSnap,
  Difficulty,
  EntityKind,
  MapId,
  ObjectiveSnap,
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
import { HERO_IDS } from '../data/heroes';

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
  /** Sim v19: the map (omitted = 'crossing', 3v3 Quick; 'hearthwood' = 5v5 Classic). */
  map?: MapId;
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
  /** Sim v19: the match's map (omitted = 'crossing'). */
  map?: MapId;
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

/**
 * What MatchSession drives (docs/plans/moba/MULTIPLAYER.md §4.1): the LocalHost (solo, a Worker) and the NetHost (party
 * play, lockstep over the relay) both implement it with the same listener API.
 */
export interface MatchHost {
  listen(l: import('./local-host').HostListener): void;
  join(o: import('./local-host').JoinOptions): void;
  send(cmd: import('../sim/api').Command): void;
  pause(paused: boolean): void;
  leave(): void;
  dispose(): void;
  readonly kind: 'worker' | 'inline';
  readonly restarts: number;
  welcome: WelcomeMsg | null;
  /** Party play (§4.3): a view-only touch on each interpolated frame (the own hero's cosmetic lead). */
  present?(f: import('../render/interp').ViewFrame): void;
  /**
   * Party play: while a predicted walk is in flight, where the own hero will be when a command sent now lands (the
   * walker, ahead of the newest snapshot); null otherwise. The input steers and aims heading casts from it.
   */
  predictedSelf?(): { x: number; y: number } | null;
  /** Party play: the measured own-input latency (ms), how far ahead a predicted cast pose runs. */
  inputLatencyMs?(): number;
  /**
   * Party play (LATENCY-PLAN N1): the own Casts and Tricks to start drawing now (wind-up pose and sound), and the
   * ones given up (no sim event within the input latency + 150 ms: fade their pose out). Each is returned once.
   */
  takePredicted?(): { shown: import('../net/predict-action').PredictedAction[]; cancelled: import('../net/predict-action').PredictedAction[] } | null;
}

export type ClientMsgType = ClientMsg['t'];
export type HostMsgType = HostMsg['t'];

// ---------------------------------------------------------------------------------------------------------------
// Binary snapshot: header, then per visible entity a fixed record. Projectiles and zones follow.
//
// header (24 B): u32 tick, u8 team, u8 phase, u16 entityCount, u16 projectileCount, u16 zoneCount,
//                u16 kills0, u16 kills1, u8 towers0, u8 towers1, u16 seconds, u32 nextPhaseIn
// entity (60 B, sim v12; 56 before): u8 id, u8 kind, u8 team, u8 slot, i32 x, i32 y, u16 facing, u8 state, u8 hero | 0x80+variant,
//                i32 hp, i32 maxHp, i32 shield, u32 buffs, u8 level, u8 lane, u16 respawnIn, u16 cooldowns[5],
//                u8 flags (1 cooldowns present, 2 respawnIn present, 4 hero extras present),
//                u8 bountyStreak (heroes, sim v4; was padding), u16 xp, u8 resource, u8 talents (2 bits per tier:
//                choice + 1), u8 pickup sub (sim v4: index into PICKUP_SUBS + 1, 0 = none), u8 fx (sim v9: 1 charged,
//                2 charmed; sim v11: 4 form, 8 channel), u8 lockout (sim v9: Avietė's charge lockout ticks, own team,
//                0 = none), u8 stacks (sim v11: stacks on the hero, Duchess's Disdain; was reserved),
//                u16 fish (sim v12: unspent Fish, own team; 0 for enemies), u8 toy (sim v12: Toy tiers owned, heroes,
//                both teams), u8 dots (sim v15: Domino's Spots on the hero, both teams; was reserved)
// projectile (24 B): u8 index, u8 team, u8 kind, u8 owner, i32 x, i32 y, i32 vx, i32 vy, u32 reserved
// zone (24 B): u8 index, u8 team, u8 kind, u8 owner, i32 x, i32 y, i32 radius, i32 ttl, u16 arm (sim v9), u16 reserved

const PHASES: readonly MatchPhase[] = ['gate', 'play', 'sunset', 'suddenDeath', 'ended'];
/** Append only: the index travels on the wire ('pickup' is sim v4). */
const KINDS: readonly EntityKind[] = ['hero', 'minion', 'tower', 'core', 'fountain', 'camp', 'pudding', 'pickup', 'boss'];
const PICKUP_SUBS: readonly PickupKind[] = ['frenzy', 'snack'];
const STATES: readonly UnitStateName[] = ['idle', 'moving', 'attacking', 'casting', 'dead', 'napping'];
/** The wire index is the HERO_IDS index (append only: the sim v9 champions follow the first four). */
const HEROES: readonly HeroId[] = HERO_IDS;
// Sim v19: append only (Hearthwood's tower tiers and camp kinds).
const VARIANTS: readonly string[] = ['', 'melee', 'ranged', 'siege', 'outer', 'inner', 'gate', 'hearth', 'rat', 'prickle', 'crow', 'toad', 'boss'];
const LANES: readonly ('sunny' | 'puddle' | 'fence' | 'yarn' | 'gutter')[] = ['sunny', 'puddle', 'fence', 'yarn', 'gutter'];
const NONE = 0xff;
const NO_OWNER = 0xff;

export const HEADER_BYTES = 24;
export const ENTITY_BYTES = 60;
export const PROJECTILE_BYTES = 24;
export const ZONE_BYTES = 24;
/**
 * Sim v19 (Hearthwood only, after the zones): a map trailer. u8 0x4d ('M'), u8 map index, u8 objectives, u8 camps;
 * then per objective (16 B) u8 kind, u8 state, u8 team (0xff none), u8 0, i32 nextIn, i32 x, i32 y; per camp (16 B)
 * u8 id, u8 kind, u8 up, u8 0, i32 nextIn, i32 x, i32 y. A Crossing snapshot has no trailer (byte-identical to v18).
 */
export const MAP_TRAILER = 0x4d;
export const TRAILER_HEAD = 4;
export const TRAILER_REC = 16;
const MAP_LIST: readonly MapId[] = ['crossing', 'hearthwood'];
const OBJ_KINDS: readonly ObjectiveSnap['kind'][] = ['grizzlechop', 'pudding'];
const OBJ_STATES: readonly ObjectiveSnap['state'][] = ['away', 'up', 'escort'];
const CAMP_KINDS: readonly CampSnap['kind'][] = ['rat', 'prickle', 'crow', 'toad'];
/**
 * Sim v21 (V21-FUN.md): the fun trailer, after the map trailer (or after the zones on Crossing). u8 0x46 ('F'), u8
 * cannon state, u8 carrier (0xff none), u8 yarn balls; i32 x, i32 y, u16 fuse, u16 windup, i32 nextIn, i32 ax, i32 ay
 * (24 B); then per ball (12 B) u8 state, 3 B 0, i32 x, i32 y.
 */
export const FUN_TRAILER = 0x46;
export const FUN_HEAD = 28;
export const FUN_YARN = 12;
const CANNON_STATES: readonly FunSnap['cannon']['state'][] = ['away', 'soon', 'ground', 'carried'];
const YARN_STATES: readonly FunSnap['yarn'][number]['state'][] = ['away', 'rest', 'rolling'];

const HAS_COOLDOWNS = 1;
const HAS_RESPAWN = 2;
const HAS_EXTRA = 4;
const FX_CHARGED = 1;
const FX_CHARMED = 2;
const FX_FORM = 4;
const FX_CHANNEL = 8;

/** Encode the snapshot (minus `events`, which travel in an `events` message) into a transferable buffer. */
export function encodeSnap(s: Snapshot): ArrayBuffer {
  const trailer = s.map && s.map !== 'crossing';
  const objs = trailer ? (s.objectives ?? []) : [];
  const camps = trailer ? (s.camps ?? []) : [];
  const size =
    HEADER_BYTES +
    s.entities.length * ENTITY_BYTES +
    s.projectiles.length * PROJECTILE_BYTES +
    s.zones.length * ZONE_BYTES +
    (trailer ? TRAILER_HEAD + (objs.length + camps.length) * TRAILER_REC : 0) +
    (s.fun ? FUN_HEAD + s.fun.yarn.length * FUN_YARN : 0);
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
    v.setUint8(o + 53, (e.charged ? FX_CHARGED : 0) | (e.charmed ? FX_CHARMED : 0) | (e.form ? FX_FORM : 0) | (e.channel ? FX_CHANNEL : 0));
    v.setUint8(o + 55, Math.min(255, Math.max(0, e.stacks ?? 0)));
    v.setUint16(o + 56, Math.min(0xffff, Math.max(0, e.fish ?? 0)), true);
    v.setUint8(o + 58, Math.min(255, Math.max(0, e.toy ?? 0)));
    v.setUint8(o + 59, Math.min(255, Math.max(0, e.dots ?? 0)));
    if (extra) {
      v.setUint16(o + 48, e.xp ?? 0, true);
      v.setUint8(o + 50, e.resource ?? 0);
      const t = e.talents ?? [-1, -1, -1];
      v.setUint8(o + 51, (t[0] + 1) | ((t[1] + 1) << 2) | ((t[2] + 1) << 4));
      v.setUint8(o + 54, Math.min(255, e.lockout ?? 0));
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
    v.setUint16(o + 20, Math.min(0xffff, Math.max(0, z.arm ?? 0)), true);
    o += ZONE_BYTES;
  }
  if (trailer) {
    v.setUint8(o, MAP_TRAILER);
    v.setUint8(o + 1, Math.max(0, MAP_LIST.indexOf(s.map!)));
    v.setUint8(o + 2, objs.length);
    v.setUint8(o + 3, camps.length);
    o += TRAILER_HEAD;
    for (const ob of objs) {
      v.setUint8(o, OBJ_KINDS.indexOf(ob.kind));
      v.setUint8(o + 1, OBJ_STATES.indexOf(ob.state));
      v.setUint8(o + 2, ob.team === undefined ? NONE : ob.team);
      v.setInt32(o + 4, ob.nextIn, true);
      v.setInt32(o + 8, ob.x, true);
      v.setInt32(o + 12, ob.y, true);
      o += TRAILER_REC;
    }
    for (const c of camps) {
      v.setUint8(o, c.id);
      v.setUint8(o + 1, CAMP_KINDS.indexOf(c.kind));
      v.setUint8(o + 2, c.up ? 1 : 0);
      v.setInt32(o + 4, c.nextIn, true);
      v.setInt32(o + 8, c.x, true);
      v.setInt32(o + 12, c.y, true);
      o += TRAILER_REC;
    }
  }
  if (s.fun) {
    const c = s.fun.cannon;
    v.setUint8(o, FUN_TRAILER);
    v.setUint8(o + 1, Math.max(0, CANNON_STATES.indexOf(c.state)));
    v.setUint8(o + 2, c.by < 0 ? NONE : c.by);
    v.setUint8(o + 3, s.fun.yarn.length);
    v.setInt32(o + 4, c.x, true);
    v.setInt32(o + 8, c.y, true);
    v.setUint16(o + 12, Math.min(0xffff, Math.max(0, c.fuse)), true);
    v.setUint16(o + 14, Math.min(0xffff, Math.max(0, c.windup)), true);
    v.setInt32(o + 16, c.nextIn, true);
    v.setInt32(o + 20, c.ax, true);
    v.setInt32(o + 24, c.ay, true);
    o += FUN_HEAD;
    for (const y of s.fun.yarn) {
      v.setUint8(o, Math.max(0, YARN_STATES.indexOf(y.state)));
      v.setInt32(o + 4, y.x, true);
      v.setInt32(o + 8, y.y, true);
      o += FUN_YARN;
    }
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
      e.toy = v.getUint8(o + 58);
    }
    const sub = v.getUint8(o + 52);
    if (sub !== 0) e.sub = PICKUP_SUBS[sub - 1];
    const fx = v.getUint8(o + 53);
    if (fx & FX_CHARGED) e.charged = true;
    if (fx & FX_CHARMED) e.charmed = true;
    if (fx & FX_FORM) e.form = true;
    if (fx & FX_CHANNEL) e.channel = true;
    const stacks = v.getUint8(o + 55);
    if (stacks > 0) e.stacks = stacks;
    const dots = v.getUint8(o + 59);
    if (dots > 0) e.dots = dots;
    if (lane !== NONE) e.lane = LANES[lane];
    if (flags & HAS_RESPAWN) e.respawnIn = v.getUint16(o + 34, true);
    if (flags & HAS_COOLDOWNS) {
      // inline reads: no closure per hero per snapshot
      e.cooldowns = [v.getUint16(o + 36, true), v.getUint16(o + 38, true), v.getUint16(o + 40, true), v.getUint16(o + 42, true), v.getUint16(o + 44, true)];
    }
    if (flags & HAS_EXTRA) {
      e.xp = v.getUint16(o + 48, true);
      const tb = v.getUint8(o + 51);
      e.talents = [(tb & 3) - 1, ((tb >> 2) & 3) - 1, ((tb >> 4) & 3) - 1];
      e.resource = v.getUint8(o + 50);
      const lock = v.getUint8(o + 54);
      if (lock > 0) e.lockout = lock;
      e.fish = v.getUint16(o + 56, true);
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
    const arm = v.getUint16(o + 20, true);
    zones.push({
      ...(arm > 0 ? { arm } : {}),
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
  let map: MapId | undefined;
  let objectives: ObjectiveSnap[] | undefined;
  let camps: CampSnap[] | undefined;
  if (o + TRAILER_HEAD <= buf.byteLength && v.getUint8(o) === MAP_TRAILER) {
    map = MAP_LIST[v.getUint8(o + 1)] ?? 'crossing';
    const no = v.getUint8(o + 2);
    const nc = v.getUint8(o + 3);
    o += TRAILER_HEAD;
    objectives = [];
    for (let i = 0; i < no; i++) {
      const team = v.getUint8(o + 2);
      objectives.push({
        kind: OBJ_KINDS[v.getUint8(o)] ?? 'pudding',
        state: OBJ_STATES[v.getUint8(o + 1)] ?? 'away',
        ...(team !== NONE ? { team: team as Team } : {}),
        nextIn: v.getInt32(o + 4, true),
        x: v.getInt32(o + 8, true),
        y: v.getInt32(o + 12, true),
      });
      o += TRAILER_REC;
    }
    camps = [];
    for (let i = 0; i < nc; i++) {
      camps.push({ id: v.getUint8(o), kind: CAMP_KINDS[v.getUint8(o + 1)] ?? 'rat', up: v.getUint8(o + 2) === 1, nextIn: v.getInt32(o + 4, true), x: v.getInt32(o + 8, true), y: v.getInt32(o + 12, true) });
      o += TRAILER_REC;
    }
  }
  let fun: FunSnap | undefined;
  if (o + FUN_HEAD <= buf.byteLength && v.getUint8(o) === FUN_TRAILER) {
    const by = v.getUint8(o + 2);
    const ny = v.getUint8(o + 3);
    fun = {
      cannon: {
        state: CANNON_STATES[v.getUint8(o + 1)] ?? 'away',
        by: by === NONE ? -1 : by,
        x: v.getInt32(o + 4, true),
        y: v.getInt32(o + 8, true),
        fuse: v.getUint16(o + 12, true),
        windup: v.getUint16(o + 14, true),
        nextIn: v.getInt32(o + 16, true),
        ax: v.getInt32(o + 20, true),
        ay: v.getInt32(o + 24, true),
      },
      yarn: [],
    };
    o += FUN_HEAD;
    for (let i = 0; i < ny && o + FUN_YARN <= buf.byteLength; i++) {
      fun.yarn.push({ state: YARN_STATES[v.getUint8(o)] ?? 'away', x: v.getInt32(o + 4, true), y: v.getInt32(o + 8, true) });
      o += FUN_YARN;
    }
  }
  return {
    ...(map ? { map, objectives, camps } : {}),
    ...(fun ? { fun } : {}),
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
