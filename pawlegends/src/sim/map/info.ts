/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §2.2): `mapInfo(id)`, the read-only map data the client and the server draw and
 * check against (the render, the minimap, the camera, the input caps). Built once per map from the same tables the sim
 * binds, so the picture and the sim never disagree. No sim state.
 */
import { CAMP_KINDS } from '../../data/camps';
import { BUSHES, CAMPS, CAPS, CORE, FOUNTAIN, HERO_SPAWNS, LANES, MAP, PUDDING_SPOT, TOWER_PARTNER, TOWER_SPOTS, WALLS, mirrorX, mirrorY } from '../../data/map';
import { LIMITS_BY_MAP } from '../../data/limits';
import { TIMELINE, TIMELINE_BY } from '../../data/timeline';
import { CROSSING_CAMERA_YAW, HEARTHWOOD_CAMERA_YAW, HEARTHWOOD_RIVER_SUM } from '../../data/maps/hearthwood';
import { PUDDING, SUGAR_RUSH } from '../../data/pudding';
import { FUN_BY_MAP } from '../../data/fun';
import { PLAYFIELD } from '../../data/map';
import { JUNGLE_EDGES, JUNGLE_NODES } from '../bots/jungle';
import { GRIZZLECHOP } from '../../data/camps';
import type { MapId, Team } from '../api';
import { MAP_IDS } from '../api';
import { NX, NY, createGrid } from './grid';
import { LANE_PATHS } from './lanes';
import { activeMap, bindMap, mapIndex } from './runtime';

export type LaneKey = 'sunny' | 'puddle' | 'fence' | 'yarn' | 'gutter';
export type LaneRole = 'solo' | 'mid' | 'fish' | 'sunny' | 'puddle';
export type TowerTierName = 'outer' | 'inner' | 'gate' | 'hearth';
export type CampKindName = 'rat' | 'prickle' | 'crow' | 'toad' | 'beetle';
export type Quadrant = 'south' | 'west' | 'north' | 'east';

export interface MapInfo {
  readonly id: MapId;
  readonly name: string;
  /** mm. */
  readonly width: number;
  readonly height: number;
  readonly navCell: number;
  readonly teamSize: 3 | 5;
  /** 'mirrorX': team 1 is team 0 mirrored across x = W/2; 'point': the 180° point reflection. */
  readonly symmetry: 'mirrorX' | 'point';
  /** Team 1's point of team 0's (x, y) and the other way round. */
  reflect(x: number, y: number, out: { x: number; y: number }): void;
  /** path[team] = [xs, ys], core to core (what that team's minions walk). */
  readonly lanes: readonly { id: LaneKey; name: string; role: LaneRole; path: readonly (readonly [Int32Array, Int32Array])[] }[];
  /** Every tower, both teams, in entity order (slot = index within its team). `lane` null: a Hearth Guard. */
  readonly towers: readonly { team: Team; slot: number; lane: LaneKey | null; tier: TowerTierName; x: number; y: number; hp: number }[];
  readonly cores: readonly { team: Team; x: number; y: number }[];
  readonly fountains: readonly { team: Team; x: number; y: number; radius: number }[];
  readonly spawns: readonly { team: Team; slot: number; x: number; y: number }[];
  /** Every rock wall, both sides, [x0, y0, x1, y1]. */
  readonly walls: readonly (readonly [number, number, number, number])[];
  /** Every bush, both sides; `id` is the sim's bush index. */
  readonly bushes: readonly { id: number; x: number; y: number; w: number; h: number }[];
  /** Crossing: the band a ≤ x ≤ b. Hearthwood: the band |x + y − a| ≤ b (along x + y). */
  readonly river: { kind: 'band-x' | 'band-diag'; a: number; b: number };
  readonly camps: readonly { id: number; kind: CampKindName; quadrant: Quadrant | null; x: number; y: number }[];
  readonly objectives: readonly { kind: 'pudding' | 'grizzlechop'; x: number; y: number; radius: number }[];
  /** Nav cells (row-major, NX × NY), 1 = walkable static ground (render: trees and rocks where 0). */
  readonly playable: Uint8Array;
  readonly nx: number;
  readonly ny: number;
  /** Ticks, per difficulty where it varies. */
  readonly timeline: {
    readonly barrierDrop: number;
    readonly firstWave: number;
    readonly waveEvery: number;
    readonly campsUp: number;
    readonly grizzlechop: number;
    readonly pudding: number;
    readonly safetyEnd: number;
    readonly phases: Readonly<Record<'rookie' | 'easy' | 'normal' | 'hard', { sunset: number; suddenDeath: number }>>;
  };
  readonly limits: { readonly maxTicks: number; readonly maxInputBytes: number; readonly maxInputChars: number };
  /** The fixed camera's yaw: Crossing −38° (its lanes run left to right), Hearthwood 0° (the diagonal already climbs). */
  readonly camera: { readonly yawDeg: number };
  /**
   * Sim v22 (MAP-5V5-STANDARD.md §5, §7.3, §9.1; Hearthwood only, empty on Crossing): the carved jungle's clearings
   * and pit discs (x, y, r) and corridors (ax, ay, bx, by, half width), every copy; the Boing Beds (both teams); the
   * bots' jungle route nodes and edges (kind: data/maps/hearthwoodGraph.ts JNODE).
   */
  readonly clearings: readonly { x: number; y: number; r: number }[];
  readonly corridors: readonly { ax: number; ay: number; bx: number; by: number; half: number }[];
  readonly pits: readonly { x: number; y: number; r: number }[];
  readonly beds: readonly { team: Team; x: number; y: number; landX: number; landY: number }[];
  readonly jungleNodes: readonly { kind: number; team: Team; x: number; y: number }[];
  readonly jungleEdges: readonly (readonly [number, number])[];
  /** Sim v22: the river objectives' timers (ticks; −1 = none on this map) and Sugar Rush's length. */
  readonly objectiveTimers: {
    readonly grizzlechopRespawn: number;
    readonly grizzlechopLast: number;
    readonly puddingRespawn: number;
    readonly sugarRush: number;
  };
}

