/**
 * One-crime clip planner (GDD 7.3): tension, not points.
 *
 * Candidates are falls of Must-Wreck targets or fragile props. Each gets a 7 s window that ends 1.5 s after the
 * break. Tension = peak suspicion in the 3 s before the fall (0..100) + a froze-in-cone bonus + the largest bonus
 * for "turned too late" (a LOOK that starts ≤ 12 ticks after the prop left the surface). Ties go to the earliest
 * candidate; with no tension at all the first Must-Wreck target wins. A caught run ends on the cuddle instead of the
 * slow motion.
 *
 * Pure: no DOM, no sim import. Works only from RunResult.events and the PlayableRoom.
 */
import {
  CUDDLE_TICKS,
  FALL_TICKS,
  TICK_HZ,
  propKind,
  type ClipPlan,
  type PlayableRoom,
  type RunResult,
  type SimEvent,
} from '../../types';
import { hookFor } from './captions';

// ---------------------------------------------------------------------------------------------
// Clip timeline (12 s at 30 fps = 360 frames)
// ---------------------------------------------------------------------------------------------

export const CLIP_FPS = 30;
export const CLIP_FRAMES = 360;
/** 0.0–2.0 s: opener (real cat photo) or the game close-up. */
export const OPENER_FRAMES = 60;
/** 11.0–12.0 s: cut back to the first frame's framing (seamless loop). */
export const LOOP_FROM_FRAME = 330;
/** 10.0–12.0 s: URL line replaces the hook caption. */
export const URL_FROM_FRAME = 300;
/** Watermark from 1.0 s (0–1 s has no UI). */
export const WATERMARK_FROM_FRAME = 30;
/** Loop tail (cut back to the first frame's framing): the last 1 s of any clip length. */
export const TAIL_FRAMES = 30;
/** The URL line: the last 2 s of any clip length. */
export const URL_FRAMES = 60;
/** Shortest clip the render pass accepts (opener + tail + one game frame). */
export const MIN_CLIP_FRAMES = OPENER_FRAMES + TAIL_FRAMES + 1;

/** Total frames of a plan (default 360 = 12 s; 'roomba' = 180). Same rule as render's `clipFrames`. */
export function planFrames(plan: Pick<ClipPlan, 'frames'>): number {
  const n = plan.frames;
  if (typeof n !== 'number' || !Number.isFinite(n)) return CLIP_FRAMES;
  return Math.max(MIN_CLIP_FRAMES, Math.floor(n));
}
/** First frame of the loop tail (330 for 12 s, 150 for 6 s). */
export function loopFromFrame(plan: Pick<ClipPlan, 'frames'>): number {
  return planFrames(plan) - TAIL_FRAMES;
}
/** First frame of the URL line / end line (300 for 12 s, 120 for 6 s). */
export function urlFromFrame(plan: Pick<ClipPlan, 'frames'>): number {
  return planFrames(plan) - URL_FRAMES;
}
/** Game frames between the match cut and the loop cut (270 for 12 s, 90 for 6 s). */
export function gameFramesOf(plan: Pick<ClipPlan, 'frames'>): number {
  return planFrames(plan) - OPENER_FRAMES - TAIL_FRAMES;
}
/** Output size of a plan (default 720 x 1280). */
export function planSize(plan: Pick<ClipPlan, 'size'>): { w: number; h: number } {
  const s = plan.size;
  return s && s.w > 0 && s.h > 0 ? { w: Math.floor(s.w), h: Math.floor(s.h) } : { w: 720, h: 1280 };
}
/** Last sim tick the game part of the clip shows (for the audio mix). */
export function planEndTick(plan: ClipPlan): number {
  return Math.ceil(clipFrameTick(plan, loopFromFrame(plan) - 1));
}
/** Game frames between the match cut and the loop cut. */
export const GAME_FRAMES = LOOP_FROM_FRAME - OPENER_FRAMES; // 270
export const SLOW_SPEED = 0.35;

/** Candidate window: 7 s ending 1.5 s after the break. */
export const WINDOW_TICKS = 7 * TICK_HZ;
export const AFTER_BREAK_TICKS = (3 * TICK_HZ) / 2; // 45
/** Peak suspicion is read over the 3 s before the fall. */
export const BEFORE_FALL_TICKS = 3 * TICK_HZ;
/** "Turned too late": LOOK start ≤ 12 ticks (0.4 s) after the prop left the surface. */
export const TURN_LATE_MAX_TICKS = 12;
/** Slow motion keeps running this many ticks past the break (the crash). */
export const SLOW_TAIL_TICKS = 6;
/** Round 3: a crime with tension under this slides its window to the next turn, if one starts soon after. */
export const LOW_TENSION = 25;
/** ...when that TELEGRAPH starts at most this long after the break (4 s). */
export const TURN_SEARCH_TICKS = 4 * TICK_HZ;
/** ...and the window then ends this long after the LOOK starts (1.0 s): the clip gets its "he turns" beat. */
export const AFTER_LOOK_TICKS = TICK_HZ;

