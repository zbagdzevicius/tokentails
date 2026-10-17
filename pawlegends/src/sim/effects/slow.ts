/** `slow` (POC.md §4.4): the strongest slow applies; an equal one extends the duration. */
import { type World } from '../world';
import { ccImmune } from './status';

export function slow(w: World, id: number, bp: number, ticks: number): void {
  if (bp <= 0 || ticks <= 0 || ccImmune(w, id)) return;
  if (w.slowT[id] > 0 && bp < w.slowBp[id]) return;
  if (bp > w.slowBp[id]) w.slowT[id] = ticks;
  else w.slowT[id] = Math.max(w.slowT[id], ticks);
  w.slowBp[id] = bp;
}
