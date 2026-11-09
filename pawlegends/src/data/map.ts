/**
 * Purrhaven Crossing, POC subset (POC.md §5). Integer mm, origin bottom-left, x 0..100 m, y 0..60 m.
 * Mirrored left-right across x = 50 m: a Woof object at (x, y) is the Purrhaven one at (MAP.width − x, y).
 * Only the Purrhaven (team 0) side is authored here; `mirrorX` gives the Woof side.
 */

const C_MAP = Object.freeze({
  width: 100000,
  height: 60000,
  /** River band x 46..54 m. */
  riverX: Object.freeze([46000, 54000]) as readonly [number, number],
  /** Gate barrier line, up until TIMELINE.barrierDrop (0:03 in sim v4). */
  barrierX: 8000,
  /** Nav grid: 1 m cells, 100 × 60. */
  navCell: 1000,
  laneWidth: 8000,
  /** Sim v18: 0 = mirrored left to right (x only); 1 = 180° point reflection (x and y). */
  point: 0 as 0 | 1,
  /** Sim v18, point maps: the gate barrier is the diagonal x + y = barrierSum (team 0's side). 0 on Crossing. */
  barrierSum: 0,
});

/** Entity caps (§4.1). Entity ids are slot indices; iteration is always ascending. */
const C_CAPS = Object.freeze({
  heroes: 6,
  minions: 40,
  towers: 8,
  cores: 2,
  fountains: 2,
  campMonsters: 4,
  pudding: 1,
  projectiles: 48,
  zones: 24,
  /** Pickups on the map at once (Frenzy Catnip, Fish Snack; data/pickups.ts). A table of their own, outside the
   *  entity ids (the 63-bit hit masks): the snapshot shows them as entities with ids from ENTITY_CAP. */
  pickups: 4,
  heroesPerTeam: 3,
});

const C_FOUNTAIN = Object.freeze({
  x: 3000,
  y: 30000,
  radius: 4000,
  /** Heals 10% max HP a second. */
  healBpPerSecond: 1000,
  /** Shoots enemies inside for 500 damage a second; heroes (v4) for 15% of their max HP a second instead (heroes
   *  cannot walk in: the enemy fountain is a wall, only a dash or knockback gets one inside). */
  damagePerSecond: 500,
  heroDamageBpPerSecond: 1500,
});

const C_CORE = Object.freeze({ x: 10000, y: 30000 });

/** Hero spawn points around the fountain, one per team slot (0..2). */
const C_HERO_SPAWNS = Object.freeze([
  Object.freeze({ x: 3000, y: 32000 }),
  Object.freeze({ x: 4500, y: 30000 }),
  Object.freeze({ x: 3000, y: 28000 }),
]);

/** Lane keys of every map (sim v18: Hearthwood's fence, yarn, gutter). */
export type LaneId = 'sunny' | 'puddle' | 'fence' | 'yarn' | 'gutter';
const C_LANES: readonly LaneId[] = Object.freeze(['sunny', 'puddle'] as LaneId[]);

/** Lane waypoints from the Purrhaven core to the river; minions continue on the mirrored list to the Woof core. */
const C_LANE_WAYPOINTS = Object.freeze({
  sunny: Object.freeze([
    [10000, 30000],
    [16000, 44000],
    [22000, 50000],
    [50000, 53000],
  ] as const),
  puddle: Object.freeze([
    [10000, 30000],
    [16000, 16000],
    [22000, 10000],
    [50000, 7000],
  ] as const),
});

/** Tower tiers (sim v18: Hearthwood's gate towers and Hearth Guards). */
export type TowerTier = 'outer' | 'inner' | 'gate' | 'hearth';

