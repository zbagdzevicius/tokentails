/**
 * Clip plans per post format (GDD 7.5) and the household timeline (GDD 8, "Mochi vs Luna: who's worse?").
 * Pure: no DOM. Builds on planClip (the 12 s one-crime POV plan).
 */
import { TICK_HZ, type ClipPlan, type PlayableRoom, type RunResult, type ShareFormat } from '../../types';
import { formatThousands } from '../emoji-card';
import { catOrDefault } from './captions';
import {
  CLIP_FRAMES,
  DEFAULT_SHORT_URL,
  OPENER_FRAMES,
  TAIL_FRAMES,
  URL_FRAMES,
  bestCandidate,
  findCandidates,
  planClip,
  roomLabel,
} from './highlights';

export const ROOMBA_FRAMES = 180; // 6 s
export const SPLIT_SIZE = { w: 720, h: 640 } as const;
/** Roomba clip: the frame-up lands this many game frames after the match cut (1.8 s of setup, 1.2 s after). */
export const ROOMBA_LEAD_TICKS = 54;
export const HANDLE_MAX = 24;

/** "@Luna.Mom!!" -> "luna.mom" style handle text (letters, digits, '.', '_'; no '@'; <= 24). Empty when nothing is left. */
export function normalizeHandle(raw: string | undefined | null): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9._]/g, '')
    .slice(0, HANDLE_MAX);
  return s.replace(/^\.+|\.+$/g, '');
}

const catOr = catOrDefault;

/** Burned-in hook lines per format (GDD 7.3 caption templates, 7.5). */
export const FORMAT_HOOKS = {
  stitch: (owner: string) => (owner ? `I put @${owner}'s cat in my game` : 'I put your cat in my game'),
  reply: (cat: string) => `I put ${cat} in the game`,
  irl: () => 'My cat in real life vs. my cat in the game',
  roomba: () => 'Framed the Roomba. Again.',
  stillWaiting: (cat: string, shell: string) => `${cat} wrecked the ${shell}`,
  household: (a: string, b: string) => `${a} vs ${b}: who's worse?`,
} as const;

export function stillWaitingEndLine(cat: string, waiting: boolean, pronoun: 'Her' | 'His' | 'Their' = 'Her'): string {
  return waiting ? `${catOr(cat)} is still waiting` : `${catOr(cat)} went home. ${pronoun} crimes stay in the game.`;
}

export interface FormatPlanOptions {
  format?: ShareFormat;
  /** stitch: the owner's handle; reply: the commenter's handle. */
  handle?: string;
  captionStyle?: number;
  endLine?: string;
  music?: boolean;
  shortUrl?: string;
  /** still_waiting: adopted ("went home") instead of waiting. */
  adopted?: boolean;
}

/** First 'framed' event of the run, or null. */
export function firstFramed(r: RunResult): { tick: number; prop: number } | null {
  for (const e of r.events) if (e.t === 'framed') return { tick: e.tick, prop: e.prop };
  return null;
}

/** The 6 s Roomba plan: 2 s opener, 3 s around the frame-up at 1x, 1 s loop tail. Null when the run framed nobody. */
export function planRoomba(r: RunResult, play: PlayableRoom, catName: string, shortUrl = DEFAULT_SHORT_URL): ClipPlan | null {
  const f = firstFramed(r);
  if (!f) return null;
  const game = ROOMBA_FRAMES - OPENER_FRAMES - TAIL_FRAMES; // 90
  const matchCutTick = Math.max(0, f.tick - ROOMBA_LEAD_TICKS);
  const toTick = matchCutTick + game;
  let lookTick: number | undefined;
  for (const e of r.events)
    if (e.t === 'human' && (e.state === 'telegraph' || e.state === 'look') && e.tick >= matchCutTick && e.tick <= toTick) {
      lookTick = e.tick;
      break;
    }
  void catName;
  return {
    matchCutTick,
    crime: { prop: f.prop, fromTick: matchCutTick, breakTick: f.tick, toTick, lookTick },
    slowMo: { fromTick: f.tick, toTick: f.tick, speed: 1 },
    pick: 'default',
    hook: FORMAT_HOOKS.roomba(),
    urlLine: `${shortUrl} · ${roomLabel(play)}`,
    format: 'roomba',
    frames: ROOMBA_FRAMES,
  };
}

