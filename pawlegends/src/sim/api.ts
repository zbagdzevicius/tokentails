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

/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §2.1): the maps. 'crossing' (Purrhaven Crossing, 3v3 Quick, every match before
 * v19) and 'hearthwood' (Hearthwood Divide, 5v5 Classic). Append only: the index is hashed on Hearthwood.
 */
export type MapId = 'crossing' | 'hearthwood';
export const MAP_IDS: readonly MapId[] = Object.freeze(['crossing', 'hearthwood'] as MapId[]);
/** Heroes per team on `map`: 3 on Crossing, 5 on Hearthwood. */
export const teamSizeOf = (map: MapId = 'crossing'): 3 | 5 => (map === 'hearthwood' ? 5 : 3);
/** Hero slots on `map`: 6 or 10. */
export const slotCountOf = (map: MapId = 'crossing'): 6 | 10 => (map === 'hearthwood' ? 10 : 6);

/**
 * Hero slots per team and in all, and team 1's PvP lead (sim v19: live bindings, the map of the match the sim works on
 * now; Crossing's 3, 6 and 3 until a Hearthwood match is created or stepped). Code outside the sim should pass the map
 * to `teamOfSlot` / `leadOf` or use `teamSizeOf`, `slotCountOf`.
 */
export let SLOTS_PER_TEAM = 3;
export let SLOT_COUNT = 6;
/** Snapshot ids of pickups start here (after the last unit id; `slot` is the pickup index 0..3). Sim v19: per map
 *  (63 on Crossing, 150 on Hearthwood), the active map's. */
export let PICKUP_ID_BASE = 63; // lint-sim: allow (= ENTITY_CAP in world.ts, pinned by pickups.test.ts)
/** Team of `slot`: the given map's, else the active map's. */
export const teamOfSlot = (slot: number, map?: MapId): Team => (slot < (map === undefined ? SLOTS_PER_TEAM : teamSizeOf(map)) ? 0 : 1);
/** Sim v19: team `team`'s lead slot on `map` (0, or the first slot of team 1). */
export const leadSlotOf = (team: Team, map: MapId = 'crossing'): number => (team === 0 ? HUMAN_SLOT : teamSizeOf(map));

/** Sim v19: point the slot bindings at the active map (src/sim/map/runtime.ts bindMap). */
export function setSlots(perTeam: number, pickupBase: number): void {
  SLOTS_PER_TEAM = perTeam;
  SLOT_COUNT = perTeam * 2;
  PVP_LEAD1 = perTeam;
  PICKUP_ID_BASE = pickupBase;
}

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

/**
 * Sim v10 (GAPS B0): the match mutator. Only 'none' existed until v21. Sim v22 (WR-BS-PLAN.md §4): 'blitz', the
 * ~3-minute Crossing match (data/mutators.ts); a record of an earlier sim version may only carry 'none'.
 */
export type Mutator = 'none' | 'blitz';
export const MUTATORS: readonly Mutator[] = Object.freeze(['none', 'blitz'] as Mutator[]);
/** Sim v22: the first sim version that plays a mutator other than 'none'. */
export const MUTATOR_PLAY_SINCE = 22; // lint-sim: allow (a version number)

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
  /**
   * Party play (MULTIPLAYER.md §1.1): the human hero slots, ascending, always containing 0, a subset of {0, 1, 2}.
   * Omitted means [0] (single player). A human slot is never driven by the in-sim bots; its commands come from the
   * `others` argument of `step` (slots >= 1). Not part of the v:1 replay; a party match records a PartyReplayRecord.
   */
  humans?: readonly number[];
  /**
   * Sim v16 S-PvP (docs/plans/moba/V16.md §3.1): 'pvp' seats humans on both teams (`humans` lists slots 0..5 with 0
   * and 3, each team's lead), plays by PVP_RULES (data/bots.ts) and needs difficulty 'hard'. Omitted means 'pve'
   * (every match before v16), which is byte-identical to v15.
   */
  mode?: MatchMode;
  /** PvP only: the bot profile (bots/index.ts ALLIES) of team 0's and team 1's fill seats. Default ['hard', 'hard']. */
  fillDifficulty?: readonly [Difficulty, Difficulty];
  /**
   * Sim v19: the map. Omitted means 'crossing' (every match before v19, byte-identical to v17). On 'hearthwood' (5v5)
   * `picks` and `tricks` have 10 slots, `humans` lists slots 0..4 (party) or 0..9 with 0 and 5 (PvP).
   */
  map?: MapId;
  /**
   * Sim v22: the mutator (omitted = 'none', byte-identical to v21). 'blitz' is Crossing only and not in PvP
   * (WR-BS-PLAN.md §3a: bots and Party only).
   */
  mutator?: Mutator;
}

