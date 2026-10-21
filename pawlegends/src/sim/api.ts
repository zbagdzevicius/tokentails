/**
 * THE CONTRACT between the sim and everything else (render, input, host, backend). Parallel lanes code against
 * these types; change them only additively, and note any breaking change in the same commit.
 *
 * Units everywhere (POC.md §4.2): positions and distances in integer mm (map 100,000 × 60,000, origin bottom-left,
 * +y up), time in ticks at 30 Hz, angles in 1/4096 turn (0 = +x, counter-clockwise), percentages in basis points.
 * Render code converts at the edge: metres = mm / 1000, world z = −y / 1000 or as the renderer chooses.
 *
 * Pure types and constants only: no DOM, no three, no floats. Node-importable.
 */
import type { HeroId } from '../data/heroes/types';
import type { Difficulty } from '../data/bots';
import type { TrickId } from '../data/tricks';
import type { BarkKind, PingKind } from '../data/pings';

export type { HeroId, Difficulty, TrickId, PingKind, BarkKind };
export { PING_KINDS, BARK_KINDS } from '../data/pings';

/** 0 = Purrhaven (left, the human's team), 1 = Woof (right). */
export type Team = 0 | 1;
/** Entity team in snapshots: 2 = neutral (rat camp, Pudding). */
export type EntityTeam = 0 | 1 | 2;
/** Hero slot: 0..2 Purrhaven (the human is slot 0), 3..5 Woof. */
export type Slot = 0 | 1 | 2 | 3 | 4 | 5;

export const HUMAN_SLOT = 0;
export const SLOTS_PER_TEAM = 3;
export const SLOT_COUNT = 6;
export const teamOfSlot = (slot: number): Team => (slot < SLOTS_PER_TEAM ? 0 : 1);

// ---------------------------------------------------------------------------------------------------------------
// Match setup

/**
 * Render-only cosmetics (coats, chromas, frames, Companion Kittens). The sim never reads them and they are not
 * part of the replay or the hash (POC.md §7.1).
 */
export interface CosmeticsConfig {
  /** Per hero slot: a coat or chroma id, or null for the default. */
  heroSkins?: readonly (string | null)[];
  /** Token Tails cat ids shown as Companion Kittens on the player's team. */
  companionCats?: readonly string[];
  frame?: string | null;
}

/**
 * Sim v10 (GAPS B0): how bots choose talents. 'seeded' is the only mode of a real match and of every replay; 'first'
 * (the pre-v10 rule) and 'branch' (option 1 at level 6) are for headless runs (`npm run match -- --bot-talents`).
 */
export type BotTalentMode = 'first' | 'seeded' | 'branch';
export const BOT_TALENT_MODES: readonly BotTalentMode[] = Object.freeze(['first', 'seeded', 'branch'] as BotTalentMode[]);

/** Sim v10 (GAPS B0): the match mutator. Only 'none' exists in v10 (mutators come later, GAPS §8 item 18). */
export type Mutator = 'none';
export const MUTATORS: readonly Mutator[] = Object.freeze(['none'] as Mutator[]);

export interface MatchConfig {
  /** uint32. A dare link carries it; otherwise the host draws one. */
  seed: number;
  /** Hero per slot (length 6). Use `fillPicks` to draw the bot slots from the seed. */
  picks: readonly HeroId[];
  /** Paw Trick per slot (length 6). */
  tricks: readonly TrickId[];
  difficulty: Difficulty;
  cosmetics?: CosmeticsConfig;
  /**
   * Headless tools only (sim v10): the bots' talent rule, default 'seeded'. Not part of the replay: a replay always
   * re-sims with 'seeded', so a match played with another mode does not verify.
   */
  botTalents?: BotTalentMode;
}

// ---------------------------------------------------------------------------------------------------------------
// Commands (§11.3). Coordinates in mm; the binary stream quantises them to 250 mm.

export const Op = Object.freeze({
  Move: 1,
  AttackMove: 2,
  Attack: 3,
  Cast: 4,
  Trick: 5,
  Stop: 6,
  Nap: 7,
  Talent: 8,
  /** Sim v10 (GAPS B1): a command ping to the allied bots; slot 0 only. */
  Ping: 9,
  /**
   * Sim v10 (GAPS B2): the human forfeits; its team loses at the end of the tick (`reason` 'forfeit'). Applies only
   * from DifficultyRules.forfeitFrom (never on Rookie); earlier it is dropped, unlogged.
   */
  Forfeit: 10,
} as const);
export type Op = (typeof Op)[keyof typeof Op];

/** Ability slot index for `cast`: 0 Q, 1 W, 2 E, 3 R. */
export type CastSlot = 0 | 1 | 2 | 3;
/** Talent tier index (0 = level 3, 1 = level 6, 2 = level 9) and choice (0 or 1). */
export type TalentTier = 0 | 1 | 2;

