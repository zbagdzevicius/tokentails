/** `fear` (POC.md §4.4): the unit runs straight away from (fromX, fromY) and cannot act. */
import { MAP } from '../../data/map';
import { EFFECTS } from '../../data/effects';
import { TICK_HZ } from '../../data/timeline';
import { applyBp, clamp, idiv, isqrt, moveToward } from '../fixed';
import { cellOf, walkable, type NavGrid } from '../map/grid';
import { Kind, type World } from '../world';
import { ccImmune, interrupt } from './status';
import { moveSpeed } from '../units/kinds';

export function fear(w: World, id: number, ticks: number, fromX: number, fromY: number): void {
  if (ticks <= 0 || ccImmune(w, id)) return;
  w.fearT[id] = Math.max(w.fearT[id], ticks);
  w.fearX[id] = fromX;
  w.fearY[id] = fromY;
  interrupt(w, id, true);
}

const out = new Int32Array(3);

/** One tick of running away. Heroes stop at walls; rooted units only cower. */
export function fleeStep(w: World, grid: NavGrid, id: number): void {
  if (w.rootT[id] > 0) return;
  let dx = w.x[id] - w.fearX[id];
  let dy = w.y[id] - w.fearY[id];
  let d = isqrt(dx * dx + dy * dy);
  if (d === 0) {
    dx = w.team[id] === 0 ? -1 : 1;
    dy = 0;
    d = 1;
  }
  const far = MAP.navCell;
  const tx = clamp(w.x[id] + idiv(dx * far, d), 0, MAP.width);
  const ty = clamp(w.y[id] + idiv(dy * far, d), 0, MAP.height);
  moveToward(w.x[id], w.y[id], tx, ty, applyBp(moveSpeed(w, id), EFFECTS.fearSpeedBp), w.moveCarry[id], TICK_HZ, out);
  if (w.kind[id] === Kind.Hero && !walkable(grid, cellOf(out[0], out[1]))) return;
  w.x[id] = out[0];
  w.y[id] = out[1];
  w.moveCarry[id] = out[2];
}
