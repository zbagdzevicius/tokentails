/**
 * Catnip Heist: THE CONTRACT.
 *
 * Every package directory (sim, render, ui, audio, yard, app) codes against this file. Change it only
 * additively (new optional fields, new union members) unless every consumer is updated in the same
 * change.
 *
 * Coordinate conventions (used by sim, level files and renderer alike):
 * - The level is a grid of tiles. Tile (0,0) is the top-left character of `LevelDef.tiles`.
 *   +x goes right (east, along a string), +y goes down (south, to the next string).
 * - Sim positions are integers in SUB-TILE units: 1 tile = SUBTILE (16) units. An entity at
 *   `pos = {x: 16*tx + 8, y: 16*ty + 8}` stands in the centre of tile (tx, ty).
 *   `tileOf(pos) = { x: pos.x >> 4, y: pos.y >> 4 }` (for non-negative positions).
 * - Renderer mapping (suggested, render owns it): world X = pos.x / SUBTILE, world Z = pos.y / SUBTILE,
 *   world Y is up. One tile = one world unit.
 * - "Facing" is an integer direction vector with components in {-1, 0, 1}, never both 0.
 *
 * Determinism rules for the sim: integer maths only, no Math.random / sin / cos / atan2 / sqrt on
 * floats, no Date.now, no iteration over object keys whose order could differ. RNG is the seeded
 * integer generator whose state lives in SimState.rng.
 */

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** Sub-tile units per tile. */
export const SUBTILE = 16;
/** Fixed simulation rate. */
export const TICK_HZ = 30;
/** Pixel size of one sprite frame (square) in every sheet. */
export const FRAME_PX = 48;
/** Bump when sim rules change in a way that changes hashes for the same inputs. */
export const SIM_VERSION = 3;

/** Row order of every cat spritesheet (cat-assets/cats/<breed>.png). Sprites face RIGHT. */
export const CAT_ROWS = [
  'SLEEP',
  'DIGGING',
  'GROOMING',
  'HIT',
  'IDLE',
  'JUMPING',
  'LOAF',
  'RUNNING',
  'SITTING',
  'WALKING',
] as const;
export type CatAnim = (typeof CAT_ROWS)[number];

/** Row order of every dog (guard) spritesheet. Sprites face RIGHT. */
export const DOG_ROWS = [
  'CROUCHED',
  'DAMAGE',
  'DEAD',
  'JUMPING',
  'LYING',
  'RUNNING',
  'SITTING',
  'SNIFFING',
  'WALKING',
] as const;
export type DogAnim = (typeof DOG_ROWS)[number];

/** Brand palette (hex strings), shared by UI, renderer and yard. */
export const PALETTE = {
  night: '#0d0616',
  plum: '#301934',
  violet: '#4B0082',
  grape: '#6F2DA8',
  lavender: '#9966CC',
  coin: '#FFC93C',
  cream: '#FCECBB',
  ember: '#C1260F',
  rust: '#EE642A',
  pink: '#FF7AA2',
  mint: '#D5F4E5',
  sky: '#C4E2FC',
  lilac: '#F0C5FD',
  outline: '#2a0f1f',
} as const;

// ---------------------------------------------------------------------------------------------
// Primitives and input
// ---------------------------------------------------------------------------------------------

/** Integer 2D vector. In the sim it is either a tile coordinate or a sub-tile position (documented per field). */
export interface Vec2i {
  x: number;
  y: number;
}

export type Axis = -1 | 0 | 1;

/**
 * Input for one tick. Movement is held state; `swap`, `interact` and `meow` are EDGE-TRIGGERED:
 * true only on the tick the button went down (the input layer is responsible for edge detection).
 */
export interface Input {
  dx: Axis;
  dy: Axis;
  swap: boolean;
  interact: boolean;
  meow: boolean;
}

export const NO_INPUT: Readonly<Input> = Object.freeze({ dx: 0, dy: 0, swap: false, interact: false, meow: false });

// ---------------------------------------------------------------------------------------------
// Level definition (static data, authored in src/levels)
// ---------------------------------------------------------------------------------------------

