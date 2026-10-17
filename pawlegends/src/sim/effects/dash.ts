/**
 * `dash` (POC.md §4.4) and the forced-movement engine knockbacks share: a unit travels to a destination over a fixed
 * number of ticks (the last step lands exactly), cannot walk or attack meanwhile, and stops short of walls, the map
 * edge and its arena. Kits hook every dash tick (hits along the path) through `fmKind = FM.Dash`.
 */
import { EFFECTS } from '../../data/effects';
import { MAP } from '../../data/map';
import { TICK_HZ } from '../../data/timeline';
import { clamp, icos, idiv, isin, isqrt, TRIG_ONE } from '../fixed';
import { cellOf, walkable } from '../map/grid';
import type { MatchHandle } from '../state';
import { FM, type World } from '../world';
import { clampToArena } from './tether';

const pos = new Int32Array(2);

/**
 * The furthest point toward (bx, by) that `id` can reach in a straight line: clamped to the map and its arena, cut
 * at the first blocked nav cell (sampled every EFFECTS.wallStep). A unit already on a blocked cell is not cut.
 */
export function clipTravel(m: MatchHandle, id: number, bx: number, by: number, out: Int32Array): void {
  const w = m.world;
  const ax = w.x[id];
  const ay = w.y[id];
  clampToArena(w, id, clamp(bx, 0, MAP.width), clamp(by, 0, MAP.height), pos);
  const tx = pos[0];
  const ty = pos[1];
  out[0] = tx;
  out[1] = ty;
  if (!walkable(m.grid, cellOf(ax, ay))) return;
  const dx = tx - ax;
  const dy = ty - ay;
  const len = isqrt(dx * dx + dy * dy);
  const n = idiv(len, EFFECTS.wallStep) + 1;
  for (let k = 1; k <= n; k++) {
    const sx = ax + idiv(dx * k, n);
    const sy = ay + idiv(dy * k, n);
    if (!walkable(m.grid, cellOf(sx, sy))) {
      out[0] = ax + idiv(dx * (k - 1), n);
      out[1] = ay + idiv(dy * (k - 1), n);
      return;
    }
  }
}

/** Ticks to cover `dist` at `speed` mm/s (at least 1). */
export const travelTicks = (dist: number, speed: number): number => Math.max(1, idiv(dist * TICK_HZ + speed - 1, speed));

/** Start forced movement of `id` to (tx, ty) over `ticks`. */
export function startForced(w: World, id: number, tx: number, ty: number, ticks: number, kind: number): void {
  w.fmX[id] = tx;
  w.fmY[id] = ty;
  w.fmT[id] = Math.max(1, ticks);
  w.fmKind[id] = kind;
  w.fmHitLo[id] = 0;
  w.fmHitHi[id] = 0;
  w.windup[id] = 0;
  w.pathLen[id] = 0;
}

const end = new Int32Array(2);

/** Dash `id` up to `dist` toward `angle` at `speed`. Returns the dash ticks (0 when it cannot move). */
export function dash(m: MatchHandle, id: number, angle: number, dist: number, speed = EFFECTS.dashSpeed): number {
  const w = m.world;
  const bx = w.x[id] + idiv(icos(angle) * dist, TRIG_ONE);
  const by = w.y[id] + idiv(isin(angle) * dist, TRIG_ONE);
  clipTravel(m, id, bx, by, end);
  const dx = end[0] - w.x[id];
  const dy = end[1] - w.y[id];
  const len = isqrt(dx * dx + dy * dy);
  w.facing[id] = angle;
  const ticks = travelTicks(Math.max(len, 1), speed);
  startForced(w, id, end[0], end[1], ticks, FM.Dash);
  return ticks;
}

/**
 * One tick of forced movement. Returns true on the tick it lands; Dash and Knock then end (`fmKind` = None), a
 * homing dash (FM.Hunt) stays active until its kit ends it. `fmKind !== FM.None` means "in forced movement".
 */
export function stepForced(w: World, id: number): boolean {
  const n = w.fmT[id];
  if (n <= 0) return false;
  w.x[id] += idiv(w.fmX[id] - w.x[id], n);
  w.y[id] += idiv(w.fmY[id] - w.y[id], n);
  w.fmT[id] = n - 1;
  if (n === 1) {
    w.x[id] = w.fmX[id];
    w.y[id] = w.fmY[id];
    w.moveX[id] = w.x[id];
    w.moveY[id] = w.y[id];
    if (w.fmKind[id] !== FM.Hunt) {
      w.fmKind[id] = FM.None;
      w.moveCarry[id] = 0;
    }
    return true;
  }
  return false;
}