export type Command =
  | { op: typeof Op.Move; x: number; y: number }
  | { op: typeof Op.AttackMove; x: number; y: number }
  | { op: typeof Op.Attack; id: number }
  /** `id` = target entity id, or NO_TARGET (255) for a ground-aimed cast. */
  | { op: typeof Op.Cast; slot: CastSlot; x: number; y: number; id: number }
  | { op: typeof Op.Trick; x: number; y: number }
  | { op: typeof Op.Stop }
  | { op: typeof Op.Nap }
  | { op: typeof Op.Talent; tier: TalentTier; choice: 0 | 1 }
  /**
   * Sim v10 (GAPS B1): `kind` = PING_KINDS index; (x, y) the point (Go here); `id` the enemy hero (Focus), else
   * NO_TARGET. At most one every PING.minGap ticks and PING.maxPerMatch a match (data/pings.ts). A ping may share its
   * tick with one other command: the latest ping and the latest other command of a tick both apply.
   */
  | { op: typeof Op.Ping; kind: number; x: number; y: number; id: number }
  | { op: typeof Op.Forfeit };

export const NO_TARGET = 0xff;

/** One command at a tick (the replay and the protocol carry these). */
export interface TimedCommand {
  tick: number;
  cmd: Command;
}

// ---------------------------------------------------------------------------------------------------------------
// Snapshots (per team: what that team may see, POC.md §7.3 brush rule)

export type EntityKind = 'hero' | 'minion' | 'tower' | 'core' | 'fountain' | 'camp' | 'pudding' | 'pickup';

/** Pickup kinds (sim v4, data/pickups.ts). */
export type PickupKind = 'frenzy' | 'snack';
/** Snapshot ids of pickups start here (after the last unit id; `slot` is the pickup index 0..3). */
export const PICKUP_ID_BASE = 63; // lint-sim: allow (= ENTITY_CAP in world.ts, pinned by pickups.test.ts)
/** Bonus kinds of the `buff` event (sim v4). */
/** 'takedown' (sim v4): a hero credited with a takedown got TAKEDOWN_HEAL back (data/xp.ts); `ticks` is 0. */
export type BuffKind = 'nineLives' | 'frenzy' | 'snack' | 'pack' | 'zoomies' | 'takedown';

/** Coarse state for animation. */
export type UnitStateName = 'idle' | 'moving' | 'attacking' | 'casting' | 'dead' | 'napping';

/** Bit flags in `EntitySnap.buffs` (same values as `Buff` in world.ts). */
export const BuffFlag = Object.freeze({
  Stealth: 1 << 0,
  Untargetable: 1 << 1,
  Invulnerable: 1 << 2,
  Stunned: 1 << 3,
  Rooted: 1 << 4,
  Feared: 1 << 5,
  Slowed: 1 << 6,
  Shielded: 1 << 7,
  Hasted: 1 << 8,
  InBrush: 1 << 9,
  Marked: 1 << 10,
  Channeling: 1 << 11,
  Blocking: 1 << 12,
  Tethered: 1 << 13,
  /** Sim v4: Zoomies (+80% speed after the fountain), Frenzy Catnip, Nine Lives (burst damage reduced), rat-camp Pack buff. */
  Zoomies: 1 << 14,
  Frenzy: 1 << 15,
  NineLives: 1 << 16,
  Pack: 1 << 17, // lint-sim: allow (a bit index)
  /** Sim v10 (GAPS B5): Purr-ify's crowd-control immunity. */
  Purrified: 1 << 18, // lint-sim: allow (a bit index)
} as const);

