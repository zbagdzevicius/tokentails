/**
 * Purrhaven Crossing, POC subset (POC.md §5). Integer mm, origin bottom-left, x 0..100 m, y 0..60 m.
 * Mirrored left-right across x = 50 m: a Woof object at (x, y) is the Purrhaven one at (MAP.width − x, y).
 * Only the Purrhaven (team 0) side is authored here; `mirrorX` gives the Woof side.
 */

export const MAP = Object.freeze({
  width: 100000,
  height: 60000,
  /** River band x 46..54 m. */
  riverX: Object.freeze([46000, 54000] as const),
  /** Gate barrier line, up for the first 10 s (TIMELINE.barrierDrop). */
  barrierX: 8000,
  /** Nav grid: 1 m cells, 100 × 60. */
  navCell: 1000,
  laneWidth: 8000,
});

export const mirrorX = (x: number): number => MAP.width - x;

/** Entity caps (§4.1). Entity ids are slot indices; iteration is always ascending. */
export const CAPS = Object.freeze({
  heroes: 6,
  minions: 40,
  towers: 8,
  cores: 2,
  fountains: 2,
  campMonsters: 4,
  pudding: 1,
  projectiles: 48,
  zones: 24,
  heroesPerTeam: 3,
});

export const FOUNTAIN = Object.freeze({
  x: 3000,
  y: 30000,
  radius: 4000,
  /** Heals 10% max HP a second. */
  healBpPerSecond: 1000,
  /** Shoots enemies inside for 500 damage a second. */
  damagePerSecond: 500,
});

export const CORE = Object.freeze({ x: 10000, y: 30000 });

/** Hero spawn points around the fountain, one per team slot (0..2). */
export const HERO_SPAWNS = Object.freeze([
  Object.freeze({ x: 3000, y: 32000 }),
  Object.freeze({ x: 4500, y: 30000 }),
  Object.freeze({ x: 3000, y: 28000 }),
]);

export type LaneId = 'sunny' | 'puddle';
export const LANES: readonly LaneId[] = Object.freeze(['sunny', 'puddle'] as LaneId[]);

/** Lane waypoints from the Purrhaven core to the river; minions continue on the mirrored list to the Woof core. */
export const LANE_WAYPOINTS = Object.freeze({
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

export type TowerTier = 'outer' | 'inner';

/** Tower positions, Purrhaven side. Order is the tower slot order within a team. */
export const TOWER_SPOTS = Object.freeze([
  Object.freeze({ lane: 'sunny' as LaneId, tier: 'outer' as TowerTier, x: 34000, y: 51000 }),
  Object.freeze({ lane: 'sunny' as LaneId, tier: 'inner' as TowerTier, x: 20000, y: 48000 }),
  Object.freeze({ lane: 'puddle' as LaneId, tier: 'outer' as TowerTier, x: 34000, y: 9000 }),
  Object.freeze({ lane: 'puddle' as LaneId, tier: 'inner' as TowerTier, x: 20000, y: 12000 }),
]);

export const RAT_CAMP = Object.freeze({ x: 30000, y: 30000 });

/** Catnip Bushes, Purrhaven side: centre and size (3 × 6 m). */
export const BUSHES = Object.freeze([
  Object.freeze({ x: 40000, y: 44000, w: 3000, h: 6000 }),
  Object.freeze({ x: 40000, y: 16000, w: 3000, h: 6000 }),
]);

export const PUDDING_SPOT = Object.freeze({ x: 50000, y: 30000 });

/** Brush reveal: a unit in a bush is visible to an enemy within 2 m or in the same bush (§7.3). */
export const BRUSH_REVEAL_MM = 2000;

/**
 * Impassable rocks and roots (Purrhaven side, mirrored for Woof), axis-aligned rectangles in mm: [x0, y0, x1, y1].
 * They shape the jungle between the lanes and the rat camp; no lane (8 m wide) crosses one. The nav grid
 * (`src/sim/map/grid.ts`, later baked by `bake-map.mjs`) blocks every 1 m cell whose centre lies inside.
 */
export const WALLS = Object.freeze([
  Object.freeze([24000, 37000, 30000, 41000] as const),
  Object.freeze([24000, 19000, 30000, 23000] as const),
  Object.freeze([35000, 26000, 37000, 34000] as const),
  Object.freeze([16000, 26000, 18000, 34000] as const),
]);

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
export const NAV = Object.freeze({
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
