/**
 * `buff` (POC.md §4.4): attack speed, move speed (haste) and cooldown rate. The strongest active buff of each kind
 * applies; an equal one extends the duration.
 */
import type { World } from '../world';

function strongest(t: Int32Array, b: Int32Array, id: number, bp: number, ticks: number): void {
  if (bp <= 0 || ticks <= 0) return;
  if (t[id] > 0 && bp < b[id]) return;
  if (bp > b[id]) t[id] = ticks;
  else t[id] = Math.max(t[id], ticks);
  b[id] = bp;
}

export function haste(w: World, id: number, bp: number, ticks: number): void {
  if (w.alive[id] === 1) strongest(w.hasteT, w.hasteBp, id, bp, ticks);
}

export function attackSpeed(w: World, id: number, bp: number, ticks: number): void {
  if (w.alive[id] === 1) strongest(w.asT, w.asBp, id, bp, ticks);
}

export function cooldownRate(w: World, id: number, bp: number, ticks: number): void {
  if (w.alive[id] === 1) strongest(w.cdrT, w.cdrBp, id, bp, ticks);
}