/** Tower positions, Purrhaven side. Order is the tower slot order within a team. */
const C_TOWER_SPOTS = Object.freeze([
  Object.freeze({ lane: 'sunny' as LaneId, tier: 'outer' as TowerTier, x: 34000, y: 51000 }),
  Object.freeze({ lane: 'sunny' as LaneId, tier: 'inner' as TowerTier, x: 20000, y: 48000 }),
  Object.freeze({ lane: 'puddle' as LaneId, tier: 'outer' as TowerTier, x: 34000, y: 9000 }),
  Object.freeze({ lane: 'puddle' as LaneId, tier: 'inner' as TowerTier, x: 20000, y: 12000 }),
]);

const C_RAT_CAMP = Object.freeze({ x: 30000, y: 30000 });

/** Catnip Bushes, Purrhaven side: centre and size (3 × 6 m). */
const C_BUSHES = Object.freeze([
  Object.freeze({ x: 40000, y: 44000, w: 3000, h: 6000 }),
  Object.freeze({ x: 40000, y: 16000, w: 3000, h: 6000 }),
]);

const C_PUDDING_SPOT = Object.freeze({ x: 50000, y: 30000 });

/** Brush reveal: a unit in a bush is visible to an enemy within 2 m or in the same bush (§7.3). */
export const BRUSH_REVEAL_MM = 2000;
/** Sim v17 (MAP-GAPS B12, V17.md §4): an enemy minion sees into a bush from 3 m (the bush-scouting part). */
export const MINION_BRUSH_REVEAL_MM = 3000;
/**
 * Sim v16 (MAP-GAPS B11): a hero that hits or starts a cast from a bush is revealed for this many ticks (1.5 s), so a
 * bush hides an ambush, not a fight (PARITY.md §3.10 map-hack mitigation 2).
 */
export const BRUSH_ATTACK_REVEAL_TICKS = 45;

/**
 * Impassable rocks and roots (Purrhaven side, mirrored for Woof), axis-aligned rectangles in mm: [x0, y0, x1, y1].
 * They shape the jungle between the lanes and the rat camp; no lane (8 m wide) crosses one. The nav grid
 * (`src/sim/map/grid.ts`, later baked by `bake-map.mjs`) blocks every 1 m cell whose centre lies inside.
 */
const C_WALLS = Object.freeze([
  Object.freeze([24000, 37000, 30000, 41000] as const),
  Object.freeze([24000, 19000, 30000, 23000] as const),
  Object.freeze([35000, 26000, 37000, 34000] as const),
  Object.freeze([16000, 26000, 18000, 34000] as const),
]);

/**
 * The playfield (sim v5): the lane loop and what it encloses, both lanes' shoulders and the two base plazas. Every
 * other nav cell is forest (the trees in mapView stand exactly there), plus an outer rim, so no hero walks the map
 * border into a corner. `src/sim/map/grid.ts` bakes it into the static walls.
 */
const C_PLAYFIELD = Object.freeze({
  /** Cells whose centre is within this of the map edge are blocked. */
  rim: 2000,
  /** A cell within this distance of a lane centre line is walkable (lane 8 m wide + a 1.5 m shoulder each side). */
  laneHalf: 5500,
  /** Base plaza, Purrhaven side (mirrored for Woof): [x0, y0, x1, y1]. Holds the fountain, the core and both lane mouths. */
  base: Object.freeze([1000, 20000, 15000, 40000]) as readonly [number, number, number, number],
  /** Sim v18: 1 = every cell inside the rim is playfield (Hearthwood's open jungle); 0 = lanes, loop and plazas only. */
  open: 0 as 0 | 1,
});

/** Footprint radii (mm): range checks use centre distance ≤ range + target radius. Structures also block the nav grid. */
export const RADIUS = Object.freeze({
  hero: 500,
  minion: 400,
  tower: 1000,
  core: 2000,
  fountain: 0,
  camp: 500,
  pudding: 3000,
});

