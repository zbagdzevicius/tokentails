/**
 * `tether` (POC.md §4.4, arena ring): an arena zone that the tethered units cannot leave while it lasts (Sir
 * Brutus's Champion's Challenge). Positions are clamped back inside after movement and dashes end inside.
 */
import { ZONE_KIND } from '../../data/effects';
import { idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { RANGE, type World } from '../world';
import { radiusOf } from '../units/kinds';
import { spawnZone } from './zone';

/** Open an arena of `radius` around `owner` for `ticks`, tethering `owner` and `foe`. Returns the zone or −1. */
export function startArena(w: World, owner: number, foe: number, radius: number, ticks: number): number {
  const z = spawnZone(w, ZONE_KIND.arena, w.team[owner], owner, w.x[owner], w.y[owner], radius, ticks, 0, foe);
  if (z < 0) return -1;
  w.tether[owner] = z;
  w.tether[foe] = z;
  return z;
}

/** Clamp (x, y) into `id`'s arena. Writes [x, y] to `out`. */
export function clampToArena(w: World, id: number, x: number, y: number, out: Int32Array): void {
  out[0] = x;
  out[1] = y;
  const z = w.tether[id];
  if (z < 0 || w.zAlive[z] === 0) return;
  const lim = w.zRadius[z] - radiusOf(w, id);
  const dx = x - w.zX[z];
  const dy = y - w.zY[z];
  const d2 = dx * dx + dy * dy;
  if (lim <= 0 || d2 <= lim * lim) return;
  const d = isqrt(d2);
  out[0] = w.zX[z] + idiv(dx * lim, d);
  out[1] = w.zY[z] + idiv(dy * lim, d);
}

const pos = new Int32Array(2);

/** After movement: drop tethers whose arena ended; pull tethered units back inside. */
export function clampTethers(m: MatchHandle): void {
  const w = m.world;
  for (let id = 0; id < RANGE.end; id++) {
    const z = w.tether[id];
    if (z < 0) continue;
    if (w.alive[id] === 0 || w.zAlive[z] === 0 || w.zKind[z] !== ZONE_KIND.arena) {
      w.tether[id] = -1;
      continue;
    }
    clampToArena(w, id, w.x[id], w.y[id], pos);
    w.x[id] = pos[0];
    w.y[id] = pos[1];
  }
}

/** End arena `z` and free everyone tethered to it. */
export function endArena(w: World, z: number): void {
  w.zAlive[z] = 0;
  for (let id = 0; id < RANGE.end; id++) if (w.tether[id] === z) w.tether[id] = -1;
}
