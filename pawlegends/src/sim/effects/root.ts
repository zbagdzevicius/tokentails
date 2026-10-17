/** `root` (POC.md §4.4): no walking and no mobility casts; attacks and other casts still work. Stops a dash. */
import { FM, type World } from '../world';
import { ccImmune } from './status';

export function root(w: World, id: number, ticks: number): void {
  if (ticks <= 0 || ccImmune(w, id)) return;
  w.rootT[id] = Math.max(w.rootT[id], ticks);
  if (w.fmKind[id] !== FM.None && w.fmKind[id] !== FM.Knock) {
    w.fmT[id] = 0;
    w.fmKind[id] = FM.None;
    w.fmTarget[id] = -1;
  }
}
