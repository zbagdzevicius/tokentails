/** `stun` (POC.md §4.4): no moving, attacking or casting; cancels windups, casts, Nap, dashes and Snack Break. */
import { ccImmune, drGrant, interrupt } from './status';
import type { World } from '../world';

export function stun(w: World, id: number, ticks: number): void {
  if (ticks <= 0 || ccImmune(w, id)) return;
  // Sim v17 Steadfast: counted toward the CC cap (heroes).
  w.stunT[id] = Math.max(w.stunT[id], drGrant(w, id, ticks));
  interrupt(w, id, true);
}
