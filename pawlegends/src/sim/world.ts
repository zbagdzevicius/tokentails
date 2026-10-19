/**
 * World state as structure-of-arrays (POC.md §4.1). One entity table with a fixed id range per kind (ids are slot
 * indices; iteration is always ascending), plus projectile and zone tables. Every field the sim reads lives in a
 * typed array or in `globals`, so `hashWorld` covers the whole state.
 */
import { CAPS, NAV } from '../data/map';
import { NINE_LIVES } from '../data/xp';
import { FNV_OFFSET, fnvInt, fnvInts } from './hash';
import { Rng } from './rng';

export const Kind = Object.freeze({
  None: 0,
  Hero: 1,
  Minion: 2,
  Tower: 3,
  Core: 4,
  Fountain: 5,
  Camp: 6,
  Pudding: 7,
} as const);
export type Kind = (typeof Kind)[keyof typeof Kind];

/** Team codes: 0 Purrhaven (left), 1 Woof (right), 2 neutral (camps, Pudding). */
export const TEAM_PURRHAVEN = 0;
export const TEAM_WOOF = 1;
export const TEAM_NEUTRAL = 2;

/** First id of each kind's range, in ascending order. */
export const RANGE = (() => {
  const heroes = 0;
  const minions = heroes + CAPS.heroes;
  const towers = minions + CAPS.minions;
  const cores = towers + CAPS.towers;
  const fountains = cores + CAPS.cores;
  const camps = fountains + CAPS.fountains;
  const pudding = camps + CAPS.campMonsters;
  const end = pudding + CAPS.pudding;
  return Object.freeze({ heroes, minions, towers, cores, fountains, camps, pudding, end });
})();

export const ENTITY_CAP = RANGE.end;

/** Bits of `buffs` (shared with the snapshot, render reads them). */
export const Buff = Object.freeze({
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
  Zoomies: 1 << 14,
  Frenzy: 1 << 15,
  NineLives: 1 << 16,
  Pack: 1 << 17, // lint-sim: allow (a bit index)
} as const);
export type Buff = (typeof Buff)[keyof typeof Buff];

/** Coarse unit state (snapshot `state`, drives the render animation). */
export const UnitState = Object.freeze({
  Idle: 0,
  Moving: 1,
  Attacking: 2,
  Casting: 3,
  Dead: 4,
  Napping: 5,
} as const);
export type UnitState = (typeof UnitState)[keyof typeof UnitState];