/**
 * Low-tension crime (nobody near the turn): slide the window forward to the next TELEGRAPH → LOOK when the
 * telegraph starts within TURN_SEARCH_TICKS of the break; the window then ends AFTER_LOOK_TICKS after the LOOK
 * starts and still opens before the fall. Returns the new { fromTick, toTick } or null.
 */
export function slideToTurn(events: readonly SimEvent[], c: { fallTick: number; breakTick: number }): { fromTick: number; toTick: number } | null {
  let tg = -1;
  for (const e of events) {
    if (e.t !== 'human') continue;
    if (tg < 0) {
      if (e.state === 'telegraph' && e.tick >= c.breakTick && e.tick <= c.breakTick + TURN_SEARCH_TICKS) tg = e.tick;
      else if (e.tick > c.breakTick + TURN_SEARCH_TICKS) return null;
    } else if (e.state === 'look') {
      const toTick = e.tick + AFTER_LOOK_TICKS;
      return { fromTick: Math.max(0, Math.min(toTick - WINDOW_TICKS, c.fallTick - 15)), toTick };
    } else if (e.state !== 'telegraph') {
      tg = -1; // a fake-out: keep looking for a real turn inside the search span
    }
  }
  return null;
}

/** First TELEGRAPH or LOOK start inside [fromTick, toTick] (the human turns on camera), else undefined. */
export function turnInWindow(events: readonly SimEvent[], fromTick: number, toTick: number): number | undefined {
  for (const e of events) if (e.t === 'human' && (e.state === 'telegraph' || e.state === 'look') && e.tick >= fromTick && e.tick <= toTick) return e.tick;
  return undefined;
}

export const TENSION = {
  frozeBonus: 25,
  turnedLateBonus: 200,
} as const;

export interface CrimeCandidate {
  prop: number;
  fallTick: number;
  breakTick: number;
  fromTick: number;
  toTick: number;
  target: boolean;
  /** Peak suspicion in milli-units in the 3 s before the fall. */
  peak: number;
  froze: boolean;
  /** Ticks between the fall and the LOOK start, when the human turned too late. */
  turnGapTicks?: number;
  caughtInWindow: boolean;
  tension: number;
  /** Level the prop fell from (L2/L3 falls read best on camera). */
  fromLevel?: number;
  /** How it landed (round 2: break x3, spill x2, land x1). */
  outcome?: 'break' | 'spill' | 'land';
}

/**
 * Review round 1: the clip prefers the long falls and the Must-Wreck targets. Weight x2 for a fall from L2/L3,
 * x2 for a target; the choice score is (tension + 1) x weight.
 */
export function crimeWeight(c: Pick<CrimeCandidate, 'target' | 'fromLevel' | 'outcome'>): number {
  return ((c.fromLevel ?? 0) >= 2 ? 2 : 1) * (c.target ? 2 : 1) * OUTCOME_WEIGHT[c.outcome ?? 'break'];
}

/** Round 2 (QA): a shatter beats a spill beats a soft landing (the first-run clip showed a toilet roll landing). */
export const OUTCOME_WEIGHT: Readonly<Record<'break' | 'spill' | 'land', number>> = { break: 3, spill: 2, land: 1 };
const choiceScore = (c: CrimeCandidate): number => (c.tension + 1) * crimeWeight(c);

function isLanding(e: SimEvent): e is Extract<SimEvent, { t: 'break' | 'land' | 'spill' | 'hit' }> {
  return e.t === 'break' || e.t === 'land' || e.t === 'spill';
}

function caughtTickOf(r: RunResult): number {
  for (const e of r.events) if (e.t === 'caught') return e.tick;
  return r.stamp === 'caught' ? Math.max(0, r.ticks - CUDDLE_TICKS) : -1;
}