/**
 * ASCII tile legend for `LevelDef.tiles`. Only terrain lives in the ASCII; every interactive thing
 * lives in the entity lists so it can carry ids and links.
 * - '#' wall: blocks movement and line of sight. Rendered as a chunky block.
 * - '.' floor.
 * - ' ' void / outside: treated as wall by the sim, rendered as nothing.
 * - 'b' box / shelf: blocks movement AND line of sight (cover), rendered as a low crate stack.
 * - 'r' rug / shadow floor: walkable, cosmetic only.
 * Door, plate, coin, key, crate, exit and checkpoint tiles must be floor ('.' or 'r') in the ASCII.
 */
export type TileChar = '#' | '.' | ' ' | 'b' | 'r';
export const TILE_WALL = '#';
export const TILE_FLOOR = '.';
export const TILE_VOID = ' ';
export const TILE_BOX = 'b';
export const TILE_RUG = 'r';

/** Door kinds: PLATE doors are open while any linked plate is pressed; VAULT doors open once with the key. */
export type DoorKind = 'PLATE' | 'VAULT';

export interface DoorDef {
  id: string;
  /** Tile coordinate. A closed door blocks movement and line of sight. */
  tile: Vec2i;
  kind: DoorKind;
  /** Orientation for rendering only: 'h' spans along x, 'v' spans along y. */
  axis?: 'h' | 'v';
}

export interface PlateDef {
  id: string;
  tile: Vec2i;
  /** Ids of PLATE doors this plate holds open while a cat stands on it. */
  doors: string[];
}

export interface CoinDef {
  id: string;
  tile: Vec2i;
}

export interface KeyDef {
  id: string;
  tile: Vec2i;
}

export interface CrateDef {
  id: string;
  /** The crate tile blocks movement. Rescue = interact while the cat's centre tile is within 1 tile (Chebyshev). */
  tile: Vec2i;
  /** Breed id of the shelter cat inside (an id from AssetManifest.cats). */
  catId: string;
  /** Display name, e.g. "Mochi". Shown on the Results screen ("You rescued Mochi"). */
  catName: string;
}

export interface ExitDef {
  id: string;
  /** Portal tiles. Win when BOTH cats stand on exit tiles and the rescue is done. */
  tiles: Vec2i[];
}

export interface CheckpointDef {
  id: string;
  /** Tile coordinate. A cat that steps on it makes it that cat's respawn point. */
  tile: Vec2i;
}

export interface GuardDef {
  id: string;
  /** Dog sheet id from AssetManifest.dogs (e.g. 'base', 'black', 'brown'). */
  sprite: string;
  /** Patrol loop of tile coordinates. The guard spawns on waypoints[0] and walks them in order, looping. */
  waypoints: Vec2i[];
  /** Movement speed in sub-tile units per tick (e.g. 1 = ~1.9 tiles/s). */
  speed: number;
  /** Ticks spent in SNIFF at each waypoint (0 = no pause). */
  sniffTicks: number;
  /** Vision radius in tiles. */
  visionTiles: number;
  /** Initial facing. Defaults to the direction of the first patrol leg. */
  facing?: Vec2i;
  /**
   * Sentry turn schedule (only with a single waypoint). While the guard stands at its post in
   * PATROL mode it faces `turns[k].facing`, where k follows the global tick clock: the schedule
   * repeats every sum(turns[].ticks) ticks and step k lasts turns[k].ticks ticks. Pure function
   * of SimState.tick, so it needs no extra state and stays deterministic.
   */
  turns?: SentryTurn[];
}

/** One step of a sentry's turn schedule. */
export interface SentryTurn {
  /** Facing (components -1|0|1, not both 0). */
  facing: Vec2i;
  /** Ticks this facing is held (> 0). */
  ticks: number;
}

/** A rectangular zone with text shown by the HUD when the active cat is inside (tutorial hints). */
export interface HintZone {
  /** Inclusive tile rect. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /**
   * Hint text. Control tokens are replaced at render time for the current device:
   * {move} {swap} {meow} {act} (e.g. "WASD / arrows" on keyboard, "the joystick" on touch).
   */
  text: string;
  /**
   * Optional condition: only show while this plate id is pressed and the active cat is not the
   * one standing on it (i.e. the other cat is holding the door open for you).
   */
  whileOtherHolds?: string;
  /** Optional condition: only show while the objective index (see sim/hud objectiveIndex) is <= this. */
  untilObjective?: number;
}