/** Indices into `globals`. */
export const G = Object.freeze({
  Tick: 0,
  Winner: 1, // -1 while running
  Kills0: 2,
  Kills1: 3,
  Towers0: 4, // towers destroyed BY team 0
  Towers1: 5,
  TowerDamage0: 6,
  TowerDamage1: 7,
  Wave: 8,
  EndReason: 9, // 0 running, 1 core kill, 2 safety end
  InputHash: 10, // FNV-1a of every applied (tick, command): the final hash commits to the whole input stream
  SiegeWaves: 11, // waves spawned since TIMELINE.siegeFrom (every 3rd one, counting from the first, adds a siege)
  /** 1 = the in-sim bots (slots 1..5) do not think. Tests only; a real match never sets it. */
  BotsOff: 12,
  /** Tick each rat camp (0 Purrhaven side, 1 Woof side) spawns next; −1 while its rats are up. */
  CampAt0: 13,
  CampAt1: 14,
  /** Pudding (units/pudding.ts): PudState (PUD_STATE), the tick of its next spawn or hop, escort team, lane, wave. */
  PudState: 15,
  PudAt: 16,
  PudTeam: 17, // lint-sim: allow
  PudLane: 18, // lint-sim: allow
  PudWave: 19, // lint-sim: allow
  /** Ticks left on the scared-hop telegraph (0 = none). */
  PudHop: 20, // lint-sim: allow
  /** Pudding spawns so far (bots decide once per spawn whether to contest it). */
  PudSpawns: 21, // lint-sim: allow
  /** Escort breath timer (ticks to the next breath). */
  PudBreath: 22, // lint-sim: allow
  /** Sim v4: this match's Sunset and Sudden Death ticks (data/timeline.ts TIMELINE_BY, by difficulty). */
  Sunset: 23, // lint-sim: allow
  SuddenDeath: 24, // lint-sim: allow
  /** Tick of the next Frenzy Catnip and Fish Snack spawn, and how many Frenzy / Snack spawns so far. */
  FrenzyAt: 25, // lint-sim: allow
  SnackAt: 26, // lint-sim: allow
  FrenzySpawns: 27, // lint-sim: allow
  SnackSpawns: 28, // lint-sim: allow
  /** 1 once the match's first takedown happened. */
  FirstBlood: 29, // lint-sim: allow
  /** Underdog waves left per team, and the tick each team's comeback last started (−big: never). */
  Comeback0: 30, // lint-sim: allow
  Comeback1: 31, // lint-sim: allow
  ComebackAt0: 32, // lint-sim: allow
  ComebackAt1: 33, // lint-sim: allow
  /** Rally stacks of the human's team (DifficultyRules.rallyBp): takedowns the human took part in, capped. */
  Rally: 34, // lint-sim: allow
  /** Cores are invulnerable before this tick (DifficultyRules.coreOpenAt). */
  CoreOpenAt: 35, // lint-sim: allow
  /** The human's low-HP move-speed bonus in bp (DifficultyRules.humanPanicBp; 0 = none). */
  HumanPanic: 36, // lint-sim: allow
  /** Sim v5: the last tick the human gave a command or its hero moved, and where it stood then (carry allies leash). */
  HumanActAt: 37, // lint-sim: allow
  HumanPX: 38, // lint-sim: allow
  HumanPY: 39, // lint-sim: allow
  /** Sim v5: the human's team's core cannot be hit before this tick (DifficultyRules.humanCoreOpenAt). */
  HumanCoreOpenAt: 40, // lint-sim: allow
  /** Sim v5: 1 = the per-hero tuning (HeroData.pvp, sim v8; SIDE_EDGE before) applies to hero-vs-hero damage (DifficultyRules.sideEdge). */
  SideEdge: 41, // lint-sim: allow
  Count: 42, // lint-sim: allow
} as const);
export type G = (typeof G)[keyof typeof G];

