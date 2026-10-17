/**
 * Lane paths (POC.md §5). Purrhaven minions walk their own core → river points, then the mirrored list back to the
 * Woof core; the Woof path is the Purrhaven path mirrored across x = 50 m. Built once at module load.
 */
import { LANES, LANE_WAYPOINTS, mirrorX } from '../../data/map';

export interface LanePath {
  readonly x: Int32Array;
  readonly y: Int32Array;
  readonly length: number;
}

function build(lane: number, team: number): LanePath {
  const own = LANE_WAYPOINTS[LANES[lane]];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < own.length; i++) {
    xs.push(own[i][0]);
    ys.push(own[i][1]);
  }
  // The river point is shared; walk the mirrored points back to the enemy core.
  for (let i = own.length - 2; i >= 0; i--) {
    xs.push(mirrorX(own[i][0]));
    ys.push(own[i][1]);
  }
  const x = Int32Array.from(team === 0 ? xs : xs.map(mirrorX));
  return { x, y: Int32Array.from(ys), length: xs.length };
}

/** LANE_PATHS[team][lane]. */
export const LANE_PATHS: readonly (readonly LanePath[])[] = Object.freeze(
  [0, 1].map((team) => Object.freeze(LANES.map((_, lane) => build(lane, team)))),
);
