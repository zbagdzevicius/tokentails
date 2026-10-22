/**
 * Authored, sim-synced character animation (docs/ANIM-SPEC.md §3): the clip format, the move-set and skill-FX shapes a
 * hero file exports, and the contexts the director passes to them. Types only (plus the anchor table). Render only:
 * the one sim import is type-only.
 */
import type { HeroId } from '../../data/heroes/types';
import type { BoneName } from '../chars/skeleton';
import type { SimEvent } from '../../sim/api';

export type Ease = 'lin' | 'in' | 'out' | 'inOut' | 'back' | 'backBig' | 'expoIn' | 'expoOut' | 'elastic' | 'step' | 'hold';
export type Mask = 'full' | 'upper' | 'legs' | 'armR' | 'armL' | 'head' | 'tail';
export type RootChannel = 'fwd' | 'side' | 'up' | 'yaw' | 'pitch' | 'roll' | 'sx' | 'sy';
export type Slot = 'q' | 'w' | 'e' | 'r';

/** Root channels in their fixed order (the sampler and root.ts index them by this). */
export const ROOT_CHANNELS: readonly RootChannel[] = Object.freeze(['fwd', 'side', 'up', 'yaw', 'pitch', 'roll', 'sx', 'sy']);
export const SLOTS: readonly Slot[] = Object.freeze(['q', 'w', 'e', 'r']);

/** Priorities: higher interrupts lower; equal cross-fades. */
export const enum Prio {
  Idle = 1,
  Emote = 3,
  Basic = 4,
  Ability = 6,
  Ult = 7,
  HardCC = 8,
  Death = 9,
}

/** Euler delta in radians (x, y, z), applied on top of the key pose. */
export type BoneDelta = readonly [x: number, y: number, z: number];
/** [time s, pose name | null (= previous pose), bone deltas | null, ease into this key]. */
export type Key = readonly [t: number, pose: string | null, deltas: Partial<Record<BoneName, BoneDelta>> | null, ease?: Ease];
/** [time s, value, ease into this key]. Values: m (fwd/side/up), turns (yaw/pitch/roll), factor (sx/sy). */
export type ScalarKey = readonly [t: number, v: number, ease?: Ease];

/** Sim anchors a marker can bind to (§4). */
export type Anchor = 'windupStart' | 'cast' | 'contact' | 'release' | 'travelEnd' | 'homingEnd' | 'zoneArm' | 'pulse' | 'stateEnd' | 'swingStart';

/** Anchor ordinals: AnchorTimes is indexed by these. */
export const ANCHORS: readonly Anchor[] = Object.freeze(['windupStart', 'cast', 'contact', 'release', 'travelEnd', 'homingEnd', 'zoneArm', 'pulse', 'stateEnd', 'swingStart']);
export const ANCHOR_INDEX: Readonly<Record<Anchor, number>> = Object.freeze(Object.fromEntries(ANCHORS.map((a, i) => [a, i])) as Record<Anchor, number>);
/** Anchors whose segment is driven by progress (travelled distance, zone arm), not time (§4.2 rule 2). */
export const PROGRESS_ANCHORS: ReadonlySet<Anchor> = new Set<Anchor>(['travelEnd', 'homingEnd', 'zoneArm']);

export type CueKind =
  | 'trailOn'
  | 'trailOff'
  | 'ghost'
  | 'dust'
  | 'dustRing'
  | 'whoosh'
  | 'land'
  | 'footstep'
  | 'freeze'
  | 'shake'
  | 'punch'
  | 'smear'
  | 'earsBack'
  | 'mouthOpen'
  | 'blink'
  | 'fx'
  | 'sfx';
/** [marker name or time s, cue, arg]. arg: trail socket, fx id, sfx id, shake tier, freeze ms… */
export type Cue = readonly [at: string | number, kind: CueKind, arg?: string | number];

export interface ClipDef {
  /** 'clem.q3' */
  id: string;
  /** Nominal length, s. */
  len: number;
  /** 'upper' keeps the gait legs while moving. */
  mask: Mask;
  mode: 'override' | 'additive';
  prio: Prio;
  /** s, default 0.05 */
  blendIn?: number;
  /** s, default 0.12 */
  blendOut?: number;
  keys: readonly Key[];
  root?: Partial<Record<RootChannel, readonly ScalarKey[]>>;
  /** Named times (s, nominal). Every attack/ability clip MUST have `contact`. */
  markers: Readonly<Record<string, number>> & { contact?: number };
  /** Marker → anchor pairs; consecutive pairs define warp segments (§4.2). */
  warp: readonly (readonly [marker: string, anchor: Anchor])[];
  cues?: readonly Cue[];
  /** Reduce-motion scale per root channel (default: yaw/pitch/roll beyond ±0.25 turn → 0, up × 0.5). */
  calm?: Partial<Record<RootChannel, number>>;
  /** feet.ts pins the stance. */
  lockFeet?: boolean;
  cancel?: 'any' | 'afterContact' | 'none';
}

export type GaitVariant = 'sneak' | 'trudge' | 'gallop' | 'charm' | 'cower' | 'haste';