export interface World {
  // Entities
  kind: Uint8Array;
  team: Uint8Array;
  alive: Uint8Array;
  /** Index into HERO_IDS for heroes, minion kind for minions, tower tier for towers. */
  sub: Uint8Array;
  lane: Uint8Array;
  waypoint: Uint8Array;
  level: Uint8Array;
  state: Uint8Array;
  facing: Uint16Array;
  buffs: Uint32Array;
  x: Int32Array;
  y: Int32Array;
  hp: Int32Array;
  maxHp: Int32Array;
  shield: Int32Array;
  armour: Int32Array;
  xp: Int32Array;
  moveCarry: Int32Array;
  moveX: Int32Array;
  moveY: Int32Array;
  target: Int32Array;
  attackTimer: Int32Array;
  timer: Int32Array;
  /** Per hero: 4 ability cooldowns + trick cooldown (heroes × 5). */
  cooldowns: Int32Array;
  /** Ticks left on the current basic-attack windup (0 = none); the hit lands when it reaches 0. */
  windup: Int32Array;
  /** Hero order (Order). */
  order: Uint8Array;
  /** Towers and cores: consecutive shots at `shotAt` (ramp). */
  streak: Int32Array;
  shotAt: Int32Array;
  /** Towers and cores: 1 while the target was forced by the hero-aggro rule. */
  forced: Uint8Array;
  /** Last damage source (−1 none) and the tick of the last damage taken. */
  lastHitBy: Int32Array;
  hurtTick: Int32Array;
  /** Hero paths: NAV.maxPathPoints points per hero, `pathLen` used, `pathIdx` next. */
  pathX: Int32Array;
  pathY: Int32Array;
  pathLen: Uint8Array;
  pathIdx: Uint8Array;
  // Status effects (POC.md §4.4), ticks left per entity (0 = none)
  stunT: Int32Array;
  rootT: Int32Array;
  fearT: Int32Array;
  /** Where a feared unit runs from. */
  fearX: Int32Array;
  fearY: Int32Array;
  /** Sim v9: −1 = fear (run from fearX, fearY); ≥ 0 = charm (walk toward that unit: Gabė's Under Her Spell). */
  fearSrc: Int32Array;
  slowT: Int32Array;
  slowBp: Int32Array;
  hasteT: Int32Array;
  hasteBp: Int32Array;
  /** Attack-speed buff. */
  asT: Int32Array;
  asBp: Int32Array;
  /** Cooldown-rate buff: cooldowns tick faster by cdrBp. */
  cdrT: Int32Array;
  cdrBp: Int32Array;
  stealthT: Int32Array;
  untargT: Int32Array;
  /** Revealed (mark): visible to the enemy team through brush and stealth. */
  revealT: Int32Array;
  /** Flat shield (w.shield) expiry; 0 = no expiry. */
  shieldT: Int32Array;
  /** Heal over time: ticks left and HP still to give. */
  healT: Int32Array;
  healLeft: Int32Array;
  /** Forced movement (dash, knockback, homing dash): ticks left, destination, FM kind, homing target, hit mask. */
  fmT: Int32Array;
  fmX: Int32Array;
  fmY: Int32Array;
  fmKind: Uint8Array;
  fmTarget: Int32Array;
  fmHitLo: Int32Array;
  fmHitHi: Int32Array;
  /** Zone index of the arena a unit is tethered to, or −1. */
  tether: Int32Array;
  /** Bush index the unit stands in, or −1 (refreshed after movement). */
  bush: Int32Array;
  /** Visibility: bit t set = team t sees the unit (refreshed after movement and at the end of the tick). */
  seen: Uint8Array;
  // Heroes: casts (§4.3 step 5), Nap, progression, kits
  /** 0 none, 1 walking into range, 2 winding up / resolving this tick. */
  castPhase: Uint8Array;
  /** 0..3 Q W E R, 4 Paw Trick. */
  castSlot: Uint8Array;
  castT: Int32Array;
  castX: Int32Array;
  castY: Int32Array;
  castId: Int32Array;
  napT: Int32Array;
  /** Paw Trick per hero (TRICK_IDS index). */
  trick: Uint8Array;
  /** Talent choice per hero and tier (heroes × 3): −1 not chosen, else 0 or 1. */
  talents: Int32Array;
  /** Kills since the last death (kill XP streak bonus). */
  killStreak: Int32Array;
  /** Tick hero j last damaged hero i, at i × heroes + j (assists). */
  assistTick: Int32Array;
  /** Sim v4 bonuses, ticks left per hero: Zoomies, Frenzy Catnip, Nine Lives, the rat camp's Pack buff. */
  zoomT: Int32Array;
  frenzyT: Int32Array;
  nineT: Int32Array;
  packT: Int32Array;
  /** Tick from which Nine Lives can trigger again. */
  nineReady: Int32Array;
  /** HP damage taken per tick over the last NINE_LIVES.window ticks (heroes × window, index tick % window). */
  dmgRing: Int32Array;
  /** Towers and cores: the hero they locked on to (−1 none) and the lock-on ticks left. */
  lockId: Int32Array;
  lockT: Int32Array;
  /** Kit state, meaning per hero (see src/sim/heroes/*): passive resource, recast stage and window, R and W timers. */
  kValor: Int32Array;
  kStage: Int32Array;
  kWindow: Int32Array;
  kRT: Int32Array;
  kWT: Int32Array;
  kWAge: Int32Array;
  kCount: Int32Array;
  kHonour: Int32Array;
  kHuntT: Int32Array;
  kHuntVictim: Int32Array;
  kChain: Int32Array;
  kFoe: Int32Array;
  kEmpower: Int32Array;
  /** Tick the hero was last damaged by an enemy hero. */
  kHurt: Int32Array;
  /** Volley: arrows that hit each entity during the hero's last Volley (heroes × ENTITY_CAP). */
  volleyHits: Uint8Array;
  /** Minions: the wave number they spawned with (Pudding's escort leaves when its wave is gone). */
  wave: Int32Array;
  // Bots (POC.md §7.2), per hero slot; slot 0 is unused inside the sim (the human, or an outside player-bot)
  /** BotMode. */
  botMode: Uint8Array;
  /** Lane index the bot plays. */
  botLane: Uint8Array;
  /** Enemy hero the bot fights, or −1. */
  botFoe: Int32Array;
  /** Pudding decision: spawn count × 2 + (1 contest, 0 not); −1 undecided. */
  botPud: Int32Array;
  /** Tick enemy hero j entered bot i's awareness, at i × heroes + j (−1 not aware): the reaction delay. */
  botSeen: Int32Array;
  /** The last order the bot issued (op, point, target), so it does not repeat itself. */
  botOp: Uint8Array;
  botX: Int32Array;
  botY: Int32Array;
  botId: Int32Array;
  /** Current mistake: (last tick of it) × 4 + kind (SLIP), or −1. */
  botSlip: Int32Array;
  // Projectiles
  pAlive: Uint8Array;
  pTeam: Uint8Array;
  pKind: Uint8Array;
  pOwner: Int32Array;
  pTarget: Int32Array;
  pX: Int32Array;
  pY: Int32Array;
  pVx: Int32Array;
  pVy: Int32Array;
  pTtl: Int32Array;
  pDmg: Int32Array;
  /** Homing bolts: mm/s. */
  pSpeed: Int32Array;
  /** Skillshots: PFLAG bits. */
  pFlags: Int32Array;
  pHitLo: Int32Array;
  pHitHi: Int32Array;
  pRadius: Int32Array;
  /** On-hit effect (EFFECT_CODE) and its two numbers. */
  pEffect: Uint8Array;
  pEffA: Int32Array;
  pEffB: Int32Array;
  /** Damage share to minions (bp). */
  pBp: Int32Array;
  /** Skillshots: full range (mm); `pTtl` holds the distance left. */
  pRange: Int32Array;
  // Zones
  zAlive: Uint8Array;
  zTeam: Uint8Array;
  zKind: Uint8Array;
  zOwner: Int32Array;
  zX: Int32Array;
  zY: Int32Array;
  zRadius: Int32Array;
  zTtl: Int32Array;
  /** Ticks until the zone is armed. */
  zArm: Int32Array;
  /** Zone number (trap: root ticks; arena: the challenged hero; burst: slow ticks). */
  zVal: Int32Array;
  /** Sim v9, burst zones: damage and heal per pulse, slow strength, ticks between pulses (0: one pulse), ticks to the next pulse. */
  zDmg: Int32Array;
  zHeal: Int32Array;
  zSlowBp: Int32Array;
  zEvery: Int32Array;
  zNext: Int32Array;
  // Pickups (units/pickup.ts): alive, PICKUP_KIND, team allowed to take it (2 = anyone), position
  pkAlive: Uint8Array;
  pkKind: Uint8Array;
  pkTeam: Uint8Array;
  pkX: Int32Array;
  pkY: Int32Array;
  // Scalars
  globals: Int32Array;
  rng: Rng;
}

