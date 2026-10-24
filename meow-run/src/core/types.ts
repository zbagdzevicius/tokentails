// Shared ids and data types. FROZEN (architect). Every lane reads these; none edits them.
// Track space: s = distance along the track centre line (u, 1 u ~ 1 m), x = lateral offset (+ = runner's right),
// y = height above the track surface. World space: three.js, y up.
import type * as THREE from 'three';
import type { PathBuilder } from './path';
import type { Track } from './track';

// ---------- ids ----------
export type StageId = 'meadow' | 'gorge' | 'sunset' | 'endless' | 'daily' | 'trail';
/** Every stage in menu order (the stage select map). */
export const STAGE_ORDER: readonly StageId[] = ['meadow', 'gorge', 'sunset', 'endless'];
/**
 * Iteration 2 (ITERATION2.md): stages that are not on the stage select map. 'daily' = a seeded endless run (the Daily
 * Run, or an endless challenge link), registered by the SHARE lane; 'trail' = a player-made course from the Trail
 * Maker, registered by the TRAILS lane. Both are endless-like for the save (no stars, no campaign unlocks).
 */
export const UGC_STAGES: readonly StageId[] = ['daily', 'trail'];
/** The campaign stages (stars, 7 bells each). */
export const CAMPAIGN: readonly StageId[] = ['meadow', 'gorge', 'sunset'];
export type ThemeId = 'meadow' | 'gorge' | 'sunset';

/** What the track surface is at a given s. Set by the stage script through PathBuilder. */
export type SegmentKind = 'ground' | 'bridge' | 'wall' | 'river' | 'cloud' | 'gap';
export const SEGMENT_KINDS: readonly SegmentKind[] = ['ground', 'bridge', 'wall', 'river', 'cloud', 'gap'];
/** Kinds with no floor: the player falls unless an arc or ride (vault, cloud) carries them. */
export const NO_FLOOR: ReadonlySet<SegmentKind> = new Set<SegmentKind>(['gap', 'cloud']);

/** Gameplay actions (keyboard, swipes, tap, bots). */
export type Action = 'jump' | 'slide' | 'ability' | 'pause';
export type Quality = 'low' | 'high';
export type QualityMode = 'auto' | Quality;

/** game.mode. 'finish' = crossed the line, the kitten runs out; 'over' = results time. */
export type Mode = 'title' | 'play' | 'paused' | 'finish' | 'over';
/** P.mode. 'arc' = authored parabola (tail vault), 'ride' = carried at a height (puff cloud, leaf surf if wanted). */
export type PlayerMode = 'run' | 'arc' | 'ride' | 'finish';

export const BELLS = 7;
export const MAX_HEARTS = 3;

// ---------- track ----------
export interface TrackFrame {
  s: number;
  pos: THREE.Vector3; // centre line, on the surface
  fwd: THREE.Vector3; // unit tangent (3D, follows slopes)
  right: THREE.Vector3; // unit, banked
  up: THREE.Vector3; // unit surface normal, banked
  width: number; // full path width (u)
  bank: number; // radians, + = right side lower
  kind: SegmentKind;
}

export interface Segment {
  kind: SegmentKind;
  s0: number;
  s1: number;
}

/** One PathBuilder.run() call. turn and bank in degrees. */
export interface RunOpts {
  /** total heading change over the run, degrees, + = turn right (constant curvature) */
  turn?: number;
  /** total height change over the run (u), eased in and out unless ease === false */
  rise?: number;
  ease?: boolean;
  /** full path width at the end of the run (eased from the current width) */
  width?: number;
  /** bank at the end of the run, degrees, + = right side lower (eased) */
  bank?: number;
  /** fraction of the run over which the bank eases in (default 1 = the whole run); wall-runs bank in fast */
  bankIn?: number;
  kind?: SegmentKind;
}

export interface StartPose {
  x: number;
  y: number;
  z: number;
  /** degrees; 0 = facing +z */
  heading: number;
  width?: number;
}

// ---------- stages and set pieces ----------
export type Rng = () => number;

/** One authored set piece placed on the track. Unknown types are skipped with a console.warn. */
export interface PieceSpec {
  type: string;
  /** where it starts (track s) */
  s: number;
  /** how far past s it reaches (despawn and respawn bookkeeping), default 0 */
  len?: number;
  x?: number;
  y?: number;
  /** override the type's checkpoint flag (a checkpoint is placed 12 u before s) */
  checkpoint?: boolean;
  params?: Record<string, number | string | boolean>;
}

export interface StageDef {
  id: StageId;
  index: number;
  name: string;
  blurb: string;
  theme: ThemeId;
  /** music track id the audio lane plays */
  music: string;
  speed: { start: number; max: number; rampDist: number };
  /** third star */
  scoreTarget: number;
  /** bells placed in this stage (7 in the campaign, 0 in endless) */
  bells: number;
  /** play Grandma's cottage cutscene after the finish */
  ending?: boolean;
  /** stage 1: meta-ui shows the tutorial prompts */
  tutorial?: boolean;
  start?: StartPose;
  /** Campaign: author the whole path and return the pieces. The finish line is b.s when it returns (core adds a run-out). */
  build?(b: PathBuilder, rng: Rng): PieceSpec[];
  /** Endless: append one chunk of path and return its pieces. Called while the track ahead is short. */
  chunk?(b: PathBuilder, rng: Rng, index: number): PieceSpec[];
}

