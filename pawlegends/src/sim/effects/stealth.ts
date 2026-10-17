/**
 * `stealth` (POC.md §4.4): hidden from the enemy team's snapshot and targeting unless an enemy unit is within
 * EFFECTS.stealthReveal or the unit is revealed (`mark`). Dealing damage breaks it (combat/damage.ts).
 */
import type { World } from '../world';

export function stealth(w: World, id: number, ticks: number): void {
  if (w.alive[id] === 0 || ticks <= 0) return;
  w.stealthT[id] = Math.max(w.stealthT[id], ticks);
}

export function breakStealth(w: World, id: number): void {
  w.stealthT[id] = 0;
}
