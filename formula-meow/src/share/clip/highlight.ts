/**
 * Highlight score and clip plan (GDD 9.1). Pure: works on the race event log only, so it is unit tested and the clip
 * job can plan before it renders anything.
 *
 * Score over a sliding window: +2 per overtake by the player, +3 per item hit the player landed (+4 for a cucumber
 * leap), +2 per pink mini-turbo, +2 per trick. Windows that lose the player are penalised: −6 for a respawn or a hit
 * taken, −2 for a head-on wall (the clip should show the player winning, not tiny in the sand).
 *
 * Iteration 4 (F8): set pieces score too: a clean loop / wall ride / tunnel exit +3, a clean jump landing +3 plus one
 * per combo step (a STUNT COMBO ×3 landing is +5), entering a wall ride +1, a safety-net catch −2. A photo finish
 * adds +6 just before the finish shot, so the window runs into the duel for the line.
 */
import type { RaceEvent, RaceStats } from '../../types';
import { STUNT_BONUS } from '../../juice/stunts';

export const CLIP_FPS = 30;
export const INTRO_S = 1.5;
export const HIGHLIGHT_S = 7;
export const FINISH_S = 2;
/** sim seconds shown in the finish shot (0.4× slow motion over FINISH_S) */
export const FINISH_SIM_S = FINISH_S * 0.4;
export const END_S = 1.5;
export const CLIP_S = INTRO_S + HIGHLIGHT_S + FINISH_S + END_S; // 12

const HIT_LEAP = 1;
/** SET_PIECE_KINDS indices (types.ts): the `a` of stunt events */
const LOOP = 0;
const WALL = 1;
const JUMP = 2;
/** photo finish bonus (F8) */
export const PHOTO_SCORE = 6;

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
    case 'stuntExit':
      // a jump's clean exit comes with stuntLand (scored there)
      return e.kart === me && e.b === 1 && e.a !== JUMP ? 3 : 0;
    case 'stuntLand':
      return e.kart === me ? 3 : 0;
    case 'stuntEnter':
      return e.kart === me && e.a === WALL ? 1 : 0;
    case 'netCatch':
      return e.kart === me ? -2 : 0;
    default:
      return 0;
  }
}

/** A clean stunt for the combo rule (juice/stunts.ts): a clean loop, wall ride or tunnel exit, or a clean landing. */
function cleanStunt(e: RaceEvent): boolean {
  return (e.type === 'stuntExit' && e.b === 1 && e.a !== JUMP) || e.type === 'stuntLand';
}

export interface Scored {
  t: number;
  s: number;
}

/**
 * The player's scoring events with the combo bonus on clean landings (+1 per step past the first, with the juice
 * stunt tally's combo rule: clean stunts within `STUNT_BONUS.comboTicks` chain), plus the photo-finish bonus at
 * `photoTick` when there was one.
 */
export function scoredEvents(events: readonly RaceEvent[], me: number, photoTick: number | null = null): Scored[] {
  const out: Scored[] = [];
  let combo = 0;
  let last = -1e9;
  for (const e of events) {
    let sc = eventScore(e, me);
    if (e.kart === me && cleanStunt(e)) {
      combo = e.tick - last <= STUNT_BONUS.comboTicks ? combo + 1 : 1;
      last = e.tick;
      if (e.type === 'stuntLand') sc += combo - 1;
    }
    if (sc !== 0) out.push({ t: e.tick, s: sc });
  }
  if (photoTick != null) out.push({ t: photoTick, s: PHOTO_SCORE });
  return out;
}

/**
 * Start tick of the best `len`-tick window inside [lo, hi - len]. Ties keep the latest window (closer to the finish,
 * the race is tighter there). With no scoring events it is the window right before the finish shot.
 */