export interface ColliderInit {
  shape?: 'box' | 'sphere'; // default box
  s: number;
  x?: number;
  /** box: bottom height; sphere: centre height */
  y?: number;
  /** box half extents along s and x, and full height */
  hs?: number;
  hx?: number;
  h?: number;
  /** sphere radius */
  r?: number;
  /** hurt = costs a heart; trigger = onTouch once per entry */
  kind: 'hurt' | 'trigger';
  label?: string;
  /** disable after the first touch (pickups) */
  once?: boolean;
  /** hurt colliders: count a near miss ("CLOSE ONE!") when passed within 0.5 u. Default true. Chasers set false. */
  near?: boolean;
  onTouch?(c: Collider): void;
}
export interface Collider extends Required<Omit<ColliderInit, 'onTouch'>> {
  enabled: boolean;
  onTouch?(c: Collider): void;
  /** internal bookkeeping (collision.ts) */
  _in: boolean;
  _hit: boolean;
  _passed: boolean;
  _min: number;
}

export interface PieceCtx {
  stage: StageDef;
  track: Track;
  spec: PieceSpec;
  /** added to the scene by core; removed (geometries disposed unless userData.shared) when the piece despawns */
  group: THREE.Group;
  quality: Quality;
  /** colliders added here are removed automatically on despawn */
  addCollider(c: ColliderInit): Collider;
  removeCollider(c: Collider): void;
}
export interface PieceInstance {
  /** track s after which the piece can be despawned (40 u behind the player) */
  end: number;
  /** fixed step (1/120 s) while the game runs */
  update?(dt: number, t: number): void;
  /** the player respawned at s (only pieces alive at that moment get this) */
  onRespawn?(s: number): void;
  dispose?(): void;
}
export interface SetPieceType {
  id: string;
  /** a checkpoint 12 u before every instance (big set pieces). Default false. */
  checkpoint?: boolean;
  create(ctx: PieceCtx): PieceInstance;
}

// ---------- themes (world-art) ----------
export interface ThemeCtx {
  scene: THREE.Scene;
  track: Track;
  stage: StageDef;
  quality: Quality;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}
export interface ThemeDef {
  id: ThemeId;
  /** stage load: sky, fog, lights, global meshes (sky dome, far mountains). Called again after a quality change. */
  enter(ctx: ThemeCtx): void;
  /** build the scenery for [s0, s1) (chunks are CHUNK_LEN long). Core adds it to the scene and removes it later. */
  buildChunk(ctx: ThemeCtx, s0: number, s1: number): THREE.Object3D | null;
  /** optional custom disposal; default: dispose every geometry without userData.shared */
  disposeChunk?(obj: THREE.Object3D): void;
  /** every rendered frame (dt = 0 while paused) */
  update?(dt: number, t: number, ctx: ThemeCtx): void;
  /** stage unload: remove what enter() added */
  exit?(ctx: ThemeCtx): void;
}

// ---------- actors (cat-audio) ----------
/** Placed by core every frame at the player transform (local +z forward, +y up, feet at 0). */
export interface KittenRig {
  root: THREE.Object3D;
  animate(dt: number, t: number, p: Readonly<PlayerView>): void;
  dispose?(): void;
}
export interface ActorState {
  speed: number;
  /** free-form: 'run', 'bark', 'sit', 'roll', 'idle' ... */
  action: string;
}
/** Other animated models (dog, puff cloud, leaf, grandma). Set pieces build them and drive animate(). */
export interface ActorRig {
  root: THREE.Object3D;
  animate(dt: number, t: number, st: ActorState): void;
  dispose?(): void;
}
export interface ActorDef {
  id: string;
  build(): ActorRig;
}

/** Read-only view of the player that rigs, camera, HUD and audio use. core/player.ts P implements it. */
export interface PlayerView {
  s: number;
  x: number;
  y: number;
  vy: number;
  speed: number;
  mode: PlayerMode;
  surface: SegmentKind;
  grounded: boolean;
  sliding: boolean;
  /** seconds since the last landing / jump / pounce / hit (large = long ago) */
  sinceLand: number;
  sinceJump: number;
  sincePounce: number;
  sinceHit: number;
  /** last landing speed (u/s, >= 0) */
  landImpact: number;
  airTime: number;
  /** -1..1 current lateral velocity normalised */
  lean: number;
  invuln: number;
  /** seconds of wet left (puddle) */
  wet: number;
  /** the active ability id ('vault', 'cloud', ...) or null; abilityT 0..1 progress */
  ability: string | null;
  abilityT: number;
  world: { pos: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; right: THREE.Vector3 };
}

// ---------- results ----------
export interface RunResult {
  stageId: StageId;
  finished: boolean;
  score: number;
  bells: boolean[];
  bellCount: number;
  bellsTotal: number;
  fish: number;
  distance: number;
  time: number;
  hits: number;
  respawns: number;
  hearts: number;
  maxMult: number;
  /** [finished, all bells, score >= target]; endless: all false */
  stars: [boolean, boolean, boolean];
}