/** Sim v16: 'pve' (co-op and solo against bots) or 'pvp' (humans on both teams). */
export type MatchMode = 'pve' | 'pvp';
export const MATCH_MODES: readonly MatchMode[] = Object.freeze(['pve', 'pvp'] as MatchMode[]);
/** Sim v16 S-PvP: team 1's lead human slot (team 0's is HUMAN_SLOT). Sim v19: the active map's (3, or 5 on Hearthwood). */
export let PVP_LEAD1 = 3;

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
  /**
   * Sim v21 (V21-FUN.md §1.3): the Kibble Cannon's carrier fires at (x, y) after a 0.75 s windup. Ignored from a hero
   * that does not carry the cannon.
   */
  Fire: 11,
  /**
   * Sim v23, KITE-FIX (docs/plans/moba/KITE-FIX.md; Wild Rift: hold Attack and steer): attack unit `id`, walking toward (x, y)
   * while the attack timer runs. The next swing starts the tick the timer is ready with `id` within attack range + the
   * chase leeway; a windup in progress on `id` is kept. Gated like a move (spaced, gives way to a cast).
   */
  Kite: 12,
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
  | { op: typeof Op.Forfeit }
  | { op: typeof Op.Fire; x: number; y: number }
  /** KITE-FIX: `id` the unit to keep attacking; (x, y) where to walk between swings. */
  | { op: typeof Op.Kite; x: number; y: number; id: number };

export const NO_TARGET = 0xff;

/** One command at a tick (the replay and the protocol carry these). */
export interface TimedCommand {
  tick: number;
  cmd: Command;
}

// ---------------------------------------------------------------------------------------------------------------
// Snapshots (per team: what that team may see, POC.md §7.3 brush rule)

/** Sim v19: 'boss' is Captain Grizzlechop (Hearthwood). */
export type EntityKind = 'hero' | 'minion' | 'tower' | 'core' | 'fountain' | 'camp' | 'pudding' | 'pickup' | 'boss';

