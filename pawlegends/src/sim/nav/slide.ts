/**
 * Sim v17 (MAP-GAPS B5a, docs/plans/moba/V17.md §4): a forced walk that meets a wall slides along it instead of
 * stopping dead. Used for feared and charmed heroes (effects/fear.ts `fleeStep`); minions and rats are unchanged.
 */
import { MAP } from '../../data/map';
import { cellOfTeam, walkable, type NavGrid } from '../map/grid';

/**
 * Step from (x, y) to (nx, ny); if that cell is blocked try x only, then y only, else stay. Writes [x, y] to `out`.
 * Sim v19: a team 1 hero on a point map is the river mirror of team 0's, which swaps the axes: it tries y only first,
 * and its cells quantize mirrored (grid.ts `cellOfTeam`). Crossing and team 0: unchanged.
 */
export function slideStep(grid: NavGrid, x: number, y: number, nx: number, ny: number, out: Int32Array, team = 0): void {
  const yFirst = MAP.point === 1 && team === 1;
  if (walkable(grid, cellOfTeam(nx, ny, team))) {
    out[0] = nx;
    out[1] = ny;
  } else if (!yFirst && nx !== x && walkable(grid, cellOfTeam(nx, y, team))) {
    out[0] = nx;
    out[1] = y;
  } else if (ny !== y && walkable(grid, cellOfTeam(x, ny, team))) {
    out[0] = x;
    out[1] = ny;
  } else if (yFirst && nx !== x && walkable(grid, cellOfTeam(nx, y, team))) {
    out[0] = nx;
    out[1] = y;
  } else {
    out[0] = x;
    out[1] = y;
  }
}
