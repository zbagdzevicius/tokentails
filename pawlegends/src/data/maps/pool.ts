/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md, design docs/plans/moba/MAPS-3V3.md): the shared frame of the four new 3v3
 * maps. Every one keeps Purrhaven Crossing's size, base plaza, core, fountain, spawns and gate barrier, is mirrored left
 * to right (team 1's object at (W − x, y)) and is carved (PLAYFIELD.open 3): walkable ground is the lanes' bands, the
 * base plazas, and the clearings and corridors authored on team 0's half (folded onto it for team 1).
 *
 * All names are ours (cats vs dogs). The maps borrow genre ideas only (MAPS-3V3.md §1): no other game's names,
 * geometry, art or sound.
 */
import { CROSSING, type CampSpot, type LaneId, type MapDef, type ObjectiveSpec, type TowerSpot } from '../map';

/** Sim v34: what a pool map authors (team 0's half); the rest is Crossing's. */
export interface PoolMapSpec {
  readonly id: 'ridge' | 'thicket' | 'quarry' | 'pitch';
  readonly name: string;
  readonly blurb: string;
  readonly lanes: readonly LaneId[];
  readonly laneNames: readonly string[];
  readonly waypoints: Partial<Record<LaneId, readonly (readonly [number, number])[]>>;
  readonly towers: readonly TowerSpot[];
  readonly minions: number;
  /** Camps of team 0's side: [kind (data/camps.ts CAMP_KIND), x, y]; mirrored for team 1. */
  readonly camps: readonly (readonly [number, number, number])[];
  readonly campMonsters: number;
  readonly bushes: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
  readonly walls: readonly (readonly [number, number, number, number])[];
  readonly clearings: readonly (readonly [number, number, number])[];
  readonly corridors: readonly (readonly [number, number, number, number, number])[];
  readonly pudding: { readonly x: number; readonly y: number };
  readonly objective: ObjectiveSpec;
  readonly goalMouth?: readonly [number, number, number, number];
  readonly crates?: readonly (readonly [number, number, number, number])[];
  /** Core HP (0 or absent: CORE_STATS). */
  readonly coreHp?: number;
  /** The map's own hero-vs-hero row (MapDef.heroPvp). */
  readonly heroPvp?: Readonly<Record<string, Readonly<{ dmgBp: number; takenBp: number }>>>;
}

/** Both sides' camps in camp order: team 0's, then their mirrors (team 1's). */
function campsOf(spec: PoolMapSpec): readonly CampSpot[] {
  const out: CampSpot[] = [];
  for (let side = 0; side < 2; side++) {
    for (const [kind, x, y] of spec.camps) out.push(Object.freeze({ kind, x: side === 0 ? x : CROSSING.MAP.width - x, y, side }));
  }
  return Object.freeze(out);
}

/** A pool map's MapDef: Crossing's frame with the spec's lanes, towers, camps and carve. */
export function poolMap(spec: PoolMapSpec): MapDef {
  const camps = campsOf(spec);
  const first = spec.camps.length > 0 ? { x: spec.camps[0][1], y: spec.camps[0][2] } : { x: spec.pudding.x, y: spec.pudding.y };
  return Object.freeze({
    ...CROSSING,
    id: spec.id,
    name: spec.name,
    blurb: spec.blurb,
    MAP: Object.freeze({ ...CROSSING.MAP, riverX: Object.freeze([50000, 50000]) as readonly [number, number] }),
    CAPS: Object.freeze({ ...CROSSING.CAPS, minions: spec.minions, towers: spec.towers.length * 2, campMonsters: spec.campMonsters }),
    LANES: Object.freeze([...spec.lanes]),
    laneNames: Object.freeze([...spec.laneNames]),
    LANE_WAYPOINTS: Object.freeze({ ...spec.waypoints }) as MapDef['LANE_WAYPOINTS'],
    LANE_PARTNER: Object.freeze(spec.lanes.map((_, i) => i)),
    TOWER_SPOTS: Object.freeze(spec.towers.map((t) => Object.freeze({ ...t }))),
    TOWER_PARTNER: Object.freeze(spec.towers.map((_, i) => i)),
    RAT_CAMP: Object.freeze(first),
    CAMPS: camps,
    BUSHES: Object.freeze(spec.bushes.map((b) => Object.freeze({ ...b }))),
    PUDDING_SPOT: Object.freeze({ ...spec.pudding }),
    WALLS: Object.freeze(spec.walls.map((r) => Object.freeze([...r] as unknown as readonly [number, number, number, number]))),
    PLAYFIELD: Object.freeze({
      ...CROSSING.PLAYFIELD,
      open: 3 as const,
      clearings: Object.freeze(spec.clearings.map((c) => Object.freeze([...c] as unknown as readonly [number, number, number]))),
      corridors: Object.freeze(spec.corridors.map((c) => Object.freeze([...c] as unknown as readonly [number, number, number, number, number]))),
    }),
    objective: Object.freeze({ ...spec.objective }),
    coreHp: spec.coreHp ?? 0,
    ...(spec.heroPvp ? { heroPvp: Object.freeze(Object.fromEntries(Object.entries(spec.heroPvp).map(([k, v]) => [k, Object.freeze({ ...v })]))) } : {}),
    ...(spec.goalMouth ? { goalMouth: Object.freeze([...spec.goalMouth]) as unknown as readonly [number, number, number, number] } : {}),
    ...(spec.crates ? { crates: Object.freeze(spec.crates.map((c) => Object.freeze([...c] as unknown as readonly [number, number, number, number]))) } : {}),
  }) as MapDef;
}

/** The neutral objective row every spec starts from (each map sets what it uses). */
export const OBJ_BASE: Omit<ObjectiveSpec, 'kind' | 'x' | 'y'> = Object.freeze({
  r: 0,
  capture: 0,
  first: 0,
  cooldown: 0,
  endAt: 0,
  potPerSecond: 0,
  potCap: 0,
  fish: 0,
  xp: 0,
  buffTicks: 0,
  minionStructBp: 10000,
  heroStructBp: 10000,
  minionTakenBp: 10000,
  speedBp: 0,
  gemCap: 0,
  gemNeed: 0,
  countdown: 0,
  siegeBp: 0,
  reset: 0,
});