/** Pickup kinds (sim v4, data/pickups.ts). */
export type PickupKind = 'frenzy' | 'snack';
/** Bonus kinds of the `buff` event (sim v4). */
/** 'takedown' (sim v4): a hero credited with a takedown got TAKEDOWN_HEAL back (data/xp.ts); `ticks` is 0. */
/** Sim v19 (Hearthwood): 'prickle' and 'feather' (jungle buffs), 'hoard' (Grizzlechop's shield). */
/** Sim v22: 'sugarRush' (the Great Pudding's team buff). */
export type BuffKind = 'nineLives' | 'frenzy' | 'snack' | 'pack' | 'zoomies' | 'takedown' | 'prickle' | 'feather' | 'hoard' | 'sugarRush';

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
  /** Sim v17 (V17.md §3.1): Steadfast, the CC-cap immunity after 2 s of hard CC in 4 s. */
  Steadfast: 1 << 19, // lint-sim: allow (a bit index)
  /** Sim v19 (Hearthwood): Prickle Coat, Feather, Grizzlechop's Hoard shield. */
  Prickle: 1 << 20, // lint-sim: allow (a bit index)
  Feather: 1 << 21, // lint-sim: allow (a bit index)
  Hoard: 1 << 22, // lint-sim: allow (a bit index)
  /** Sim v21 (V21-FUN.md): a hero carries the Kibble Cannon; a tower is Fortified; a hero flies off a Boing Bed. */
  Cannon: 1 << 23, // lint-sim: allow (a bit index)
  Fortified: 1 << 24, // lint-sim: allow (a bit index)
  Leaping: 1 << 25, // lint-sim: allow (a bit index)
  /** Sim v22 (MAP-5V5-STANDARD.md §6.2): a hero has Sugar Rush; a minion is boosted by an allied Sugar Rush hero. */
  SugarRush: 1 << 26, // lint-sim: allow (a bit index)
  Sugared: 1 << 27, // lint-sim: allow (a bit index)
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
  /** Sim v19: Hearthwood's 'fence' | 'yarn' | 'gutter' too. */
  lane?: 'sunny' | 'puddle' | 'fence' | 'yarn' | 'gutter';
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
  /**
   * Heroes only, the viewer's own team: the passive resource (Clem's Valor, 0..100; Avietė's charge ticks left; sim v11
   * Stilts's Stride, 0..100), else 0.
   */
  resource?: number;
  /** Heroes only (sim v10, GAPS B6), both teams: the hero took its level-6 shape branch (BRANCH_TALENT). View only. */
  branch?: boolean;
  /** Heroes only (sim v9), both teams: Avietė is Charged (her next hit on a hero stuns); the enemy sees the glow too. */
  charged?: boolean;
  /** Heroes only (sim v17, V17.md §3.7), both teams: Avietė's Shiny Coat is filling (Charged when it ends). View only. */
  charging?: boolean;
  /** Heroes only (sim v9), the viewer's own team: Avietė's charge lockout, ticks left (0 = none). View only. */
  lockout?: number;
  /** Heroes only (sim v9): charmed (Gabė's Under Her Spell), not feared: the render shows hearts. */
  charmed?: boolean;
  /**
   * Heroes only (sim v11), both teams: the kit's alternate body (Meatball rolling or Chonk, Pixel's Boxbot, Stilts's
   * Zoomies). View only.
   */
  form?: boolean;
  /** Heroes only (sim v11), both teams: a held channel (Pixel's Laser Pointer beam, along `facing`). View only. */
  channel?: boolean;
  /** Heroes only (sim v11), both teams: stacks on this hero (Duchess's Disdain, 1..3); absent = 0. */
  stacks?: number;
  /** Heroes only (sim v15), both teams: Domino's Spots on this hero (1..4); absent = 0. */
  dots?: number;
  /** Heroes only (sim v12), the viewer's own team: unspent Fish. */
  fish?: number;
  /** Heroes only (sim v12), both teams: Toy tiers owned (0..4). */
  toy?: number;
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
  /**
   * A cast (or a tower lock-on) winds up for `ticks`. Sim v17: `dst` (when set) is the unit it is aimed at, decided at
   * the windup's start (Cacklejaw's Pack Hunt victim), so the client can mark it.
   */
  | { type: 'windup'; tick: number; src: number; slot: CastSlot | 4 | 5; x: number; y: number; ticks: number; dst?: number }
  | { type: 'death'; tick: number; id: number; killer: number }
  | { type: 'levelup'; tick: number; id: number; level: number }
  | { type: 'talentOffer'; tick: number; slot: number; tier: TalentTier }
  | { type: 'tower'; tick: number; id: number; destroyedBy: Team }
  | { type: 'pudding'; tick: number; what: 'spawn' | 'hop' | 'calmed' | 'escort' | 'leave'; team?: Team }
  /** Sim v19 (Hearthwood): a river objective spawned, was taken (team, last-hit slot), or a jungle buff changed hands. */
  | { type: 'objectiveSpawn'; tick: number; kind: 'grizzlechop' | 'pudding' }
  | { type: 'objective'; tick: number; kind: 'grizzlechop' | 'pudding'; team: Team; slot: number }
  | { type: 'buffSteal'; tick: number; id: number; from: number; kind: 'prickle' | 'feather' }
  | { type: 'sunset'; tick: number }
  | { type: 'suddenDeath'; tick: number }
  // Sim v4 (fun plan §0.2):
  /** Hero `id` took a pickup. */
  | { type: 'pickup'; tick: number; id: number; kind: PickupKind; team: Team }
  /** A pickup appeared (`index` = its snapshot slot; id = PICKUP_ID_BASE + index). */
  | { type: 'pickupSpawn'; tick: number; index: number; kind: PickupKind; x: number; y: number }
  /** Hero `id` reached a takedown streak of 3+: killing it now pays `value` bonus XP. */
  | { type: 'bounty'; tick: number; id: number; value: number }
  /** `killer` (−1: a tower or minion) ended `victim`'s bounty worth `value` XP; sim v12: and `fish` Fish (0 without a killer). */
  | { type: 'shutdown'; tick: number; killer: number; victim: number; value: number; fish: number }
  /** `team`'s underdog waves start (COMEBACK in data/minions.ts: +10% minion HP on its next 2 waves). */
  | { type: 'comeback'; tick: number; team: Team }
  /** XP for hero `id` (sent to its own team only). 'tower' (sim v4): its team took an enemy tower. */
  | { type: 'xp'; tick: number; id: number; amount: number; reason: 'kill' | 'assist' | 'minion' | 'lastHit' | 'camp' | 'trickle' | 'tower' }
  // Sim v12 (docs/FUN-PROGRESSION-V12.md S1):
  /**
   * Fish for hero `id` (its own team only). Not sent for the passive trickle or comeback Fish. 'minion' is a share
   * of a lane minion someone else last-hit, 'lastHit' the last hitter's share; 'pickup' a Fish Snack.
   */
  | { type: 'fish'; tick: number; id: number; amount: number; reason: FishReason }
  /** Hero `id` bought Toy tier `tier` (1..4); every team sees it (enemy spikes show on the scoreboard). */
  | { type: 'buy'; tick: number; id: number; tier: number }
  /** The match's first takedown. */
  | { type: 'firstBlood'; tick: number; killer: number; victim: number }
  /** A bonus on hero `id` started (for `ticks`): Nine Lives saved it, a pickup, the rat camp's Pack buff, Zoomies. */
  | { type: 'buff'; tick: number; id: number; kind: BuffKind; ticks: number }
  // Sim v10 (GAPS B1), the human's team only:
  /** Slot 0 pinged: `target` the focused hero or −1; `took` = allied bots that took it as an order. */
  | { type: 'ping'; tick: number; kind: PingKind; x: number; y: number; target: number; took: number; team?: Team }
  /** Ally bot `id` answers a ping: 'ok' (on it) or 'heal' (refused: "Healing first!"). The render picks the text. */
  | { type: 'bark'; tick: number; id: number; what: BarkKind }
  // Sim v14 (docs/plans/moba/DOGS-V13.md): a viral moment for the render and the share tools (not hashed).
  /** Hero `id`: 'flop' Bravo played dead, 'bigdog' Chili went BIG DOG, 'scream' Howler screamed, 'frozen' it was frozen by SNOW DAY!. */
  | { type: 'clip'; tick: number; id: number; what: ClipKind }
  // Sim v21 (docs/plans/moba/V21-FUN.md), every team sees these (the cannon and the carrier are public):
  /** The Kibble Cannon spawns at (x, y) in 10 s; it spawned (`underdog`: offset toward that trailing team). */
  | { type: 'cannonSoon'; tick: number; x: number; y: number }
  | { type: 'cannonSpawn'; tick: number; x: number; y: number; underdog?: Team }
  /** Hero `id` picked it up (`steal`: from the ground after the other team dropped it). */
  | { type: 'cannonPick'; tick: number; id: number; team: Team; steal: boolean }
  /** It fell at (x, y): its carrier died, napped or was hit out of the windup ('fumble'). */
  | { type: 'cannonDrop'; tick: number; id: number; x: number; y: number; why: 'death' | 'nap' | 'fumble' }
  /** The fuse ran out (pfft). */
  | { type: 'cannonFizzle'; tick: number; x: number; y: number }
  /** Hero `id` fired from (x, y) toward (ax, ay). */
  | { type: 'cannonFire'; tick: number; id: number; x: number; y: number; ax: number; ay: number }
  /** The kibble one-shot hero `dst` (`src` the shooter, or the parrier when it came back). */
  | { type: 'kaboom'; tick: number; src: number; dst: number }
  /** Hero `id` parried the kibble back (Return to sender!); the kibble hit no hero ('whiff', `id` the shooter). */
  | { type: 'cannonParry'; tick: number; id: number }
  | { type: 'cannonWhiff'; tick: number; id: number; x: number; y: number }
  /** Sir Brutus `id` blocked `src`'s kibble at (x, y) with his Guard (or Guard Post dome), which broke. */
  | { type: 'cannonBlock'; tick: number; id: number; src: number; x: number; y: number }
  /** Hero `id` bounced off a Boing Bed from (x, y) to (tx, ty). */
  | { type: 'boing'; tick: number; id: number; x: number; y: number; tx: number; ty: number }
  /** Hero `id` kicked yarn ball `ball`; a roll hit `n` heroes (STRIKE at 3+); a ball unravelled. */
  | { type: 'yarnKick'; tick: number; id: number; ball: number }
  | { type: 'yarnStrike'; tick: number; id: number; n: number }
  | { type: 'yarnUnravel'; tick: number; ball: number; x: number; y: number }
  /** The towers are no longer Fortified. */
  | { type: 'fortifyEnd'; tick: number };