export interface GaitProfile {
  stride: number;
  bounce: number;
  lean: number;
  hipSway: number;
  headBob: number;
  arms: 'pump' | 'trail' | 'hold' | 'flap' | 'out';
  variants: Partial<Record<GaitVariant, Partial<GaitProfile>>>;
}

export interface SpringTuning {
  tail: { k: number; c: number; lag: number };
  ears: { k: number; c: number; lag: number };
  /** phase 2 */
  props?: { k: number; c: number; lag: number };
}

/** Context the director passes when choosing a clip. Read-only views of the snapshot; no allocation. */
export interface MoveCtx {
  hero: HeroId;
  id: number;
  branch: boolean;
  talents: readonly string[];
  /** 0-based */
  comboIndex: number;
  recastIndex: number;
  /** Own confirmed basics (for everyNth). */
  basicCount: number;
  charged: boolean;
  resource: number;
  buffs: number;
  stealthed: boolean;
  /** e.g. Golden Hour running */
  ultActive: boolean;
  /** Render-side derivations for passives. */
  targetBehind: boolean;
  targetCc: boolean;
  /** Cast picks only: metres from the hero to the cast's aim point (a dash shorter than its max), NaN when unknown. */
  aimDist?: number;
}

export interface SlotMoves {
  /** default cast clip */
  cast: ClipDef;
  /** Clem Q2/Q3, Cacklejaw Q2, Avietė E return */
  recasts?: readonly ClipDef[];
  /** level-6 shape branch (Sage lance, Brutus post) */
  branch?: ClipDef;
  /** looping/sustained layer while a state lasts */
  hold?: ClipDef;
  /** plays on stateEnd */
  end?: ClipDef;
  /** The level-6 branch's own hold / end (Brutus's Guard Post kneel); with `branch` set and these absent, none plays. */
  branchHold?: ClipDef;
  branchEnd?: ClipDef;
  /**
   * BuffFlag bit whose falling edge is the state's end (Cacklejaw's Stealth: brush extends it, an attack breaks it),
   * instead of cast + duration. The hold plays while the bit is set; the end clip plays on the edge.
   */
  endOnBuff?: number;
  /** own ability-hit follow-up (Brutus E impact, Cacklejaw R maul) */
  onHit?: ClipDef;
  /** optional override; must not allocate */
  pick?: (ctx: MoveCtx) => ClipDef | null;
}

export interface MoveSet {
  hero: HeroId;
  /** true: director falls back to legacy swing()/cast() */
  stub: boolean;
  gait: GaitProfile;
  springs: SpringTuning;
  /** combo cycle A, B, C… */
  basic: readonly ClipDef[];
  /** empowered/nth/charged replacements */
  basicPick?: (ctx: MoveCtx) => ClipDef | null;
  slots: Readonly<Record<Slot, SlotMoves>>;
  idle: ClipDef;
  fidgets: readonly (readonly [ClipDef, number])[];
  victory: ClipDef;
  emote: ClipDef;
  death: ClipDef;
  respawn?: ClipDef;
  levelUp?: ClipDef;
}

export interface V3Out {
  x: number;
  y: number;
  z: number;
}

/** Mesh FX kinds (fxkit/meshFx.ts). */
export type MeshFxKind = 'crescent' | 'arc' | 'ring' | 'dome' | 'wall' | 'beam' | 'pillar' | 'twister' | 'curtain' | 'heart' | 'chain' | 'meteor' | 'glow';
export type LingerGlyph = 'crackStar' | 'crackLine' | 'scorch' | 'scratches' | 'crater' | 'petals';
export type Relation3 = 'own' | 'ally' | 'enemy';

/** fxkit/meshFx.ts MeshFx (the parts a hero FX script uses). */
export interface MeshFxLike {
  /** Returns the instance index, or -1 when the tier's pool is full (never throws). */
  spawn(kind: MeshFxKind, o: MeshFxSpawn): number;
}
export interface MeshFxSpawn {
  x: number;
  y?: number;
  z: number;
  yaw?: number;
  /** Size (m): ground kinds use sx = radius / length, sz = width; vertical kinds sy = height. */
  sx: number;
  sy?: number;
  sz?: number;
  life: number;
  color: number;
  rim: number;
  /** Kind-specific: arc (rad), inner radius share, sweep side, intensity. */
  p0?: number;
  p1?: number;
  p2?: number;
  p3?: number;
  /** Enemy damage effects are never dimmed by the coverage budget (§9 rule 4). */
  rel: Relation3;
  delay?: number;
}
/** anim/trails.ts Ribbons. */
export interface RibbonsLike {
  /** A trail from a world-point source; returns the slot or -1. */
  point(src: { x: number; y: number; z: number }, color: number, width: number, life?: number): number;
  feed(slot: number, x: number, y: number, z: number): void;
  end(slot: number): void;
}
/** fxkit/linger.ts Linger. */
export interface LingerLike {
  add(glyph: LingerGlyph, x: number, z: number, size: number, yaw: number, color: number): void;
}
export interface CombatVfxLike {
  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void;
  debris(x: number, z: number, k: number): void;
}
export interface ShockwavesLike {
  start(pos: { x: number; y: number; z: number }, o: Record<string, unknown>): unknown;
}
export interface FightCamLike {
  /** Shake tier T0..T4 (§8): only the strongest tier per 100 ms counts. */
  tier(t: 0 | 1 | 2 | 3 | 4): void;
  /** Own camera punch (zoom −k over 100 ms, back over 400 ms). */
  punch(k: number): void;
}
export interface JuiceLike {
  kick(trauma: number): void;
}
export interface SfxLike {
  cue(name: string, at?: { x: number; z: number }, vol?: number): void;
}