export const COOLDOWN_SLOTS = 5;
/** Talent tiers (levels 3, 6, 9). */
export const TALENT_TIERS = 3;
/** `seen` with both teams' bits set. */
export const SEEN_ALL = 3;

/** Forced-movement kinds (`fmKind`). */
export const FM = Object.freeze({
  None: 0,
  /** Ability dash: the kit's onDashTick runs every tick (hits along the path). */
  Dash: 1,
  /** Knockback: hard CC. */
  Knock: 2,
  /** Homing dash to `fmTarget` (Pack Hunt). */
  Hunt: 3,
} as const);

/** Is `id` in the 63-bit hit mask (lo, hi)? Entity ids are below 64. */
export const maskHas = (lo: number, hi: number, id: number): boolean => (id < 0x20 ? (lo >>> id) & 1 : (hi >>> (id - 0x20)) & 1) === 1;

/** `hurtTick` before any damage. */
export const NEVER = -0x100000;

/** Hero orders (`order`). */
export const Order = Object.freeze({
  None: 0,
  Move: 1,
  /** Chase and attack `target`. */
  Attack: 2,
  /** Walk to (moveX, moveY), attacking enemies met on the way. */
  AttackMove: 3,
} as const);

export function createWorld(seed: number): World {
  const n = ENTITY_CAP;
  const p = CAPS.projectiles;
  const z = CAPS.zones;
  const h = CAPS.heroes;
  const w: World = {
    kind: new Uint8Array(n),
    team: new Uint8Array(n),
    alive: new Uint8Array(n),
    sub: new Uint8Array(n),
    lane: new Uint8Array(n),
    waypoint: new Uint8Array(n),
    level: new Uint8Array(n),
    state: new Uint8Array(n),
    facing: new Uint16Array(n),
    buffs: new Uint32Array(n),
    x: new Int32Array(n),
    y: new Int32Array(n),
    hp: new Int32Array(n),
    maxHp: new Int32Array(n),
    shield: new Int32Array(n),
    armour: new Int32Array(n),
    xp: new Int32Array(n),
    moveCarry: new Int32Array(n),
    moveX: new Int32Array(n),
    moveY: new Int32Array(n),
    target: new Int32Array(n).fill(-1),
    attackTimer: new Int32Array(n),
    timer: new Int32Array(n),
    cooldowns: new Int32Array(CAPS.heroes * COOLDOWN_SLOTS),
    windup: new Int32Array(n),
    order: new Uint8Array(n),
    streak: new Int32Array(n),
    shotAt: new Int32Array(n).fill(-1),
    forced: new Uint8Array(n),
    lastHitBy: new Int32Array(n).fill(-1),
    hurtTick: new Int32Array(n).fill(NEVER),
    pathX: new Int32Array(CAPS.heroes * NAV.maxPathPoints),
    pathY: new Int32Array(CAPS.heroes * NAV.maxPathPoints),
    pathLen: new Uint8Array(CAPS.heroes),
    pathIdx: new Uint8Array(CAPS.heroes),
    stunT: new Int32Array(n),
    rootT: new Int32Array(n),
    fearT: new Int32Array(n),
    fearX: new Int32Array(n),
    fearY: new Int32Array(n),
    fearSrc: new Int32Array(n).fill(-1),
    slowT: new Int32Array(n),
    slowBp: new Int32Array(n),
    hasteT: new Int32Array(n),
    hasteBp: new Int32Array(n),
    asT: new Int32Array(n),
    asBp: new Int32Array(n),
    cdrT: new Int32Array(n),
    cdrBp: new Int32Array(n),
    stealthT: new Int32Array(n),
    untargT: new Int32Array(n),
    revealT: new Int32Array(n),
    shieldT: new Int32Array(n),
    healT: new Int32Array(n),
    healLeft: new Int32Array(n),
    fmT: new Int32Array(n),
    fmX: new Int32Array(n),
    fmY: new Int32Array(n),
    fmKind: new Uint8Array(n),
    fmTarget: new Int32Array(n).fill(-1),
    fmHitLo: new Int32Array(n),
    fmHitHi: new Int32Array(n),
    tether: new Int32Array(n).fill(-1),
    bush: new Int32Array(n).fill(-1),
    seen: new Uint8Array(n).fill(SEEN_ALL),
    castPhase: new Uint8Array(h),
    castSlot: new Uint8Array(h),
    castT: new Int32Array(h),
    castX: new Int32Array(h),
    castY: new Int32Array(h),
    castId: new Int32Array(h).fill(-1),
    napT: new Int32Array(h),
    trick: new Uint8Array(h),
    talents: new Int32Array(h * TALENT_TIERS).fill(-1),
    killStreak: new Int32Array(h),
    assistTick: new Int32Array(h * h).fill(NEVER),
    zoomT: new Int32Array(h),
    frenzyT: new Int32Array(h),
    nineT: new Int32Array(h),
    packT: new Int32Array(h),
    nineReady: new Int32Array(h),
    dmgRing: new Int32Array(h * NINE_LIVES.window),
    lockId: new Int32Array(n).fill(-1),
    lockT: new Int32Array(n),
    kValor: new Int32Array(h),
    kStage: new Int32Array(h),
    kWindow: new Int32Array(h),
    kRT: new Int32Array(h),
    kWT: new Int32Array(h),
    kWAge: new Int32Array(h),
    kCount: new Int32Array(h),
    kHonour: new Int32Array(h),
    kHuntT: new Int32Array(h),
    kHuntVictim: new Int32Array(h).fill(-1),
    kChain: new Int32Array(h),
    kFoe: new Int32Array(h).fill(-1),
    kEmpower: new Int32Array(h),
    kHurt: new Int32Array(h).fill(NEVER),
    volleyHits: new Uint8Array(h * n),
    wave: new Int32Array(n),
    botMode: new Uint8Array(h),
    botLane: new Uint8Array(h),
    botFoe: new Int32Array(h).fill(-1),
    botPud: new Int32Array(h).fill(-1),
    botSeen: new Int32Array(h * h).fill(-1),
    botOp: new Uint8Array(h),
    botX: new Int32Array(h),
    botY: new Int32Array(h),
    botId: new Int32Array(h).fill(-1),
    botSlip: new Int32Array(h).fill(-1),
    pAlive: new Uint8Array(p),
    pTeam: new Uint8Array(p),
    pKind: new Uint8Array(p),
    pOwner: new Int32Array(p).fill(-1),
    pTarget: new Int32Array(p).fill(-1),
    pX: new Int32Array(p),
    pY: new Int32Array(p),
    pVx: new Int32Array(p),
    pVy: new Int32Array(p),
    pTtl: new Int32Array(p),
    pDmg: new Int32Array(p),
    pSpeed: new Int32Array(p),
    pFlags: new Int32Array(p),
    pHitLo: new Int32Array(p),
    pHitHi: new Int32Array(p),
    pRadius: new Int32Array(p),
    pEffect: new Uint8Array(p),
    pEffA: new Int32Array(p),
    pEffB: new Int32Array(p),
    pBp: new Int32Array(p),
    pRange: new Int32Array(p),
    zAlive: new Uint8Array(z),
    zTeam: new Uint8Array(z),
    zKind: new Uint8Array(z),
    zOwner: new Int32Array(z).fill(-1),
    zX: new Int32Array(z),
    zY: new Int32Array(z),
    zRadius: new Int32Array(z),
    zTtl: new Int32Array(z),
    zArm: new Int32Array(z),
    zVal: new Int32Array(z).fill(-1),
    zDmg: new Int32Array(z),
    zHeal: new Int32Array(z),
    zSlowBp: new Int32Array(z),
    zEvery: new Int32Array(z),
    zNext: new Int32Array(z),
    pkAlive: new Uint8Array(CAPS.pickups),
    pkKind: new Uint8Array(CAPS.pickups),
    pkTeam: new Uint8Array(CAPS.pickups),
    pkX: new Int32Array(CAPS.pickups),
    pkY: new Int32Array(CAPS.pickups),
    globals: new Int32Array(G.Count),
    rng: new Rng(seed),
  };
  w.globals[G.Winner] = -1;
  w.globals[G.InputHash] = FNV_OFFSET | 0;
  w.globals[G.PudTeam] = TEAM_NEUTRAL;
  w.globals[G.ComebackAt0] = NEVER;
  w.globals[G.ComebackAt1] = NEVER;
  return w;
}