/** Sim v14: what a `clip` event shows. Sim v15: Rocket's nap (`zzz`), Frankie's grab (`footlong`), Domino's R (`dots`). */
export type ClipKind = 'flop' | 'bigdog' | 'scream' | 'frozen' | 'zzz' | 'footlong' | 'dots';

export type SimEventType = SimEvent['type'];

/** Sim v12: why a `fish` event paid. */
export type FishReason = 'kill' | 'assist' | 'firstBlood' | 'shutdown' | 'minion' | 'lastHit' | 'camp' | 'tower' | 'pudding' | 'pickup';
export const FISH_REASONS: readonly FishReason[] = Object.freeze(['kill', 'assist', 'firstBlood', 'shutdown', 'minion', 'lastHit', 'camp', 'tower', 'pudding', 'pickup'] as FishReason[]);

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
  /** Sim v19: the map (omitted on Crossing). */
  map?: MapId;
  /** Sim v19 (Hearthwood): the river objectives, for the minimap timers and the HUD. */
  objectives?: ObjectiveSnap[];
  /** Sim v19 (Hearthwood): every jungle camp (up, or ticks to its respawn). */
  camps?: CampSnap[];
  /** Sim v21: the Kibble Cannon and the Mega Yarn Balls (both teams see all of it). */
  fun?: FunSnap;
}

