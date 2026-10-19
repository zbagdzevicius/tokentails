/**
 * Highlight score and clip plan (GDD 9.1). Pure: works on the race event log only, so it is unit tested and the clip
 * job can plan before it renders anything.
 *
 * Score over a sliding window: +2 per overtake by the player, +3 per item hit the player landed (+4 for a cucumber
 * leap), +2 per pink mini-turbo, +2 per trick. Windows that lose the player are penalised: −6 for a respawn or a hit
 * taken, −2 for a head-on wall (the clip should show the player winning, not tiny in the sand).
 */
import type { RaceEvent } from '../../types';

export const CLIP_FPS = 30;
export const INTRO_S = 1.5;
export const HIGHLIGHT_S = 7;
export const FINISH_S = 2;
/** sim seconds shown in the finish shot (0.4× slow motion over FINISH_S) */
export const FINISH_SIM_S = FINISH_S * 0.4;
export const END_S = 1.5;
export const CLIP_S = INTRO_S + HIGHLIGHT_S + FINISH_S + END_S; // 12

const HIT_LEAP = 1;

export function eventScore(e: RaceEvent, me: number): number {
  switch (e.type) {
    case 'overtake':
      return e.kart === me ? 2 : 0;
    case 'hit':
      if (e.kart === me && e.b !== me) return -6;
      return e.b === me && e.kart !== me ? (e.a === HIT_LEAP ? 4 : 3) : 0;
    case 'respawn':
      return e.kart === me ? -6 : 0;
    case 'wall':
      return e.kart === me && e.a === 2 ? -2 : 0;
    case 'miniTurbo':
      return e.kart === me && e.a === 3 ? 2 : 0;
    case 'trick':
      return e.kart === me ? 2 : 0;
    default:
      return 0;
  }
}

/**
 * Start tick of the best `len`-tick window inside [lo, hi - len]. Ties keep the latest window (closer to the finish,
 * the race is tighter there). With no scoring events it is the window right before the finish shot.
 */
export function bestWindow(events: readonly RaceEvent[], me: number, lo: number, hi: number, len: number): number {
  const last = hi - len;
  if (last <= lo) return lo;
  const scored = events.filter((e) => e.tick >= lo && e.tick < hi).map((e) => ({ t: e.tick, s: eventScore(e, me) })).filter((x) => x.s !== 0);
  let best = last;
  let bestS = -Infinity;
  // candidate starts: every 15 ticks, plus the last start
  for (let s = lo; s <= last; s += 15) {
    let sum = 0;
    for (const x of scored) if (x.t >= s && x.t < s + len) sum += x.s;
    if (sum >= bestS) {
      bestS = sum;
      best = s;
    }
  }
  let sum = 0;
  for (const x of scored) if (x.t >= last && x.t < last + len) sum += x.s;
  if (sum >= bestS) best = last;
  return best;
}

export interface ClipPlan {
  /** sim tick shown at the first intro frame */
  introTick: number;
  hlStart: number;
  hlLen: number;
  /** first sim tick of the slow-motion finish shot (null when the player did not finish) */
  finishStart: number | null;
  finishTick: number | null;
}

/** Plan the four shots. Ticks always run forward (the clip re-simulates once, in order). */
export function planClip(events: readonly RaceEvent[], me: number, goTick: number, endTick: number): ClipPlan {
  const fin = events.find((e) => e.type === 'finish' && e.kart === me);
  const finishTick = fin ? fin.tick : null;
  const fps = 60;
  const introTick = Math.max(0, goTick - Math.round(INTRO_S * fps));
  const hlLenWanted = Math.round(HIGHLIGHT_S * fps);
  const finishLead = Math.round(FINISH_SIM_S * fps * 0.5); // the line is crossed halfway: 1 s of FINISH! on screen
  const finishStart = finishTick != null ? Math.max(goTick, finishTick - finishLead) : null;
  const hiEdge = finishStart ?? endTick;
  const hlLen = Math.max(0, Math.min(hlLenWanted, hiEdge - goTick));
  const hlStart = bestWindow(events, me, goTick, hiEdge, hlLen);
  return { introTick, hlStart, hlLen, finishStart, finishTick };
}
