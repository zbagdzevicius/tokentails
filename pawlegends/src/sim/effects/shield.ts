/**
 * `shield` (POC.md §4.4), flat and frontal arc. A flat shield absorbs damage before HP (combat/damage.ts) and may
 * expire; `inFront` is the frontal-arc test used by Clem's The Stand (damage) and Sir Brutus's Front Guard
 * (projectiles).
 */
import { angleDiff, iatan2 } from '../fixed';
import type { World } from '../world';

/** A flat shield of `amount`, for `ticks` (0 = until used up). A bigger shield replaces a smaller one. */
export function addShield(w: World, id: number, amount: number, ticks: number): void {
  if (w.alive[id] === 0 || amount <= 0) return;
  if (amount >= w.shield[id]) {
    w.shield[id] = amount;
    w.shieldT[id] = ticks;
  }
}

/** Is (x, y) within the `arc` (full width, angle steps) in front of `id`'s facing? */
export function inFront(w: World, id: number, x: number, y: number, arc: number): boolean {
  if (x === w.x[id] && y === w.y[id]) return true;
  return Math.abs(angleDiff(w.facing[id], iatan2(y - w.y[id], x - w.x[id]))) * 2 <= arc;
}