/**
 * Sim v21 (V21-FUN.md): the cannon's state ('soon' within the 10 s warning, 'ground' where it lies, 'carried' by `by`,
 * `windup` > 0 while it aims at (ax, ay)), the fuse and the ticks to the next spawn; each yarn ball's state and spot.
 * The Boing Beds are fixed per map (`mapInfo`).
 */
export interface FunSnap {
  cannon: { state: 'away' | 'soon' | 'ground' | 'carried'; x: number; y: number; by: number; fuse: number; nextIn: number; windup: number; ax: number; ay: number };
  yarn: { state: 'away' | 'rest' | 'rolling'; x: number; y: number }[];
}

/** Sim v19: a river objective's state. `nextIn` is the ticks to its next spawn while 'away' (−1: no more spawns). */
export interface ObjectiveSnap {
  kind: 'grizzlechop' | 'pudding';
  state: 'away' | 'up' | 'escort';
  nextIn: number;
  x: number;
  y: number;
  team?: Team;
}
/** Sim v19: a jungle camp: index, kind, centre, whether a monster is up, ticks to its respawn (0 while up). */
export interface CampSnap {
  id: number;
  /** Sim v22: 'beetle' (the Beetle Log). */
  kind: 'rat' | 'prickle' | 'crow' | 'toad' | 'beetle';
  x: number;
  y: number;
  up: boolean;
  nextIn: number;
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
  /** Sim v12: Fish earned in the match (after the difficulty handicap), Toy tiers owned at the end, lane minion last hits. */
  fish: number;
  toys: number;
  lastHits: number;
  /** Sim v12: the tick each Toy tier was bought, −1 when it never was. */
  toy1At: number;
  toy2At: number;
  toy3At: number;
  toy4At: number;
}