export function bestWindow(events: readonly RaceEvent[], me: number, lo: number, hi: number, len: number, photoTick: number | null = null): number {
  const last = hi - len;
  if (last <= lo) return lo;
  const scored = scoredEvents(events, me, photoTick).filter((x) => x.t >= lo && x.t < hi);
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
export function planClip(events: readonly RaceEvent[], me: number, goTick: number, endTick: number, opts: { photo?: boolean } = {}): ClipPlan {
  const fin = events.find((e) => e.type === 'finish' && e.kart === me);
  const finishTick = fin ? fin.tick : null;
  const fps = 60;
  const introTick = Math.max(0, goTick - Math.round(INTRO_S * fps));
  const hlLenWanted = Math.round(HIGHLIGHT_S * fps);
  const finishLead = Math.round(FINISH_SIM_S * fps * 0.5); // the line is crossed halfway: 1 s of FINISH! on screen
  const finishStart = finishTick != null ? Math.max(goTick, finishTick - finishLead) : null;
  const hiEdge = finishStart ?? endTick;
  const hlLen = Math.max(0, Math.min(hlLenWanted, hiEdge - goTick));
  // a photo finish: the duel for the line is the story, so the window leans into the last seconds before the finish
  const photoTick = opts.photo && finishStart != null ? finishStart - 1 : null;
  const hlStart = bestWindow(events, me, goTick, hiEdge, hlLen, photoTick);
  return { introTick, hlStart, hlLen, finishStart, finishTick };
}

/** A caption sticker burned into the clip (F8): shown from `tick` (sim) on, in its shot. */
export interface ClipSticker {
  text: string;
  tick: number;
  tone: 'pink' | 'cyan' | 'gold' | 'green';
}

/**
 * The highlight shot's sticker: the best stunt moment inside the window (a ×3+ combo beats a loop beats a ×2 combo
 * beats a wall ride beats a landing), else a burst of overtakes. Null when the window has nothing worth a sticker. English and upper case on
 * purpose: it is part of the video, like "FINISH!".
 */
export function highlightSticker(events: readonly RaceEvent[], me: number, from: number, to: number): ClipSticker | null {
  let best: { rank: number; s: ClipSticker } | null = null;
  const take = (rank: number, s: ClipSticker) => {
    if (!best || rank > best.rank) best = { rank, s };
  };
  let combo = 0;
  let last = -1e9;
  let passes = 0;
  let firstPass = -1;
  let loopIn = -1;
  for (const e of events) {
    if (e.kart !== me) continue;
    if (e.type === 'stuntEnter' && e.a === LOOP) loopIn = e.tick;
    const clean = cleanStunt(e);
    if (clean) {
      combo = e.tick - last <= STUNT_BONUS.comboTicks ? combo + 1 : 1;
      last = e.tick;
    }
    if (e.tick < from || e.tick >= to) continue;
    // a loop's sticker lands while the kart is upside down (half a second in), not after it
    const loopTick = loopIn >= 0 && e.tick - loopIn < 240 ? Math.max(from, loopIn + 30) : e.tick;
    // ×3 and up beat a loop; a ×2 (a loop and its landing) reads better as the loop itself
    if (clean && combo >= 3) take(4 + combo, { text: `STUNT COMBO ×${combo}`, tick: e.tick, tone: 'pink' });
    else if (e.type === 'stuntExit' && e.b === 1 && e.a === LOOP) take(5, { text: 'LOOP-DE-MEOW', tick: loopTick, tone: 'pink' });
    else if (clean && combo === 2) take(4, { text: 'STUNT COMBO ×2', tick: e.tick, tone: 'pink' });
    else if (e.type === 'stuntExit' && e.b === 1 && e.a === WALL) take(3, { text: 'WALL RIDE', tick: e.tick, tone: 'cyan' });
    else if (e.type === 'stuntLand') take(2, { text: 'NICE LANDING', tick: e.tick, tone: 'green' });
    else if (e.type === 'overtake') {
      if (firstPass < 0) firstPass = e.tick;
      passes++;
    }
  }
  if (passes >= 2) take(1, { text: `+${passes} PLACES`, tick: firstPass, tone: 'gold' });
  const b = best as { rank: number; s: ClipSticker } | null;
  return b ? b.s : null;
}

/** The finish shot's sticker: a photo finish with its real margin (the same `finishMargin` the results use). */
export function finishSticker(photoMargin: number | null, finishTick: number | null): ClipSticker | null {
  if (photoMargin == null || finishTick == null) return null;
  return { text: `PHOTO FINISH by ${photoMargin.toFixed(2)} s`, tick: finishTick, tone: 'gold' };
}

/**
 * Why this race deserves a clip (the clip button pulses with it), or null for a quiet race: a photo finish, a
 * STUNT COMBO ×3 or more, or a boost chain of ×4 or more. Loops alone never count: on Kitchen, Laundry, Café and
 * Rooftops every lap has to ride one, so they made every quiet race nag (playtest, iteration 4). This race only;
 * `key` is a `t()` key.
 */
export function hypeReason(
  stats: Pick<RaceStats, 'bestCombo' | 'loops'> | undefined,
  photo: boolean,
  /** the best boost chain (juice/boost-chain.ts `boostChainTally(...).best`); from ×4 it earns the pulse */
  bestChain = 0,
): { key: string; n?: number } | null {
  if (photo) return { key: 'That photo finish deserves a clip' };
  if (stats && stats.bestCombo >= 3) return { key: 'That ×{n} combo deserves a clip', n: stats.bestCombo };
  if (bestChain >= 4) return { key: 'That ×{n} chain deserves a clip', n: bestChain };
  return null;
}

/** The stunt brag for share texts ("3 loops, STUNT COMBO ×4 🌀"), or null when the race had no stunts. */
export function stuntBrag(stats: Pick<RaceStats, 'loops' | 'walls' | 'cleanLandings' | 'bestCombo'> | undefined): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (stats.loops) parts.push(`${stats.loops} loop${stats.loops === 1 ? '' : 's'}`);
  if (stats.walls) parts.push(`${stats.walls} wall ride${stats.walls === 1 ? '' : 's'}`);
  if (stats.cleanLandings) parts.push(`${stats.cleanLandings} clean landing${stats.cleanLandings === 1 ? '' : 's'}`);
  if (stats.bestCombo >= 2) parts.push(`STUNT COMBO ×${stats.bestCombo}`);
  if (!parts.length) return null;
  return `${parts.slice(0, 3).join(', ')} 🌀`;
}