/** Every fall of a target or fragile prop, scored for tension. Sorted by fall tick. */
export function findCandidates(r: RunResult, play: PlayableRoom): CrimeCandidate[] {
  const ev = r.events;
  const caughtTick = caughtTickOf(r);
  const out: CrimeCandidate[] = [];
  const seenProp = new Set<number>();
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.t !== 'fall') continue;
    if (seenProp.has(e.prop)) continue;
    const place = play.room.props[e.prop];
    if (!place) continue;
    const def = propKind(place.kind);
    const target = place.target === true;
    if (!target && !(def && def.fragile)) continue;
    seenProp.add(e.prop);

    let breakTick = -1;
    let outcome: 'break' | 'spill' | 'land' = def?.onLand ?? 'break';
    for (let j = i + 1; j < ev.length; j++) {
      const l = ev[j];
      if (isLanding(l) && l.prop === e.prop) {
        breakTick = l.tick;
        outcome = l.t as 'break' | 'spill' | 'land';
        break;
      }
    }
    if (breakTick < 0) breakTick = e.tick + (FALL_TICKS[e.from]?.[0] || 13);

    const toTick = breakTick + AFTER_BREAK_TICKS;
    const fromTick = Math.max(0, toTick - WINDOW_TICKS);
    const peakFrom = e.tick - BEFORE_FALL_TICKS;

    let peak = 0;
    let firstSeen = -1;
    let froze = false;
    let turnGap: number | undefined;
    for (const x of ev) {
      if (x.t === 'seen') {
        if (x.tick >= peakFrom && x.tick <= e.tick && x.suspicion > peak) peak = x.suspicion;
        if (x.tick >= fromTick && x.tick <= toTick && firstSeen < 0) firstSeen = x.tick;
      } else if (x.t === 'loaf') {
        if (firstSeen >= 0 && x.tick >= firstSeen && x.tick <= toTick) froze = true;
      } else if (x.t === 'human' && x.state === 'look' && turnGap === undefined) {
        const gap = x.tick - e.tick;
        if (gap >= 0 && gap <= TURN_LATE_MAX_TICKS) turnGap = gap;
      }
    }
    const caughtInWindow = caughtTick >= fromTick && caughtTick <= toTick;
    if (caughtInWindow) froze = false; // froze AND got away

    let tension = Math.floor(peak / 1000);
    if (caughtInWindow) tension = Math.floor(tension / 2);
    if (froze) tension += TENSION.frozeBonus;
    if (turnGap !== undefined) tension += TENSION.turnedLateBonus + (TURN_LATE_MAX_TICKS - turnGap);

    out.push({
      prop: e.prop,
      fallTick: e.tick,
      breakTick,
      fromTick,
      toTick,
      target,
      peak,
      froze,
      turnGapTicks: turnGap,
      caughtInWindow,
      tension,
      fromLevel: e.from,
      outcome,
    });
  }
  out.sort((a, b) => a.fallTick - b.fallTick);
  return out;
}

/** Highest (tension + 1) x crimeWeight, earliest on ties; null when there are no candidates. */
export function bestCandidate(cands: readonly CrimeCandidate[]): CrimeCandidate | null {
  let best: CrimeCandidate | null = null;
  for (const c of cands) {
    if (!best) {
      best = c;
      continue;
    }
    const a = choiceScore(c);
    const b = choiceScore(best);
    if (a > b || (a === b && c.fallTick < best.fallTick)) best = c;
  }
  return best;
}

/** "Kitchen #18" from the title, "The Glass", or the shell name. */
export function roomLabel(play: PlayableRoom): string {
  const room = play.room;
  if (room.id === 'glass') return 'The Glass';
  if (room.title) {
    const head = room.title.split(':')[0].trim();
    if (head) return head;
  }
  if (play.dayNo !== undefined && play.dayNo < 1) return `${play.shell.name} Preview`;
  return play.dayNo ? `${play.shell.name} #${play.dayNo}` : play.shell.name;
}

export const DEFAULT_SHORT_URL = 'tokentails.com/badcat';

export interface PlanOptions {
  shortUrl?: string;
}

/** Plan the 12 s clip for a run (GDD 7.3). The plan carries the run's sim version (the clip pass replays on it). */
export function planClip(r: RunResult, play: PlayableRoom, catName: string, opts: PlanOptions = {}): ClipPlan {
  const plan = planClipCore(r, play, catName, opts);
  if (typeof r.simVersion === 'number') plan.simVersion = r.simVersion;
  return plan;
}