/** The arrays `hashWorld` covers, in a fixed order. Adding a field means adding it here (and bumping SIM_VERSION). */
export function hashedArrays(w: World): ArrayLike<number>[] {
  return [
    w.kind, w.team, w.alive, w.sub, w.lane, w.waypoint, w.level, w.state, w.facing, w.buffs,
    w.x, w.y, w.hp, w.maxHp, w.shield, w.armour, w.xp, w.moveCarry, w.moveX, w.moveY, w.target,
    w.attackTimer, w.timer, w.cooldowns,
    w.windup, w.order, w.streak, w.shotAt, w.forced, w.lastHitBy, w.hurtTick, w.pathX, w.pathY, w.pathLen, w.pathIdx,
    w.stunT, w.rootT, w.fearT, w.fearX, w.fearY, w.fearSrc, w.slowT, w.slowBp, w.hasteT, w.hasteBp, w.asT, w.asBp, w.cdrT, w.cdrBp,
    w.stealthT, w.untargT, w.revealT, w.shieldT, w.healT, w.healLeft, w.fmT, w.fmX, w.fmY, w.fmKind, w.fmTarget, w.fmHitLo, w.fmHitHi,
    w.tether, w.bush, w.seen,
    w.castPhase, w.castSlot, w.castT, w.castX, w.castY, w.castId, w.napT, w.trick, w.talents, w.killStreak, w.assistTick,
    w.zoomT, w.frenzyT, w.nineT, w.packT, w.nineReady, w.dmgRing, w.lockId, w.lockT,
    w.kValor, w.kStage, w.kWindow, w.kRT, w.kWT, w.kWAge, w.kCount, w.kHonour, w.kHuntT, w.kHuntVictim, w.kChain,
    w.kFoe, w.kEmpower, w.kHurt, w.volleyHits, w.wave,
    w.botMode, w.botLane, w.botFoe, w.botPud, w.botSeen, w.botOp, w.botX, w.botY, w.botId, w.botSlip,
    w.pAlive, w.pTeam, w.pKind, w.pOwner, w.pTarget, w.pX, w.pY, w.pVx, w.pVy, w.pTtl, w.pDmg,
    w.pSpeed, w.pFlags, w.pHitLo, w.pHitHi, w.pRadius, w.pEffect, w.pEffA, w.pEffB, w.pBp, w.pRange,
    w.zAlive, w.zTeam, w.zKind, w.zOwner, w.zX, w.zY, w.zRadius, w.zTtl, w.zArm, w.zVal,
    w.zDmg, w.zHeal, w.zSlowBp, w.zEvery, w.zNext,
    w.pkAlive, w.pkKind, w.pkTeam, w.pkX, w.pkY,
    w.globals,
  ];
}

/** FNV-1a over the whole world state, including the RNG state. */
export function hashWorld(w: World): number {
  let h = FNV_OFFSET;
  const arrays = hashedArrays(w);
  for (let i = 0; i < arrays.length; i++) h = fnvInts(h, arrays[i]);
  return fnvInt(h, w.rng.state);
}

/** Free projectile slot (lowest index) or −1. */
export function allocProjectile(w: World): number {
  for (let i = 0; i < w.pAlive.length; i++) if (w.pAlive[i] === 0) return i;
  return -1;
}

/** Free zone slot (lowest index) or −1. */
export function allocZone(w: World): number {
  for (let i = 0; i < w.zAlive.length; i++) if (w.zAlive[i] === 0) return i;
  return -1;
}

/** Free minion id (lowest) or −1. */
export function allocMinion(w: World): number {
  for (let i = RANGE.minions; i < RANGE.towers; i++) if (w.alive[i] === 0) return i;
  return -1;
}