export interface LevelMeta {
  title: string;
  /** Par time in ticks (TICK_HZ ticks per second). */
  parTicks: number;
  /** Meow hearing radius in tiles. */
  meowRadiusTiles: number;
  /** Ticks a guard spends investigating a meow tile before returning to patrol. */
  investigateTicks: number;
  /** Ordered objective lines for the HUD, e.g. ["Find the key", "Free the shelter cat", "Both cats to the exit"]. */
  objectives?: string[];
  hints?: HintZone[];
  /** Tile rect of the tutorial room, for camera framing and hint logic. */
  tutorial?: { x0: number; y0: number; x1: number; y1: number };
  /** Campaign: short level name for the level select card (e.g. "Loading Dock"). */
  name?: string;
  /** Campaign: one-line intro shown on the level select and loading screen. */
  intro?: string;
  /** Campaign: the idea this level teaches (for docs and the level select detail). */
  idea?: string;
  /** Campaign: upper bound on coins.length (checked by the level tests). */
  maxCoins?: number;
  /** Campaign: the design needs both cats; the solver must prove a lone cat cannot finish. */
  twoCatRequired?: boolean;
}

export interface LevelDef {
  id: string;
  /** Rows of ASCII terrain, all the same length. See TileChar. */
  tiles: string[];
  /** Spawn tiles of cat 0 and cat 1. Their initial checkpoints are these tiles. */
  catSpawns: [Vec2i, Vec2i];
  guards: GuardDef[];
  coins: CoinDef[];
  key: KeyDef | null;
  doors: DoorDef[];
  plates: PlateDef[];
  crate: CrateDef;
  exit: ExitDef;
  checkpoints: CheckpointDef[];
  meta: LevelMeta;
}

// ---------------------------------------------------------------------------------------------
// Simulation state (dynamic, produced by SimAPI; treat as immutable)
// ---------------------------------------------------------------------------------------------

/** Animation hint the renderer maps to sprite rows. The sim sets it; it carries no rules. */
export type CatPose = 'IDLE' | 'WALK' | 'SIT' | 'MEOW' | 'HIT' | 'SLEEP';

export interface CatState {
  /** Breed id (AssetManifest.cats[].id). */
  id: string;
  /** Position in sub-tile units (centre of the cat). Continuous: need not be a tile centre. */
  pos: Vec2i;
  /** Last input direction (components -1|0|1). */
  facing: Vec2i;
  /** Last non-zero horizontal facing: +1 right, -1 left. Renderer flips the sprite with this. */
  faceX: 1 | -1;
  /** True if the cat moved this tick. */
  moving: boolean;
  /**
   * Displacement applied this tick in sub-tile units (pos - previous pos; {0,0} when still or
   * after a respawn). The renderer may extrapolate with it. Always set by the sim (optional only
   * for hand-built states).
   */
  vel?: Vec2i;
  /** Respawn tile (tile coordinate). */
  checkpoint: Vec2i;
  /** Ticks remaining of the "caught" flash / respawn lock (0 = free). Input is ignored while > 0. */
  stunTicks: number;
  pose: CatPose;
}

export type GuardMode = 'PATROL' | 'SNIFF' | 'INVESTIGATE' | 'ALERT';

export interface GuardState {
  id: string;
  /** Dog sheet id. */
  sprite: string;
  /** Position in sub-tile units. */
  pos: Vec2i;
  /** Facing direction (components -1|0|1). Vision cone is centred on it. */
  facing: Vec2i;
  /** Last non-zero horizontal facing, for sprite flipping. */
  faceX: 1 | -1;
  mode: GuardMode;
  /** Ticks spent in the current mode. */
  modeTicks: number;
  /** Index into GuardDef.waypoints of the waypoint currently walked towards. */
  waypointIndex: number;
  /** Tile being investigated (INVESTIGATE) or the spotted cat's tile (ALERT); null otherwise. */
  target: Vec2i | null;
  /** Vision radius in tiles (copied from the def; may be modified by rules). */
  visionTiles: number;
  /**
   * Vision cone: 90 degrees total (half-angle 45 degrees). A point P is inside when, with
   * d = P - guard and f = facing (both integer), dot(d,f) > 0 and |cross(d,f)| <= dot(d,f)
   * (this works unchanged for diagonal facings, both sides scale by |f|), and
   * |d|^2 <= (visionTiles*SUBTILE)^2, and integer line of sight is clear of walls/closed doors/boxes.
   */
  /** True if the guard moved this tick. */
  moving: boolean;
}