function planClipCore(r: RunResult, play: PlayableRoom, catName: string, opts: PlanOptions): ClipPlan {
  const shortUrl = opts.shortUrl || DEFAULT_SHORT_URL;
  const urlLine = `${shortUrl} · ${roomLabel(play)}`;
  const cands = findCandidates(r, play);
  const caughtTick = caughtTickOf(r);
  const runSeconds = play.mode === 'ftue' ? 40 : Math.round((play.room.ticks || r.ticks) / TICK_HZ) || 75;

  if (caughtTick >= 0) {
    // The cuddle is the payoff: the window ends when the cuddle ends, no slow motion.
    const toTick = caughtTick + CUDDLE_TICKS;
    const near = bestCandidate(cands.filter((c) => c.breakTick <= caughtTick && c.breakTick >= toTick - WINDOW_TICKS));
    const matchCutTick = Math.max(0, toTick - GAME_FRAMES);
    return withTurn(r.events, {
      matchCutTick,
      crime: {
        prop: near ? near.prop : -1,
        fromTick: Math.max(0, toTick - WINDOW_TICKS),
        breakTick: near ? near.breakTick : caughtTick,
        toTick,
        turnGapTicks: near?.turnGapTicks,
      },
      slowMo: { fromTick: caughtTick, toTick: caughtTick, speed: 1 },
      pick: near && near.turnGapTicks !== undefined ? 'turned_late' : near && near.tension > 0 ? 'tension' : 'default',
      hook: hookFor('caught', catName, { seconds: runSeconds }),
      urlLine,
    });
  }

  const chosen = bestCandidate(cands);
  let pick: ClipPlan['pick'] = 'default';
  if (chosen && chosen.tension > 0) pick = chosen.turnGapTicks !== undefined ? 'turned_late' : 'tension';

  if (!chosen) {
    // No falls: the first Must-Wreck target's push, else the cat in the middle of the run.
    let pushTick = -1;
    let prop = -1;
    for (const e of r.events) {
      if (e.t === 'push' && play.room.props[e.prop]?.target) {
        pushTick = e.tick;
        prop = e.prop;
        break;
      }
    }
    const breakTick = pushTick >= 0 ? pushTick + 15 : Math.max(WINDOW_TICKS, Math.floor(r.ticks / 2));
    const toTick = breakTick + AFTER_BREAK_TICKS;
    return {
      matchCutTick: Math.max(0, toTick - GAME_FRAMES),
      crime: { prop, fromTick: Math.max(0, toTick - WINDOW_TICKS), breakTick, toTick },
      slowMo: { fromTick: breakTick, toTick: breakTick, speed: 1 },
      pick: 'default',
      hook: hookFor(play.room.id === 'glass' ? 'glass' : 'pov', catName, { seconds: runSeconds }),
      urlLine,
    };
  }

  let fromTick = chosen.fromTick;
  let toTick = chosen.toTick;
  if (chosen.tension < LOW_TENSION && chosen.turnGapTicks === undefined) {
    const slid = slideToTurn(r.events, chosen);
    if (slid) ({ fromTick, toTick } = slid);
  }
  const slowFrom = chosen.fallTick;
  const slowTo = chosen.breakTick + SLOW_TAIL_TICKS;
  const slowFrames = Math.ceil((slowTo - slowFrom) / SLOW_SPEED);
  const after = Math.max(0, toTick - slowTo);
  const pre = Math.max(0, GAME_FRAMES - slowFrames - after);
  const matchCutTick = Math.max(0, slowFrom - pre);

  const kind = pick === 'turned_late' ? 'turned_late' : r.stamp === 'perfect' ? 'perfect' : play.room.id === 'glass' ? 'glass' : 'pov';
  return withTurn(r.events, {
    matchCutTick,
    crime: {
      prop: chosen.prop,
      fromTick,
      breakTick: chosen.breakTick,
      toTick,
      turnGapTicks: chosen.turnGapTicks,
    },
    slowMo: { fromTick: slowFrom, toTick: slowTo, speed: SLOW_SPEED },
    pick,
    hook: hookFor(kind, catName, { seconds: runSeconds, gapTicks: chosen.turnGapTicks }),
    urlLine,
  });
}

/**
 * Round 3: the human joins the follow shot when he turns anywhere in the clip's game part (match cut → loop cut),
 * not only inside the crime window: a clip that runs on past the crime catches him turning around.
 */
function withTurn(events: readonly SimEvent[], plan: ClipPlan): ClipPlan {
  const end = Math.max(plan.crime.toTick, Math.ceil(clipFrameTick(plan, loopFromFrame(plan) - 1)));
  const t = turnInWindow(events, Math.min(plan.matchCutTick, plan.crime.fromTick), end);
  if (t !== undefined) plan.crime.lookTick = t;
  return plan;
}

/**
 * Sim tick (fractional) shown at clip frame `frame`. Frames before the match cut and the loop tail (the last 30
 * frames of `plan.frames`) hold `matchCutTick`; the game part runs at 1× except inside `slowMo`. Monotonic over the
 * game part. Agrees with render's `clipFrameToTick` for any frame count.
 */
export function clipFrameTick(plan: ClipPlan, frame: number): number {
  if (frame < OPENER_FRAMES || frame >= loopFromFrame(plan)) return plan.matchCutTick;
  const g = frame - OPENER_FRAMES;
  const start = plan.matchCutTick;
  const { fromTick, toTick, speed } = plan.slowMo;
  if (speed >= 1 || speed <= 0 || toTick <= fromTick || toTick <= start) return start + g;
  const slowStart = Math.max(start, fromTick);
  const pre = slowStart - start;
  if (g <= pre) return start + g;
  const slowFrames = (toTick - slowStart) / speed;
  const gs = g - pre;
  if (gs <= slowFrames) return slowStart + gs * speed;
  return toTick + (gs - slowFrames);
}