/** Hero pathfinding (integer A*, POC.md §3 nav/astar.ts). */
const C_NAV = Object.freeze({
  /** Expansion cap per query; on overflow the path goes to the best node so far. */
  maxExpand: 3000,
  /** Points kept after string pulling. */
  maxPathPoints: 16,
  /** A blocked goal snaps to the nearest walkable cell within this many cells. */
  snapCells: 6,
  /** Line-of-sight sampling step (mm). */
  losStep: 250,
  /** A chasing hero re-paths at most this often (ticks). */
  repathEvery: 15,
  /** A path point counts as reached within this distance (mm). */
  reach: 100,
});

/** A data row with its number literals widened to `number` (so another map's row fits the same type). */
export type Widen<T> = { readonly [K in keyof T]: T[K] extends number ? number : T[K] };

/** One tower spot (team 0's side): optional `hp` / `armour` override the TOWERS tier row (Hearthwood). */
export interface TowerSpot {
  readonly lane: LaneId | null;
  readonly tier: TowerTier;
  readonly x: number;
  readonly y: number;
  readonly hp?: number;
  readonly armour?: number;
}

/** A jungle camp (sim v18): kind (data/camps.ts CAMP_KINDS index), centre, and the team side it belongs to (2 = river). */
export interface CampSpot {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly side: number;
}

/**
 * Sim v18 (docs/plans/moba/MAP-5V5.md §3.1): everything that depends on the map, per map. Team 0's side is authored;
 * team 1's is the reflection (`MAP.point` 0: x mirrored; 1: x and y). The sim reads the live bindings below, which
 * `bindMap` (src/sim/map/runtime.ts) points at the match's map before any sim work.
 */
export interface MapDef {
  readonly id: 'crossing' | 'hearthwood';
  readonly name: string;
  readonly MAP: Widen<typeof C_MAP>;
  readonly CAPS: Widen<typeof C_CAPS>;
  readonly FOUNTAIN: Widen<typeof C_FOUNTAIN>;
  readonly CORE: { readonly x: number; readonly y: number };
  readonly HERO_SPAWNS: readonly { readonly x: number; readonly y: number }[];
  readonly LANES: readonly LaneId[];
  /** Team 0's own points per lane, core to river point. */
  readonly LANE_WAYPOINTS: Readonly<Record<LaneId, readonly (readonly [number, number])[]>>;
  /** Lane index whose team-0 points, reflected, carry team 0's lane on past the river (Crossing: the same lane). */
  readonly LANE_PARTNER: readonly number[];
  readonly TOWER_SPOTS: readonly TowerSpot[];
  /**
   * Team 1's tower slot k stands at the reflection of team 0's spot TOWER_PARTNER[k] (Crossing: k itself). Lanes are
   * physical, so on Hearthwood team 1's Fenceline towers are the reflection of team 0's Gutterway spots.
   */
  readonly TOWER_PARTNER: readonly number[];
  readonly RAT_CAMP: { readonly x: number; readonly y: number };
  /** Every camp, both sides, in camp order (Crossing: team 0's rat camp, then team 1's). */
  readonly CAMPS: readonly CampSpot[];
  /** Team 0's side; the other side is the reflection (bush index = side × length + k). */
  readonly BUSHES: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
  readonly PUDDING_SPOT: { readonly x: number; readonly y: number };
  readonly WALLS: readonly (readonly [number, number, number, number])[];
  readonly PLAYFIELD: Widen<typeof C_PLAYFIELD>;
  readonly NAV: Widen<typeof C_NAV>;
  /** Core HP and armour (0: CORE_STATS). */
  readonly coreHp: number;
  readonly coreArmour: number;
}