export interface CoinState {
  id: string;
  tile: Vec2i;
  taken: boolean;
}

export type SimEventType =
  | 'COIN'
  | 'KEY'
  | 'SPOTTED'
  | 'DOOR'
  | 'PLATE'
  | 'SWAP'
  | 'MEOW'
  | 'INVESTIGATE'
  | 'CHECKPOINT'
  | 'RESCUE'
  | 'WIN'
  | 'STEP';

/** Something that happened during the tick that produced this state. For audio, VFX and HUD. */
export interface SimEvent {
  type: SimEventType;
  /** Cat index (0|1) involved, if any. */
  cat?: number;
  /** Entity id involved (coin id, door id, guard id, plate id, checkpoint id...). */
  id?: string;
  /** Tile where it happened. */
  tile?: Vec2i;
  /** For DOOR / PLATE: the new state. */
  open?: boolean;
}

export interface SimState {
  /** Level id this state belongs to. */
  levelId: string;
  /** Number of ticks simulated so far (0 after init). */
  tick: number;
  /** Seeded integer RNG state (uint32). */
  rng: number;
  cats: [CatState, CatState];
  /** Index of the player-controlled cat. */
  activeIndex: 0 | 1;
  guards: GuardState[];
  /** Same order as LevelDef.coins. */
  coins: CoinState[];
  coinsCollected: number;
  /** Key picked up and not yet used. */
  hasKey: boolean;
  /** Key removed from the floor (picked up at some point). */
  keyTaken: boolean;
  /** Open flags, same order as LevelDef.doors. */
  doorsOpen: boolean[];
  /** Pressed flags, same order as LevelDef.plates. */
  platesDown: boolean[];
  rescued: boolean;
  won: boolean;
  /**
   * Legacy (SIM_VERSION <= 2 buffered interact until a tile centre). Interact now resolves on the
   * tick it is pressed, so the sim always sets this to false. Kept for compatibility.
   */
  pendingInteract: boolean;
  spottedCount: number;
  /** coins*10 + (rescued ? 50 : 0) - floor(tick / TICK_HZ / 10), clamped to >= 0. */
  score: number;
  /** FNV-1a 32-bit hash over the integer state after this tick (uint32). */
  hash: number;
  /** Events produced by the tick that created this state (empty after init). */
  events: SimEvent[];
}

/**
 * Pure simulation. `step` must NOT mutate `state`; it returns a new object (structural sharing
 * is fine for untouched parts). Same (level, seed, catIds, inputs) => same hashes in every JS engine.
 */
export interface SimAPI {
  init(level: LevelDef, seed: number, catIds: [string, string]): SimState;
  step(state: SimState, input: Input): SimState;
  hash(state: SimState): number;
}

// ---------------------------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------------------------

export interface RendererAPI {
  /** Create the WebGL canvas inside `el` and start listening for resizes. */
  mount(el: HTMLElement): void;
  /** Build the static level geometry (walls, floor, props). */
  setLevel(level: LevelDef): void;
  /**
   * Draw one frame. `prev` and `cur` are consecutive sim states; `alpha` in [0,1] is how far the
   * render time is between them (for interpolation). Both states are read-only. `throttled` marks a
   * deliberately slowed redraw (the paused scene at ~10 fps): it is drawn but not timed, so it never
   * reads as a slow GPU to the automatic quality tier.
   */
  update(prev: SimState, cur: SimState, alpha: number, throttled?: boolean): void;
  /** Breed ids of the two playable cats (loads/voxelizes their sheets). */
  setCats(ids: string[]): void;
  dispose(): void;
  /** Optional: resolves when assets for the current level and cats are ready. */
  ready?(): Promise<void>;
  /** Optional: stats for budget checks (draw calls, triangles). */
  stats?(): { calls: number; triangles: number };
}

// ---------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------

