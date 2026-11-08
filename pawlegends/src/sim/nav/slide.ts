/**
 * Sim v17 (MAP-GAPS B5a, docs/plans/moba/V17.md §4): a forced walk that meets a wall slides along it instead of
 * stopping dead. Used for feared and charmed heroes (effects/fear.ts `fleeStep`); minions and rats are unchanged.
 */
import { cellOf, walkable, type NavGrid } from '../map/grid';

/** Step from (x, y) to (nx, ny); if that cell is blocked try x only, then y only, else stay. Writes [x, y] to `out`. */
export function slideStep(grid: NavGrid, x: number, y: number, nx: number, ny: number, out: Int32Array): void {
  if (walkable(grid, cellOf(nx, ny))) {
    out[0] = nx;
    out[1] = ny;
  } else if (nx !== x && walkable(grid, cellOf(nx, y))) {
    out[0] = nx;
    out[1] = y;
  } else if (ny !== y && walkable(grid, cellOf(x, ny))) {
    out[0] = x;
    out[1] = ny;
  } else {
    out[0] = x;
    out[1] = y;
  }
}