const NAMES: Readonly<Record<string, string>> = { sunny: 'Sunny Lane', puddle: 'Puddle Lane', fence: 'Fenceline', yarn: 'Yarn Road', gutter: 'Gutterway' };
const ROLES: Readonly<Record<string, LaneRole>> = { sunny: 'sunny', puddle: 'puddle', fence: 'solo', yarn: 'mid', gutter: 'fish' };

const built: (MapInfo | undefined)[] = [];

function quadrantOf(x: number, y: number, side: number): Quadrant | null {
  if (side > 1) return null;
  // Team 0's south (below the main diagonal) and west; team 1's north and east (their reflections).
  if (side === 0) return y <= x ? 'south' : 'west';
  return y >= x ? 'north' : 'east';
}

function build(id: MapId): MapInfo {
  const point = MAP.point === 1;
  // This map's own reflection (the live bindings may point at another map when it is called).
  const W = MAP.width;
  const H = MAP.height;
  const reflect = (x: number, y: number, out: { x: number; y: number }): void => {
    out.x = W - x;
    out.y = point ? H - y : y;
  };
  const lanes = LANES.map((l, k) => ({
    id: l as LaneKey,
    name: NAMES[l],
    role: ROLES[l],
    path: [0, 1].map((t) => [LANE_PATHS[t][k].x.slice(), LANE_PATHS[t][k].y.slice()] as const),
  }));
  const towers: MapInfo['towers'][number][] = [];
  for (let team = 0; team < 2; team++) {
    for (let k = 0; k < TOWER_SPOTS.length; k++) {
      const s = TOWER_SPOTS[k];
      const at = team === 0 ? s : TOWER_SPOTS[TOWER_PARTNER[k]];
      towers.push({ team: team as Team, slot: k, lane: s.lane, tier: s.tier, x: team === 0 ? at.x : mirrorX(at.x), y: team === 0 ? at.y : mirrorY(at.y), hp: s.hp ?? 0 });
    }
  }
  const walls: (readonly [number, number, number, number])[] = [];
  for (const r of WALLS) walls.push(r);
  for (const r of WALLS) walls.push(point ? [mirrorX(r[2]), mirrorY(r[3]), mirrorX(r[0]), mirrorY(r[1])] : [mirrorX(r[2]), r[1], mirrorX(r[0]), r[3]]);
  const bushes: MapInfo['bushes'][number][] = [];
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < BUSHES.length; k++) {
      const b = BUSHES[k];
      bushes.push({ id: side * BUSHES.length + k, x: side === 0 ? b.x : mirrorX(b.x), y: side === 0 ? b.y : mirrorY(b.y), w: b.w, h: b.h });
    }
  }
  const camps: MapInfo['camps'][number][] = [];
  const objectives: MapInfo['objectives'][number][] = [];
  for (let c = 0; c < CAMPS.length; c++) {
    const s = CAMPS[c];
    const kind = CAMP_KINDS[s.kind].name;
    if (kind === 'boss') objectives.push({ kind: 'grizzlechop', x: s.x, y: s.y, radius: CAMP_KINDS[s.kind].leash });
    else camps.push({ id: c, kind, quadrant: point ? quadrantOf(s.x, s.y, s.side) : null, x: s.x, y: s.y });
  }
  objectives.push({ kind: 'pudding', x: PUDDING_SPOT.x, y: PUDDING_SPOT.y, radius: PUDDING.hopRadius });
  // Sim v22: the carved jungle, each south-eighth shape in its four copies (as authored, swapped, reflected, both).
  const carved = PLAYFIELD.open === 2;
  const copies = (x: number, y: number): [number, number][] => [
    [x, y],
    [y, x],
    [W - x, H - y],
    [H - y, W - x],
  ];
  const clearings = carved ? PLAYFIELD.clearings.flatMap(([x, y, r]) => copies(x, y).map(([cx, cy]) => ({ x: cx, y: cy, r }))) : [];
  const pits = carved ? PLAYFIELD.pits.flatMap(([x, y, r]) => [{ x, y, r }, { x: W - x, y: H - y, r }]) : [];
  const corridors = carved
    ? PLAYFIELD.corridors.flatMap(([ax, ay, bx, by, half]) => {
        const a = copies(ax, ay);
        const b = copies(bx, by);
        return a.map(([px, py], k) => ({ ax: px, ay: py, bx: b[k][0], by: b[k][1], half }));
      })
    : [];
  const bedRows = FUN_BY_MAP[mapIndex(id)].beds;
  const beds = [0, 1].flatMap((team) =>
    bedRows.map(([x, y, lx, ly]) => ({
      team: team as Team,
      x: team === 0 ? x : mirrorX(x),
      y: team === 0 ? y : mirrorY(y),
      landX: team === 0 ? lx : mirrorX(lx),
      landY: team === 0 ? ly : mirrorY(ly),
    })),
  );
  const grid = createGrid();
  const playable = new Uint8Array(NX * NY);
  for (let c = 0; c < playable.length; c++) playable[c] = grid.walls[c] === 0 ? 1 : 0;
  return Object.freeze({
    id,
    name: id === 'hearthwood' ? 'Hearthwood Divide' : 'Purrhaven Crossing',
    width: MAP.width,
    height: MAP.height,
    navCell: MAP.navCell,
    teamSize: CAPS.heroesPerTeam as 3 | 5,
    symmetry: point ? ('point' as const) : ('mirrorX' as const),
    reflect,
    lanes,
    towers,
    cores: [
      { team: 0 as Team, x: CORE.x, y: CORE.y },
      { team: 1 as Team, x: mirrorX(CORE.x), y: mirrorY(CORE.y) },
    ],
    fountains: [
      { team: 0 as Team, x: FOUNTAIN.x, y: FOUNTAIN.y, radius: FOUNTAIN.radius },
      { team: 1 as Team, x: mirrorX(FOUNTAIN.x), y: mirrorY(FOUNTAIN.y), radius: FOUNTAIN.radius },
    ],
    spawns: [0, 1].flatMap((team) =>
      HERO_SPAWNS.map((p, k) => ({
        team: team as Team,
        slot: team * HERO_SPAWNS.length + k,
        x: team === 0 ? p.x : point ? W - p.y : mirrorX(p.x),
        y: team === 0 ? p.y : point ? H - p.x : mirrorY(p.y),
      })),
    ),
    walls,
    bushes,
    river: point ? { kind: 'band-diag' as const, a: MAP.width, b: HEARTHWOOD_RIVER_SUM } : { kind: 'band-x' as const, a: MAP.riverX[0], b: MAP.riverX[1] },
    camps,
    objectives,
    playable,
    nx: NX,
    ny: NY,
    timeline: {
      barrierDrop: TIMELINE.barrierDrop,
      firstWave: TIMELINE.firstWave,
      waveEvery: TIMELINE.waveEvery,
      campsUp: TIMELINE.campsUp,
      grizzlechop: point ? GRIZZLECHOP.first : -1,
      pudding: TIMELINE.pudding,
      safetyEnd: TIMELINE.safetyEnd,
      phases: TIMELINE_BY,
    },
    limits: LIMITS_BY_MAP[id],
    camera: { yawDeg: point ? HEARTHWOOD_CAMERA_YAW : CROSSING_CAMERA_YAW },
    clearings,
    corridors,
    pits,
    beds,
    jungleNodes: carved ? JUNGLE_NODES.map((n) => ({ kind: n.kind, team: n.team as Team, x: n.x, y: n.y })) : [],
    jungleEdges: carved ? JUNGLE_EDGES : [],
    objectiveTimers: {
      grizzlechopRespawn: point ? GRIZZLECHOP.respawn : -1,
      grizzlechopLast: point ? GRIZZLECHOP.lastSpawn : -1,
      puddingRespawn: PUDDING.respawn,
      sugarRush: point ? SUGAR_RUSH.ticks : -1,
    },
  });
}

/** The read-only description of map `id` (built once; leaves the sim's bound map as it was). */
export function mapInfo(id: MapId = 'crossing'): MapInfo {
  const i = mapIndex(id);
  const hit = built[i];
  if (hit) return hit;
  const was = activeMap();
  bindMap(i);
  const info = build(MAP_IDS[i]);
  bindMap(was);
  built[i] = info;
  return info;
}