/** Inclusive pixel bounds inside a 48x48 tile. */
export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SheetRow {
  name: string;
  /** Number of frames detected in this row (contiguous from column 0). */
  frames: number;
  /** Union bounds of opaque pixels over this row's frames. */
  bounds: PixelBounds;
}

export interface SheetEntry {
  id: string;
  /** Display name. */
  name: string;
  /** Path relative to the assets base (e.g. 'cats/bob.png'). */
  sheet: string;
  /** Tile columns in the sheet. */
  cols: number;
  /** Rows in CAT_ROWS / DOG_ROWS order. */
  rows: SheetRow[];
}

export interface AssetManifest {
  version: number;
  /** Frame size in pixels (48). */
  frame: number;
  cats: SheetEntry[];
  dogs: SheetEntry[];
  /** Paths relative to the assets base. All PNG. */
  images: { coin: string; catnip: string; heart: string; paw: string; logo: string };
  /** Optional element icons, id -> path. */
  icons?: Record<string, string>;
  /** Brand font ("Cat Paw"), woff2 path. */
  font?: string;
}

/** Build-time env (Vite's import.meta.env); empty outside Vite (tools, node). */
type BuildEnv = { BASE_URL?: string; HEIST_PAYOUTS_URL?: string; HEIST_DEPLOYMENTS_URL?: string; HEIST_GIVE_URL?: string };
const BUILD_ENV: BuildEnv = (import.meta as { env?: BuildEnv }).env ?? {};

/** Vite's deploy base ('./' by default, or HEIST_BASE at build time). */
const DEPLOY_BASE: string = BUILD_ENV.BASE_URL ?? './';

/**
 * Base URL of the imported assets. Relative for the default build so it works under any directory
 * URL; absolute (e.g. /tokentails/heist/assets/) when built with an absolute HEIST_BASE.
 */
export const ASSET_BASE = DEPLOY_BASE === './' || DEPLOY_BASE === '/' ? 'assets/' : `${DEPLOY_BASE}assets/`;

/**
 * Public shelter payouts page linked from the win screen. Override at build time with
 * HEIST_PAYOUTS_URL=<url>; set it to an empty string to hide the link.
 */
export const PAYOUTS_URL: string = BUILD_ENV.HEIST_PAYOUTS_URL ?? 'https://tokentails.com/shelter-payouts';

/**
 * Give page behind the win screen's "Send Pink Paw a rescue treat" button (opened with
 * ?from=heist&cat=<rescued cat>). Same-origin relative by default, so it works under
 * tokentails.com/heist. Override with HEIST_GIVE_URL=<url>; an empty string hides the button.
 */
export const GIVE_URL: string = BUILD_ENV.HEIST_GIVE_URL ?? '/shelter-payouts/give';

/**
 * ShelterSplit deployment list the win screen reads for its "sent to shelters" total. Bundled at
 * public/payouts/deployments.json (written by `fund a:ingest`), so it works on any host without
 * CORS. Override with HEIST_DEPLOYMENTS_URL=<url>; an empty string turns the total off.
 */
export const DEPLOYMENTS_URL: string = BUILD_ENV.HEIST_DEPLOYMENTS_URL ?? `${DEPLOY_BASE}payouts/deployments.json`;

// ---------------------------------------------------------------------------------------------
// Audio (implemented in src/audio)
// ---------------------------------------------------------------------------------------------

export type SfxName = 'step' | 'coin' | 'meow' | 'alarm' | 'door' | 'win' | 'key' | 'swap' | 'rescue' | 'click';

export interface AudioAPI {
  /** Must be called from a user gesture before sounds play (browser autoplay rules). */
  unlock(): void;
  play(sfx: SfxName): void;
  startMusic(): void;
  stopMusic(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

// ---------------------------------------------------------------------------------------------
// Results / QA
// ---------------------------------------------------------------------------------------------

export interface RunResult {
  levelId: string;
  catIds: [string, string];
  seed: number;
  ticks: number;
  coins: number;
  rescued: boolean;
  rescuedName: string;
  spottedCount: number;
  score: number;
  /** Final state hash (replay fingerprint), uint32. */
  hash: number;
}

/** Non-production QA hooks exposed on window.__heist by the app layer. */
export interface QAHooks {
  getState(): SimState | null;
  step(n: number, input?: Partial<Input>): SimState | null;
  renderGameToText(): string;
}