/** What a hero's skill FX script may use. Everything is pooled; methods never allocate. */
export interface FxCtx {
  readonly tier: 'low' | 'med' | 'high';
  readonly reduced: boolean;
  readonly mesh: MeshFxLike;
  readonly ribbons: RibbonsLike;
  readonly linger: LingerLike;
  readonly particles: CombatVfxLike;
  readonly shock: ShockwavesLike;
  readonly cam: FightCamLike;
  readonly juice: JuiceLike;
  readonly sfx: SfxLike;
  relation(id: number): Relation3;
  /** relation rim colour (gold / blue / RELATION.danger) */
  rim(id: number): number;
  /** Talent- and branch-resolved ability numbers (range, arc, radius, dash, windup, durations). */
  abil(id: number, slot: Slot): Readonly<Record<string, number>>;
  heroPos(id: number, out: V3Out): boolean;
  bonePos(id: number, bone: BoneName | 'weaponTip', out: V3Out): boolean;
  /** A hero's drawn facing as a unit ground vector (out.x, out.z; out.y = 0). False when not drawn. Optional (stubs). */
  facing?(id: number, out: V3Out): boolean;
  /** A projectile's drawn (interpolated) position by pool index (onProjectile's `index`). False once it is gone. */
  projPos?(index: number, out: V3Out): boolean;
  /** A hero's status in the frame's snapshot (BuffFlag bits, shield hp); false when unknown. Optional (test stubs). */
  status?(id: number, out: HeroStatus): boolean;
}

/** FxCtx.status output (preallocate one; never allocated per call). */
export interface HeroStatus {
  buffs: number;
  shield: number;
  /** Current and max HP (hp share = hp / maxHp); 0 when unknown. */
  hp?: number;
  maxHp?: number;
}

export interface SkillFxSet {
  hero: HeroId;
  /** true: effects.ts generic shape switch draws instead */
  stub: boolean;
  owns: Readonly<Record<Slot | 'basic' | 'passive', boolean>>;
  onWindup?(e: Extract<SimEvent, { type: 'windup' }>, fx: FxCtx): void;
  onCast?(e: Extract<SimEvent, { type: 'cast' }>, fx: FxCtx, ctx: MoveCtx): void;
  onHit?(e: Extract<SimEvent, { type: 'hit' }>, fx: FxCtx, ctx: MoveCtx): void;
  onMarker?(id: number, clipId: string, marker: string, fx: FxCtx): void;
  /** new owned projectile seen; `index` is its pool index for FxCtx.projPos (follow it for a trail) */
  onProjectile?(owner: number, kind: number, slot: number, fx: FxCtx, index?: number): void;
  /**
   * Status edges on any hero (render-side: the sim sends no stun / slow / charm event): BuffFlag bits gained and lost
   * since the last snapshot. Called for every loaded hero's FX set; a set filters by its own recent casts.
   */
  onStatus?(id: number, gained: number, lost: number, fx: FxCtx): void;
  onZone?(zoneIndex: number, phase: 'spawn' | 'arm' | 'pulse' | 'end', fx: FxCtx): void;
  /** sustained effects (tethers, curtains, wires) */
  update?(dt: number, fx: FxCtx): void;
}

export type ReactKind = 'light' | 'heavy' | 'knock' | 'pull' | 'stun' | 'root' | 'charm' | 'fear' | 'slow';
export type GaitName = 'run' | GaitVariant;

/** Preallocated per player: render-time seconds for each anchor, NaN = unknown. Indexed by ANCHOR_INDEX. */
export type AnchorTimes = Float64Array;

export interface PlayOpts {
  anchors: AnchorTimes;
  rate?: number;
  mirror?: boolean;
  /** Extra yaw (rad) on the mover while the clip plays (face the aim while the sim facing differs). */
  dir?: number;
  /** Loop the clip until stop() (SlotMoves.hold). */
  loop?: boolean;
  /** Post-contact rate for basics (§4.2 rule 5). */
  post?: number;
}

/** Character-side API (Character.anim.stack, implemented by LayerStack). */
export interface AnimHandle {
  /** false if refused by prio */
  play(clip: ClipDef, o: PlayOpts): boolean;
  stop(clipId: string, blendOut?: number): void;
  react(kind: ReactKind, dirX: number, dirZ: number, ticks?: number): void;
  /** local hit-stop with debt (§6) */
  freeze(ms: number): void;
  setGait(variant: GaitName): void;
  onMarker: (heroId: number, clipId: string, marker: string) => void;
}

export const newAnchors = (): AnchorTimes => new Float64Array(ANCHORS.length).fill(NaN);