export interface MatchResult {
  /** From the human's (slot 0, Purrhaven) point of view. */
  outcome: Outcome;
  /** Sim v22: −1 on a draw (`draw`). */
  winner: Team | -1;
  /**
   * Sim v10 (GAPS B2): 'forfeit' = the human forfeited (outcome 'lost'). Sim v22: 'timeUp' = a Blitz match reached its
   * designed end (data/mutators.ts hardEnd), decided on structures, core HP, takedowns, structure damage, else a draw.
   */
  reason: 'core' | 'safetyEnd' | 'forfeit' | 'timeUp';
  /** Sim v22: a 'timeUp' end with every tie-break equal; `winner` is −1 and `outcome` 'lost' for both teams. */
  draw?: true;
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
  /** Sim v19: the map (omitted = 'crossing'); a 'hearthwood' record needs simVersion 18 or later. */
  map?: MapId;
}

/** Party play (MULTIPLAYER.md §1.1): one human's seat in a PartyReplayRecord. */
export interface PartySeat {
  slot: number;
  hero: HeroId;
  trick: TrickId;
}

/**
 * Party play (MULTIPLAYER.md §1.1): the replay of a party match. Bots come from `fillPicksParty(seed, humans)`;
 * `inputs[i]` is the base64 post-gate command stream of `humans[i].slot` (slot 0 first). `picks` and `tricks` are
 * redundant with the seed and the seats and must equal what fillPicksParty gives (checked on verify).
 */
export interface PartyReplayRecord {
  v: 2;
  simVersion: number;
  seed: number;
  difficulty: Difficulty;
  humans: PartySeat[];
  picks: HeroId[];
  tricks: TrickId[];
  ticks: number;
  inputs: string[];
  outcome: Outcome;
  finalHash: string;
  mutator?: Mutator;
  /** Sim v19: the map (omitted = 'crossing'); a 'hearthwood' record needs simVersion 18 or later. */
  map?: MapId;
}

/**
 * Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.7): the replay of a PvP match. Like PartyReplayRecord v2, with seats
 * on both teams (slots 0..5, containing 0 and 3), `mode: 'pvp'` and each team's fill-bot profile. `outcome` is team
 * 0's view (slot 0); the backend derives each slot's result from the verified `winner`.
 */
export interface PvpReplayRecord {
  v: 3;
  mode: 'pvp';
  simVersion: number;
  seed: number;
  difficulty: Difficulty;
  fillDifficulty: [Difficulty, Difficulty];
  humans: PartySeat[];
  picks: HeroId[];
  tricks: TrickId[];
  ticks: number;
  inputs: string[];
  outcome: Outcome;
  finalHash: string;
  mutator?: Mutator;
  /** Sim v19: the map (omitted = 'crossing'). */
  map?: MapId;
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
  | { ok: true; outcome: Outcome; finalHash: string; ticks: number; stats: SlotStats[]; reason: MatchResult['reason']; winner?: Team | -1; draw?: true }
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
