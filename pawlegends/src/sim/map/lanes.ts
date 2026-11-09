/**
 * Lane paths (POC.md §5). Team 0's minions walk their own core → river points, then the partner lane's points
 * reflected back to team 1's core; team 1's path for a lane is the reflection of team 0's path for its partner lane.
 * Crossing: the partner is the lane itself and the reflection mirrors x (the original rule). Sim v18 Hearthwood: the
 * reflection is the 180° point reflection and Fenceline / Gutterway are each other's partners. Built once per map.
 */
import { ACTIVE_MAP, LANES, LANE_PARTNER, LANE_WAYPOINTS, mirrorX, mirrorY } from '../../data/map';

export interface LanePath {
  readonly x: Int32Array;
  readonly y: Int32Array;
  readonly length: number;
}

function team0(lane: number): { xs: number[]; ys: number[] } {
  const own = LANE_WAYPOINTS[LANES[lane]];
  const back = LANE_WAYPOINTS[LANES[LANE_PARTNER[lane]]];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < own.length; i++) {
    xs.push(own[i][0]);
    ys.push(own[i][1]);
  }
  // The river point is shared; walk the reflected points back to the enemy core.
  for (let i = back.length - 2; i >= 0; i--) {
    xs.push(mirrorX(back[i][0]));
    ys.push(mirrorY(back[i][1]));
  }
  return { xs, ys };
}

function build(lane: number, team: number): LanePath {
  if (team === 0) {
    const p = team0(lane);
    return { x: Int32Array.from(p.xs), y: Int32Array.from(p.ys), length: p.xs.length };
  }
  const p = team0(LANE_PARTNER[lane]);
  return { x: Int32Array.from(p.xs.map(mirrorX)), y: Int32Array.from(p.ys.map(mirrorY)), length: p.xs.length };
}

const buildAll = (): readonly (readonly LanePath[])[] => Object.freeze([0, 1].map((team) => Object.freeze(LANES.map((_, lane) => build(lane, team)))));

const BUILT: { id: string; paths: readonly (readonly LanePath[])[] }[] = [];

/** LANE_PATHS[team][lane] of the active map (sim v18: live, `rebindLanes`). */
export let LANE_PATHS: readonly (readonly LanePath[])[] = buildAll();
BUILT.push({ id: ACTIVE_MAP.id, paths: LANE_PATHS });

/** Sim v18: point LANE_PATHS at the active map's (src/sim/map/runtime.ts bindMap). */
export function rebindLanes(): void {
  for (let i = 0; i < BUILT.length; i++) {
    if (BUILT[i].id === ACTIVE_MAP.id) {
      LANE_PATHS = BUILT[i].paths;
      return;
    }
  }
  LANE_PATHS = buildAll();
  BUILT.push({ id: ACTIVE_MAP.id, paths: LANE_PATHS });
}
