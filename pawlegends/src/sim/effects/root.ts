/** `root` (POC.md §4.4): no walking and no mobility casts; attacks and other casts still work. Stops a dash. */
import { FM, type World } from '../world';
import { ccImmune, drGrant } from './status';

/** Root an enemy (hard CC: sim v17 counts it toward the Steadfast cap). */
export function root(w: World, id: number, ticks: number): void {
  if (ticks <= 0 || ccImmune(w, id)) return;
  setRoot(w, id, drGrant(w, id, ticks));
}

/** Sim v17: a hero rooting itself (Pixel's E, Nugget's Sploot, Meatball's Loaf) is not CC and never counts. */
export function selfRoot(w: World, id: number, ticks: number): void {
  if (ticks <= 0 || ccImmune(w, id)) return;
  setRoot(w, id, ticks);
}

function setRoot(w: World, id: number, ticks: number): void {
  w.rootT[id] = Math.max(w.rootT[id], ticks);
  if (w.fmKind[id] !== FM.None && w.fmKind[id] !== FM.Knock) {
    w.fmT[id] = 0;
    w.fmKind[id] = FM.None;
    w.fmTarget[id] = -1;
  }
}
