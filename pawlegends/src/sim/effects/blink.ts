/** `blink` (POC.md §4.4): instant move up to `maxDist` toward (tx, ty); a blocked destination is cut short. */
import { idiv, isqrt } from '../fixed';
import { cellOf, walkable } from '../map/grid';
import type { MatchHandle } from '../state';
import { clipTravel } from './dash';
import { clampToArena } from './tether';

const end = new Int32Array(2);

export function blink(m: MatchHandle, id: number, tx: number, ty: number, maxDist: number): void {
  const w = m.world;
  let dx = tx - w.x[id];
  let dy = ty - w.y[id];
  const d = isqrt(dx * dx + dy * dy);
  if (d > maxDist) {
    dx = idiv(dx * maxDist, d);
    dy = idiv(dy * maxDist, d);
  }
  const bx = w.x[id] + dx;
  const by = w.y[id] + dy;
  clampToArena(w, id, bx, by, end);
  // A free destination is reached even across a wall; a blocked one stops at the last free point on the way.
  if (end[0] !== bx || end[1] !== by || !walkable(m.grid, cellOf(bx, by))) clipTravel(m, id, bx, by, end);
  w.x[id] = end[0];
  w.y[id] = end[1];
  w.moveX[id] = end[0];
  w.moveY[id] = end[1];
  w.moveCarry[id] = 0;
  w.pathLen[id] = 0;
  w.pathIdx[id] = 0;
  w.timer[id] = 0;
}