export const CROSSING: MapDef = Object.freeze({
  id: 'crossing',
  name: 'Purrhaven Crossing',
  MAP: C_MAP,
  CAPS: C_CAPS,
  FOUNTAIN: C_FOUNTAIN,
  CORE: C_CORE,
  HERO_SPAWNS: C_HERO_SPAWNS,
  LANES: C_LANES,
  LANE_WAYPOINTS: C_LANE_WAYPOINTS as unknown as MapDef['LANE_WAYPOINTS'],
  LANE_PARTNER: Object.freeze([0, 1]),
  TOWER_SPOTS: C_TOWER_SPOTS,
  TOWER_PARTNER: Object.freeze([0, 1, 2, 3]),
  RAT_CAMP: C_RAT_CAMP,
  CAMPS: Object.freeze([
    Object.freeze({ kind: 0, x: C_RAT_CAMP.x, y: C_RAT_CAMP.y, side: 0 }),
    Object.freeze({ kind: 0, x: C_MAP.width - C_RAT_CAMP.x, y: C_RAT_CAMP.y, side: 1 }),
  ]),
  BUSHES: C_BUSHES,
  PUDDING_SPOT: C_PUDDING_SPOT,
  WALLS: C_WALLS,
  PLAYFIELD: C_PLAYFIELD,
  NAV: C_NAV,
  coreHp: 0,
  coreArmour: 0,
});

// The live bindings (sim v18): the active match's map. Crossing until `setMapData` says otherwise.
export let MAP: MapDef['MAP'] = C_MAP;
export let CAPS: MapDef['CAPS'] = C_CAPS;
export let FOUNTAIN: MapDef['FOUNTAIN'] = C_FOUNTAIN;
export let CORE: MapDef['CORE'] = C_CORE;
export let HERO_SPAWNS: MapDef['HERO_SPAWNS'] = C_HERO_SPAWNS;
export let LANES: readonly LaneId[] = C_LANES;
export let LANE_WAYPOINTS: MapDef['LANE_WAYPOINTS'] = CROSSING.LANE_WAYPOINTS;
export let LANE_PARTNER: readonly number[] = CROSSING.LANE_PARTNER;
export let TOWER_SPOTS: readonly TowerSpot[] = C_TOWER_SPOTS;
export let TOWER_PARTNER: readonly number[] = CROSSING.TOWER_PARTNER;
export let RAT_CAMP: MapDef['RAT_CAMP'] = C_RAT_CAMP;
export let CAMPS: readonly CampSpot[] = CROSSING.CAMPS;
export let BUSHES: MapDef['BUSHES'] = C_BUSHES;
export let PUDDING_SPOT: MapDef['PUDDING_SPOT'] = C_PUDDING_SPOT;
export let WALLS: MapDef['WALLS'] = C_WALLS;
export let PLAYFIELD: MapDef['PLAYFIELD'] = C_PLAYFIELD;
export let NAV: MapDef['NAV'] = C_NAV;
export let ACTIVE_MAP: MapDef = CROSSING;

/** Team 1's x of team 0's x (both maps). */
export const mirrorX = (x: number): number => MAP.width - x;
/** Team 1's y of team 0's y: the same y on a mirrored map, H − y on a point-reflected one. */
export const mirrorY = (y: number): number => (MAP.point === 1 ? MAP.height - y : y);

/** Point the live bindings at `d` (src/sim/map/runtime.ts bindMap; nothing else calls it). */
export function setMapData(d: MapDef): void {
  ACTIVE_MAP = d;
  MAP = d.MAP;
  CAPS = d.CAPS;
  FOUNTAIN = d.FOUNTAIN;
  CORE = d.CORE;
  HERO_SPAWNS = d.HERO_SPAWNS;
  LANES = d.LANES;
  LANE_WAYPOINTS = d.LANE_WAYPOINTS;
  LANE_PARTNER = d.LANE_PARTNER;
  TOWER_SPOTS = d.TOWER_SPOTS;
  TOWER_PARTNER = d.TOWER_PARTNER;
  RAT_CAMP = d.RAT_CAMP;
  CAMPS = d.CAMPS;
  BUSHES = d.BUSHES;
  PUDDING_SPOT = d.PUDDING_SPOT;
  WALLS = d.WALLS;
  PLAYFIELD = d.PLAYFIELD;
  NAV = d.NAV;
}

/** The largest map's sizes (module-level scratch buffers are sized by these). */
export const MAX_CELLS = 16384;
export const MAX_ENTITIES = 150;
export const MAX_HEROES = 10;
