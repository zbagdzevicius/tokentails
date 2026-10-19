/**
 * `fear` (POC.md §4.4): the unit runs straight away from (fromX, fromY) and cannot act. `charm` (sim v9, Gabė's
 * Under Her Spell) is the same hard CC turned around: the unit walks toward its charmer (`fearSrc`), stops
 * EFFECTS.charmStop short of it, and the charm ends early when the charmer dies.
 */
import { MAP } from '../../data/map';
import { EFFECTS } from '../../data/effects';
import { TICK_HZ } from '../../data/timeline';
import { applyBp, clamp, dist2, idiv, isqrt, moveToward } from '../fixed';
import { cellOf, walkable, type NavGrid } from '../map/grid';
import { Kind, type World } from '../world';
import { ccImmune, interrupt } from './status';
import { moveSpeed } from '../units/kinds';

export function fear(w: World, id: number, ticks: number, fromX: number, fromY: number): void {
  if (ticks <= 0 || ccImmune(w, id)) return;
  w.fearT[id] = Math.max(w.fearT[id], ticks);
  w.fearX[id] = fromX;
  w.fearY[id] = fromY;
  w.fearSrc[id] = -1;
  interrupt(w, id, true);
}

/** Charm `id` for `ticks`: it walks toward unit `src` (at its own, slowed, move speed) and cannot act. */
export function charm(w: World, id: number, ticks: number, src: number): void {
  if (ticks <= 0 || ccImmune(w, id) || src < 0) return;
  w.fearT[id] = Math.max(w.fearT[id], ticks);
  w.fearX[id] = w.x[src];
  w.fearY[id] = w.y[src];
  w.fearSrc[id] = src;
  interrupt(w, id, true);
}

const out = new Int32Array(3);

/** One tick of running away (or, charmed, walking toward the charmer). Heroes stop at walls; rooted units only cower. */
export function fleeStep(w: World, grid: NavGrid, id: number): void {
  const src = w.fearSrc[id];
  if (src >= 0) {
    if (w.alive[src] === 0) {
      // The charmer is gone: the charm ends at once.
      w.fearT[id] = 0;
      w.fearSrc[id] = -1;
      return;
    }
    w.fearX[id] = w.x[src];
    w.fearY[id] = w.y[src];
  }
  if (w.rootT[id] > 0) return;
  let dx = w.x[id] - w.fearX[id];
  let dy = w.y[id] - w.fearY[id];
  if (src >= 0) {
    if (dist2(w.x[id], w.y[id], w.fearX[id], w.fearY[id]) <= EFFECTS.charmStop * EFFECTS.charmStop) return;
    dx = -dx;
    dy = -dy;
  }
  let d = isqrt(dx * dx + dy * dy);
  if (d === 0) {
    dx = w.team[id] === 0 ? -1 : 1;
    dy = 0;
    d = 1;
  }
  const far = src >= 0 ? Math.min(MAP.navCell, d - EFFECTS.charmStop) : MAP.navCell;
  const tx = clamp(w.x[id] + idiv(dx * far, d), 0, MAP.width);
  const ty = clamp(w.y[id] + idiv(dy * far, d), 0, MAP.height);
  moveToward(w.x[id], w.y[id], tx, ty, applyBp(moveSpeed(w, id), EFFECTS.fearSpeedBp), w.moveCarry[id], TICK_HZ, out);
  if (w.kind[id] === Kind.Hero && !walkable(grid, cellOf(out[0], out[1]))) return;
  w.x[id] = out[0];
  w.y[id] = out[1];
  w.moveCarry[id] = out[2];
}