/**
 * Plan for a post format. 'pov' (and 'carousel', which is not a clip) is planClip as before. Every format keeps
 * the URL line in the last 2 s, except 'still_waiting', whose end line takes that place (URL stays in the watermark).
 */
export function planFormatClip(r: RunResult, play: PlayableRoom, catName: string, o: FormatPlanOptions = {}): ClipPlan {
  const shortUrl = o.shortUrl || DEFAULT_SHORT_URL;
  const fmt: ShareFormat = o.format ?? 'pov';
  const cat = catOr(catName);
  let plan: ClipPlan = planClip(r, play, cat, { shortUrl });
  const handle = normalizeHandle(o.handle);
  switch (fmt) {
    case 'stitch':
      plan.hook = FORMAT_HOOKS.stitch(handle);
      if (handle) plan.overlay = `@${handle}`;
      break;
    case 'reply':
      plan.hook = FORMAT_HOOKS.reply(cat);
      if (handle) plan.overlay = `Replying to @${handle}`;
      break;
    case 'irl_vs_game':
      plan.hook = FORMAT_HOOKS.irl();
      plan.size = { ...SPLIT_SIZE };
      plan.opener = undefined;
      break;
    case 'roomba': {
      const rp = planRoomba(r, play, cat, shortUrl);
      if (rp) plan = rp;
      else {
        // no frame-up in this run: a 6 s cut of the best crime, still Roomba-framed by the clip camera
        plan.frames = ROOMBA_FRAMES;
        plan.hook = FORMAT_HOOKS.roomba();
      }
      break;
    }
    case 'still_waiting':
      plan.hook = FORMAT_HOOKS.stillWaiting(cat, play.shell.name);
      plan.endLine = o.endLine ?? stillWaitingEndLine(cat, !o.adopted);
      break;
    default:
      break;
  }
  if (fmt !== 'still_waiting' && o.endLine) plan.endLine = o.endLine;
  plan.format = fmt === 'carousel' ? 'pov' : fmt;
  if (o.captionStyle) plan.captionStyle = o.captionStyle;
  if (o.music) plan.music = true;
  if (fmt === 'roomba' && plan.frames === undefined) plan.frames = ROOMBA_FRAMES;
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Household clip: title 1 s, cat A ~5 s, cat B ~5 s, scores 1 s (12 s, 360 frames)
// ---------------------------------------------------------------------------------------------

export const HOUSEHOLD_TITLE_FRAMES = 30;
export const HOUSEHOLD_SCORES_FRAMES = 30;
/** Frames rendered per cat pass (opener 2 s + game 3 s + tail 1 s); the segment uses source frames 30..179. */
export const HOUSEHOLD_PASS_FRAMES = 180;
export const HOUSEHOLD_SRC_FROM = 30;

export type HouseholdSegment =
  | { kind: 'title'; from: number; to: number }
  | { kind: 'cat'; index: 0 | 1; from: number; to: number; srcFrom: number; srcTo: number }
  | { kind: 'scores'; from: number; to: number };

/** Output frame ranges (inclusive) of the household clip. */
export function householdTimeline(): HouseholdSegment[] {
  const seg = HOUSEHOLD_PASS_FRAMES - HOUSEHOLD_SRC_FROM; // 150
  const a = HOUSEHOLD_TITLE_FRAMES;
  const b = a + seg;
  const c = b + seg;
  return [
    { kind: 'title', from: 0, to: a - 1 },
    { kind: 'cat', index: 0, from: a, to: b - 1, srcFrom: HOUSEHOLD_SRC_FROM, srcTo: HOUSEHOLD_PASS_FRAMES - 1 },
    { kind: 'cat', index: 1, from: b, to: c - 1, srcFrom: HOUSEHOLD_SRC_FROM, srcTo: HOUSEHOLD_PASS_FRAMES - 1 },
    { kind: 'scores', from: c, to: c + HOUSEHOLD_SCORES_FRAMES - 1 },
  ];
}

export const HOUSEHOLD_FRAMES = householdTimeline().reduce((m, s) => Math.max(m, s.to + 1), 0); // 360

/** Output frame for a cat pass's source frame, or -1 when that source frame is not used. */
export function householdOutFrame(index: 0 | 1, srcFrame: number): number {
  const s = householdTimeline().find((x) => x.kind === 'cat' && x.index === index) as Extract<HouseholdSegment, { kind: 'cat' }>;
  if (srcFrame < s.srcFrom || srcFrame > s.srcTo) return -1;
  return s.from + (srcFrame - s.srcFrom);
}

/** The per-cat 6 s pass plan: the best crime with a 3 s game part (1x, slow motion trimmed). */
export function planHouseholdPass(r: RunResult, play: PlayableRoom, catName: string, shortUrl = DEFAULT_SHORT_URL): ClipPlan {
  const base = planClip(r, play, catOr(catName), { shortUrl });
  const game = HOUSEHOLD_PASS_FRAMES - OPENER_FRAMES - TAIL_FRAMES; // 90
  const best = bestCandidate(findCandidates(r, play));
  const key = best ? best.breakTick : base.crime.breakTick;
  // land the crash two thirds into the game part; slow motion over the fall when there is one
  const slowFrom = best ? best.fallTick : key;
  const slowTo = best ? best.breakTick + 4 : key;
  const speed = best ? 0.5 : 1;
  const slowFrames = speed < 1 ? Math.ceil((slowTo - slowFrom) / speed) : 0;
  const pre = Math.max(0, Math.round(game * 0.6) - slowFrames);
  const matchCutTick = Math.max(0, slowFrom - pre);
  return {
    ...base,
    matchCutTick,
    crime: { ...base.crime, prop: best ? best.prop : base.crime.prop, fromTick: matchCutTick, breakTick: key, toTick: matchCutTick + game + slowFrames },
    slowMo: { fromTick: slowFrom, toTick: slowTo, speed },
    format: 'household',
    frames: HOUSEHOLD_PASS_FRAMES,
  };
}

/** The whole household clip plan (hook = title, frames 360); used for the gates and the URL line. */
export function planHousehold(a: { run: RunResult; name: string }, b: { run: RunResult; name: string }, play: PlayableRoom, shortUrl = DEFAULT_SHORT_URL): ClipPlan {
  const pa = planHouseholdPass(a.run, play, a.name, shortUrl);
  return {
    ...pa,
    hook: FORMAT_HOOKS.household(catOr(a.name), catOr(b.name)),
    format: 'household',
    frames: HOUSEHOLD_FRAMES,
  };
}

/** "Luna is worse 😼" / "Tie. Both are menaces." from the two scores. */
export function householdVerdict(a: { name: string; score: number }, b: { name: string; score: number }): string {
  if (a.score === b.score) return 'Tie. Both are menaces.';
  const w = a.score > b.score ? a : b;
  return `${catOr(w.name)} is worse 😼`;
}

export function householdScoreLine(c: { name: string; score: number }): string {
  return `${catOr(c.name)} ${formatThousands(c.score)}`;
}

/** Caption shown at an output frame of the household clip (title, suspect lines, verdict; URL in the last 2 s). */
export function householdCaption(frame: number, a: { name: string; score: number }, b: { name: string; score: number }, plan: ClipPlan): string {
  const t = householdTimeline();
  if (frame >= HOUSEHOLD_FRAMES - URL_FRAMES) return plan.urlLine;
  const seg = t.find((s) => frame >= s.from && frame <= s.to);
  if (!seg || seg.kind === 'title') return plan.hook;
  if (seg.kind === 'cat') return seg.index === 0 ? `Suspect 1: ${catOr(a.name)}` : `Suspect 2: ${catOr(b.name)}`;
  return householdVerdict(a, b);
}

/** Seconds of the run for the POV hook (40 s FTUE, 75 s ranked). */
export function runSeconds(play: PlayableRoom, r: RunResult): number {
  return play.mode === 'ftue' ? 40 : Math.round((play.room.ticks || r.ticks) / TICK_HZ) || 75;
}

export { CLIP_FRAMES };
