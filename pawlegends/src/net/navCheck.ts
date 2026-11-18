/**
 * e2e only (loaded on demand from MatchSession's `World` hook): do the client's nav grids belong to the map bound for
 * this match? The prediction walker (predict-path.ts) and the input grid (input/navMirror.ts) are checked against a
 * fresh build of the bound map's walls, the same walls the sim walks. A party rematch on another pool map once kept
 * the first match's walls (founder, Nov 18).
 */
import { MAP, NAV } from '../data/map';
import { clientGrid } from '../input/navMirror';
import { createGrid, gridKey } from '../sim/map/grid';
import { findPath } from '../sim/nav/astar';
import { gridPlanner } from './predict-path';

export function navAgrees(): { key: string; ok: boolean; bad: number } {
  const fresh = createGrid();
  const outX = new Int32Array(NAV.maxPathPoints);
  const outY = new Int32Array(NAV.maxPathPoints);
  let bad = 0;
  for (let i = 1; i <= 5; i++)
    for (let j = 1; j <= 5; j++) {
      const sx = Math.round((MAP.width * i) / 6);
      const sy = Math.round((MAP.height * j) / 6);
      const tx = Math.round(MAP.width - (MAP.width * j) / 6);
      const ty = Math.round((MAP.height * i) / 6);
      const r = findPath(fresh, sx, sy, tx, ty, outX, outY, 0);
      const got = gridPlanner(sx, sy, tx, ty);
      let same = got.length === r.count;
      for (let k = 0; same && k < r.count; k++) same = got[k].x === outX[k] && got[k].y === outY[k];
      if (!same) bad++;
    }
  const walls = clientGrid().walls;
  if (walls.length !== fresh.walls.length || walls.some((v, k) => v !== fresh.walls[k])) bad++;
  return { key: gridKey(), ok: bad === 0, bad };
}