export interface EntitySnap {
  /** Entity id (stable for the match; ids are slot indices, heroes 0..5). */
  id: number;
  kind: EntityKind;
  team: EntityTeam;
  /** Hero slot (0..5) for heroes; index within its kind otherwise. */
  slot: number;
  /** Heroes only. */
  hero?: HeroId;
  /** Heroes only: 1..10. */
  level?: number;
  /** Minions: 'melee' | 'ranged' | 'siege'. Towers: 'outer' | 'inner'. */
  variant?: string;
  /** Lane for minions and towers. */
  lane?: 'sunny' | 'puddle';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  state: UnitStateName;
  facing: number;
  buffs: number;
  /** Heroes only, the viewer's own team: ticks left on Q, W, E, R, Trick (0 = ready). */
  cooldowns?: readonly [number, number, number, number, number];
  /** Heroes only, while dead: ticks until respawn. */
  respawnIn?: number;
  /** Heroes only, the viewer's own team: cumulative XP (levels at data/xp.ts XP.toLevel). */
  xp?: number;
  /** Heroes only, the viewer's own team: talent choice per tier (levels 3, 6, 9): −1 not chosen, else 0 or 1. */
  talents?: readonly [number, number, number];
  /** Heroes only, the viewer's own team: the passive resource (Clem's Valor, 0..100; Avietė's charge ticks left), else 0. */
  resource?: number;
  /** Heroes only (sim v10, GAPS B6), both teams: the hero took its level-6 shape branch (BRANCH_TALENT). View only. */
  branch?: boolean;
  /** Heroes only (sim v9), both teams: Avietė is Charged (her next hit on a hero stuns); the enemy sees the glow too. */
  charged?: boolean;
  /** Heroes only (sim v9), the viewer's own team: Avietė's charge lockout, ticks left (0 = none). View only. */
  lockout?: number;
  /** Heroes only (sim v9): charmed (Gabė's Under Her Spell), not feared: the render shows hearts. */
  charmed?: boolean;
  /** Heroes only (sim v4): takedowns since the last death; 3+ means a bounty is on the hero (a crown). */
  bountyStreak?: number;
  /** Pickups only (sim v4): which pickup. `team` 2 = anyone may take it, else only that team (Fish Snack). */
  sub?: PickupKind;
}

export interface ProjectileSnap {
  index: number;
  team: Team;
  owner: number;
  x: number;
  y: number;
  /** mm per tick, for interpolation. */
  vx: number;
  vy: number;
  kind: number;
}

export interface ZoneSnap {
  index: number;
  team: EntityTeam;
  owner: number;
  x: number;
  y: number;
  radius: number;
  ttl: number;
  kind: number;
  /** Sim v9: ticks until the zone is armed (a burst's telegraph), 0 = armed. */
  arm?: number;
}

export type MatchPhase = 'gate' | 'play' | 'sunset' | 'suddenDeath' | 'ended';

export interface MatchClock {
  tick: number;
  /** Whole seconds since the start (tick / 30, truncated). */
  seconds: number;
  phase: MatchPhase;
  /** Ticks until the next phase change, or 0 when none is left. */
  nextPhaseIn: number;
}

export interface MatchScore {
  /** Takedowns per team. */
  kills: readonly [number, number];
  /** Towers destroyed BY each team. */
  towers: readonly [number, number];
}

/** FX events for the render (hits, casts, deaths, level-ups ...). `tick` is the tick they happened on. */
export type SimEvent =
  | { type: 'hit'; tick: number; src: number; dst: number; amount: number; shielded: number; kind: 'basic' | 'ability' | 'tower' | 'zone' | 'chip' }
  | { type: 'cast'; tick: number; src: number; slot: CastSlot | 4; x: number; y: number; target: number }
  | { type: 'windup'; tick: number; src: number; slot: CastSlot | 4; x: number; y: number; ticks: number }
  | { type: 'death'; tick: number; id: number; killer: number }
  | { type: 'levelup'; tick: number; id: number; level: number }
  | { type: 'talentOffer'; tick: number; slot: number; tier: TalentTier }
  | { type: 'tower'; tick: number; id: number; destroyedBy: Team }
  | { type: 'pudding'; tick: number; what: 'spawn' | 'hop' | 'calmed' | 'escort' | 'leave'; team?: Team }
  | { type: 'sunset'; tick: number }
  | { type: 'suddenDeath'; tick: number }
  // Sim v4 (fun plan §0.2):
  /** Hero `id` took a pickup. */
  | { type: 'pickup'; tick: number; id: number; kind: PickupKind; team: Team }
  /** A pickup appeared (`index` = its snapshot slot; id = PICKUP_ID_BASE + index). */
  | { type: 'pickupSpawn'; tick: number; index: number; kind: PickupKind; x: number; y: number }
  /** Hero `id` reached a takedown streak of 3+: killing it now pays `value` bonus XP. */
  | { type: 'bounty'; tick: number; id: number; value: number }
  /** `killer` (−1: a tower or minion) ended `victim`'s bounty worth `value` XP. */
  | { type: 'shutdown'; tick: number; killer: number; victim: number; value: number }
  /** `team`'s underdog waves start (COMEBACK in data/minions.ts: +10% minion HP on its next 2 waves). */
  | { type: 'comeback'; tick: number; team: Team }
  /** XP for hero `id` (sent to its own team only). 'tower' (sim v4): its team took an enemy tower. */
  | { type: 'xp'; tick: number; id: number; amount: number; reason: 'kill' | 'assist' | 'minion' | 'lastHit' | 'camp' | 'trickle' | 'pickup' | 'tower' }
  /** The match's first takedown. */
  | { type: 'firstBlood'; tick: number; killer: number; victim: number }
  /** A bonus on hero `id` started (for `ticks`): Nine Lives saved it, a pickup, the rat camp's Pack buff, Zoomies. */
  | { type: 'buff'; tick: number; id: number; kind: BuffKind; ticks: number }
  // Sim v10 (GAPS B1), the human's team only:
  /** Slot 0 pinged: `target` the focused hero or −1; `took` = allied bots that took it as an order. */
  | { type: 'ping'; tick: number; kind: PingKind; x: number; y: number; target: number; took: number }
  /** Ally bot `id` answers a ping: 'ok' (on it) or 'heal' (refused: "Healing first!"). The render picks the text. */
  | { type: 'bark'; tick: number; id: number; what: BarkKind };

export type SimEventType = SimEvent['type'];

export interface Snapshot {
  /** The team this snapshot is filtered for. */
  team: Team;
  clock: MatchClock;
  score: MatchScore;
  /** Visible entities, ascending id. */
  entities: EntitySnap[];
  projectiles: ProjectileSnap[];
  zones: ZoneSnap[];
  /** Events of the last stepped tick that this team may see. */
  events: SimEvent[];
}

// ---------------------------------------------------------------------------------------------------------------
// Result and replay

export type Outcome = 'won' | 'lost';

export interface SlotStats {
  slot: number;
  hero: HeroId;
  kills: number;
  deaths: number;
  assists: number;
  heroDamage: number;
  towerDamage: number;
  level: number;
  /** Sim v10: damage this hero soaked from any source (HP lost plus shield used up, after armour). */
  damageTaken: number;
  /** Sim v10: HP this hero's kit restored plus shield it granted, to itself or allies (not the fountain or Fish Snack). */
  healShield: number;
  /** Sim v10: damage this hero dealt to neutral objectives (the rat camp and Pudding). */
  objective: number;
}

export interface MatchResult {
  /** From the human's (slot 0, Purrhaven) point of view. */
  outcome: Outcome;
  winner: Team;
  /** Sim v10 (GAPS B2): 'forfeit' = the human forfeited (outcome 'lost'). */
  reason: 'core' | 'safetyEnd' | 'forfeit';
  ticks: number;
  /** 8-digit hex FNV-1a of the final state. */
  finalHash: string;
  stats: SlotStats[];
}

/** The replay the game posts to `/user/catbassadors/live` in the `pawlegends` field (§11.3). */
export interface ReplayRecord {
  v: 1;
  simVersion: number;
  /** uint32 */
  seed: number;
  difficulty: Difficulty;
  /** The human (slot 0); bot picks and tricks come from the seed (`fillPicks`). */
  hero: HeroId;
  trick: TrickId;
  /** <= MAX_TICKS (19,800). */
  ticks: number;
  /** base64 of the binary command stream (≤ MAX_INPUT_CHARS). */
  inputs: string;
  outcome: Outcome;
  /** hex FNV-1a */
  finalHash: string;
  /**
   * Sim v10: the match mutator; v10 records always carry 'none' and the server accepts only 'none' (or no field).
   * The backend leaves a mutator other than 'none' out of the fastest-win record and catnip (GAPS §8 item 1).
   */
  mutator?: Mutator;
}

/** Alias with the spec's name. */
export type PawlegendsReplay = ReplayRecord;

export { MAX_INPUT_CHARS, MAX_TICKS } from '../data/limits';

export type VerifyCode =
  | 'PAWLEGENDS_REPLAY_INVALID'
  | 'PAWLEGENDS_SIM_VERSION'
  | 'PAWLEGENDS_TOO_LONG'
  | 'PAWLEGENDS_OUTCOME_MISMATCH'
  | 'PAWLEGENDS_HASH_MISMATCH'
  | 'PAWLEGENDS_NOT_ENDED';

export type VerifyResult =
  /** Sim v10 (GAPS B2): `reason` says how the match ended ('forfeit': the human forfeited; the backend stores 'quit'). */
  | { ok: true; outcome: Outcome; finalHash: string; ticks: number; stats: SlotStats[]; reason: MatchResult['reason'] }
  | { ok: false; code: VerifyCode; message: string };

// ---------------------------------------------------------------------------------------------------------------
// The sim's functional surface (implemented in src/sim/index.ts)

/** Opaque match handle. */
export interface Match {
  readonly config: MatchConfig;
}

export interface SimApi {
  createMatch(config: MatchConfig): Match;
  /** Advance one tick. `commands` are the human's (slot 0) commands for this tick; the latest one wins. */
  step(match: Match, commands?: readonly Command[]): void;
  snapshot(match: Match, team: Team): Snapshot;
  /** Hash of the current state (uint32). */
  hash(match: Match): number;
  /** Null while the match runs. */
  result(match: Match): MatchResult | null;
}
