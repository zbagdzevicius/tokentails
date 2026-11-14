/**
 * Automatic highlights (docs/plans/moba/HIGHLIGHTS.md): the data shapes and every threshold as a frozen constant.
 * Units: ticks (30 a second) and mm. Pure; no sim import (the detector runs in the sim Worker, the results strip and the
 * viewer read these types on the main thread).
 */

export { DETECTOR_V } from './version';

/** The probe runs every SAMPLE ticks (6 Hz); positions are kept at 1 Hz for the camera keys. */
export const SAMPLE = 5;
export const HZ = 30;

export type HighlightType =
  | 'multikill'
  | 'ace'
  | 'teamfight'
  | 'shutdown'
  | 'firstBlood'
  | 'kaboom'
  | 'strike'
  | 'bossDown'
  | 'finale'
  | 'clutch'
  | 'steal'
  | 'dive'
  | 'comeback'
  | 'minionDeath'
  | 'towerDeath'
  | 'campDeath'
  | 'diveFail'
  | 'wallPounce'
  | 'boing'
  | 'returnToSender'
  | 'fumble'
  | 'ultOnMinion'
  | 'overkill'
  | 'napFail'
  | 'clipKind'
  | 'botBlunder'
  | 'pingSpam'
  | 'emoteSpam';

export type HighlightCategory = 'epic' | 'teamfight' | 'clutch' | 'objective' | 'funny' | 'story';

/** One camera key: tick, x and y in units of 100 mm (sim coordinates), radius in 100 mm. */
export type CamKey = [tick: number, x: number, y: number, r: number];

/**
 * The director camera: `follow` a hero slot (the keys are that hero's spots, used while it is fogged or not the
 * player), or `frame` a moving fight (centre + radius once every KEY_EVERY ticks).
 */
export type HighlightCam = { mode: 'follow'; slot: number; keys: CamKey[] } | { mode: 'frame'; keys: CamKey[] };

export interface Highlight {
  /** `${type}:${start}` */
  id: string;
  type: HighlightType;
  category: HighlightCategory;
  /** Ticks. */
  start: number;
  end: number;
  peak: number;
  /** 0..100 (`score` ranks the reel, `funny` the Funniest slot). */
  score: number;
  funny: number;
  /** ≤ TITLE_MAX characters. */
  title: string;
  /** ≤ SUB_MAX characters. */
  sub: string;
  /** Hero slots. */
  actors: number[];
  victims: number[];
  /** The team credited (−1 none). */
  side: 0 | 1 | -1;
  mine: 'actor' | 'involved' | 'none';
  /** An actor is a bot. */
  bots: boolean;
  cam: HighlightCam;
  tags: string[];
}

export interface HighlightReel {
  v: 1;
  detector: number;
  simVersion: number;
  /** The record key (`seed:finalHash:ticks`), the cache check. */
  key: string;
  /** ≤ LIST_MAX highlights, chronological. */
  list: Highlight[];
  /** ≤ 3 ids, best first (top[0] is the Legend Moment). */
  top: string[];
  funniest: string | null;
  /** 3..5 ids in match order, or [] (fewer than 3 highlights). */
  montage: string[];
}

export const CATEGORY: Readonly<Record<HighlightType, HighlightCategory>> = Object.freeze({
  multikill: 'epic',
  ace: 'epic',
  teamfight: 'teamfight',
  shutdown: 'epic',
  firstBlood: 'story',
  kaboom: 'epic',
  strike: 'epic',
  bossDown: 'objective',
  finale: 'story',
  clutch: 'clutch',
  steal: 'objective',
  dive: 'epic',
  comeback: 'story',
  minionDeath: 'funny',
  towerDeath: 'funny',
  campDeath: 'funny',
  diveFail: 'funny',
  wallPounce: 'funny',
  boing: 'funny',
  returnToSender: 'epic',
  fumble: 'funny',
  ultOnMinion: 'funny',
  overkill: 'funny',
  napFail: 'funny',
  clipKind: 'funny',
  botBlunder: 'funny',
  pingSpam: 'funny',
  emoteSpam: 'funny',
});

/** Thresholds (HIGHLIGHTS.md §2). */
export const RULES = Object.freeze({
  /** Default window around the trigger. */
  preRoll: 3 * HZ,
  postRoll: 2 * HZ,
  /** A multikill chain: each kill within this of the last (the announcer's WINDOW.multikill). */
  multikillGap: 240,
  multikillPre: 4 * HZ,
  multikillScore: Object.freeze({ 2: 40, 3: 70, 4: 85, 5: 100 }) as Readonly<Record<number, number>>,
  acePre: 8 * HZ,
  aceOurs: 75,
  aceTheirs: 45,
  shutdownPre: 5 * HZ,
  shutdownBase: 45,
  shutdownCap: 65,
  firstBloodPre: 5 * HZ,
  firstBlood: 25,
  kaboom: 55,
  kaboomPre: 2 * HZ,
  strikeMin: 3,
  strikePre: 2 * HZ,
  bossDown: 80,
  bossPre: 10 * HZ,
  finale: 30,
  finaleLen: 12 * HZ,
  // teamfight (§2.2)
  fightEvery: 15,
  engagedWindow: 90,
  fightRadius: 12_000,
  fightKeepRadius: 15_000,
  fightQuiet: 120,
  fightMinTicks: 90,
  fightDamagePct: 30,
  fightLeadPct: 15,
  fightPre: 2 * HZ,
  fightPost: 2 * HZ,
  // clutch, steals, dives, comebacks (§2.3)
  clutchPct: 15,
  clutchDeepPct: 5,
  clutchHitWindow: 60,
  clutchEnemyRange: 8_000,
  clutchSurvive: 150,
  clutchCooldown: 20 * HZ,
  clutch: 45,
  stealShare: 40,
  stealWindow: 150,
  stealObjective: 70,
  stealBuff: 35,
  stealCannon: 30,
  towerRange: 7_000,
  diveHold: 90,
  dive: 50,
  comebackKills: 3,
  comebackOurs: 60,
  comebackTheirs: 35,
  // funny (§2.4)
  minionDeath: 60,
  minionHealthyPct: 50,
  minionHealthyAgo: 6 * HZ,
  towerDeath: 40,
  towerLonely: 10_000,
  campDeath: 55,
  diveFail: 55,
  pounceAim: 3_000,
  pounceMoved: 1_600,
  wallPounce: 40,
  wallPounceDeath: 20,
  boingChainGap: 180,
  boingDoomRange: 6_000,
  boingChain: 35,
  boingDoom: 60,
  returnToSender: 75,
  returnToSenderEpic: 60,
  fumbleDrop: 35,
  fumbleFizzle: 25,
  fumbleWhiff: 20,
  ultWindow: 45,
  ultOnMinion: 45,
  overkillTimes: 5,
  overkillPct: 5,
  overkill: 35,
  napWindow: 90,
  napFail: 45,
  clip: Object.freeze({ ko: 50, flop: 45, bigdog: 40, frozen: 35 }) as Readonly<Record<string, number>>,
  clipOther: 30,
  blunderEnemies: 3,
  blunderRange: 10_000,
  blunder: 40,
  pingBurst: 4,
  pingWindow: 300,
  pingSpam: 25,
  emoteBurst: 3,
  emoteWindow: 150,
  emoteSpam: 25,
  /** A funny highlight's place in the main ranking: its funny score × this. */
  funnyToScore: 0.5,
  // ranking and picking (§2.5)
  mineActor: 20,
  mineInvolved: 10,
  rarity: 10,
  late: 5,
  lateTicks: 60 * HZ,
  mergeOverlap: 0.5,
  mergeTag: 5,
  minTicks: 6 * HZ,
  maxTicks: 20 * HZ,
  /** Under this much play only the finale counts (a match shorter than 60 s). */
  shortMatch: 60 * HZ,
  funniestMin: 30,
  montageSegMax: 8 * HZ,
  montageMin: 20 * HZ,
  montageMax: 30 * HZ,
  /** Enemy-only highlights: the actor seen by the player's team in ≥ this share of 1 Hz checks. */
  seenShare: 0.6,
});

export const LIST_MAX = 12;
export const TOP_MAX = 3;
export const MONTAGE_MIN = 3;
export const MONTAGE_MAX = 5;
export const TITLE_MAX = 28;
export const SUB_MAX = 40;
/** Camera keys every this many ticks (3 s, a small cached reel): the director interpolates between them. */
export const KEY_EVERY = 90;
/** The framing radius: the farthest participant + this, at least FRAME_MIN (mm). */
export const FRAME_PAD = 2_000;
export const FRAME_MIN = 8_000;

/** The highlight under tick `t`, or null. Pure. */
export const highlightAt = (reel: Pick<HighlightReel, 'list'> | null | undefined, t: number): Highlight | null => reel?.list.find((h) => t >= h.start && t <= h.end) ?? null;

/** The next highlight starting after `t` (+1 s), or (`dir` −1) the previous one starting before `t` − 1 s; wraps. Pure. */
export function stepHighlight(list: readonly Highlight[], t: number, dir: 1 | -1): Highlight | null {
  if (!list.length) return null;
  if (dir > 0) return list.find((h) => h.start > t + HZ) ?? list[0];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].start < t - HZ) return list[i];
  return list[list.length - 1];
}

/** "2:14". */
export const mmss = (ticks: number): string => {
  const s = Math.max(0, Math.floor(ticks / HZ));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A highlight's clip length (s): its window, 6 to 20. Pure. */
export const highlightSeconds = (h: Pick<Highlight, 'start' | 'end'>): number => Math.max(6, Math.min(20, Math.round((h.end - h.start) / HZ)));

/** The montage's segments: each the reel's highlight trimmed to ≤ 8 s around its peak, in match order. Pure. */
export function montageSegments(reel: Pick<HighlightReel, 'list' | 'montage'>, total: number): MontageSegment[] {
  const segs: { id: string; a: number; b: number; title: string; sub: string }[] = [];
  for (const id of reel.montage) {
    const h = reel.list.find((x) => x.id === id);
    if (!h) continue;
    const [a, b] = segmentOf(h, total, RULES.montageSegMax);
    segs.push({ id, a, b, title: h.title, sub: h.sub });
  }
  segs.sort((x, y) => x.a - y.a);
  // short highlights: grow each segment (to ≤ 8 s, never into the next one) until the montage reaches 20 s
  let sum = segs.reduce((n, s) => n + s.b - s.a, 0);
  for (let pass = 0; pass < 2 && sum < RULES.montageMin; pass++)
    segs.forEach((s, i) => {
      if (sum >= RULES.montageMin) return;
      const room = RULES.montageSegMax - (s.b - s.a);
      const limit = pass === 0 ? (i + 1 < segs.length ? segs[i + 1].a : total) - s.b : s.a - (i > 0 ? segs[i - 1].b : 0);
      const grow = Math.max(0, Math.min(room, RULES.montageMin - sum, limit));
      if (pass === 0) s.b += grow;
      else s.a -= grow;
      sum += grow;
    });
  return segs.map((s) => ({ id: s.id, at: s.a, ticks: s.b - s.a, seconds: Math.max(1, Math.round((s.b - s.a) / HZ)), title: s.title, sub: s.sub }));
}

export interface MontageSegment {
  id: string;
  /** Start tick. */
  at: number;
  /** Length in ticks (and whole seconds). */
  ticks: number;
  seconds: number;
  title: string;
  sub: string;
}

/** A window of at most `max` ticks inside the highlight, around its peak (the lead kept short), within [0, total]. */
export function segmentOf(h: Pick<Highlight, 'start' | 'end' | 'peak'>, total: number, max: number): [number, number] {
  let a = h.start;
  let b = h.end;
  if (b - a > max) {
    // the peak sits 60% of the way in: the build-up, the moment, the aftermath
    a = Math.max(h.start, Math.min(h.peak - Math.round(max * 0.6), h.end - max));
    b = a + max;
  }
  a = Math.max(0, a);
  b = Math.min(Math.max(a + 1, total), b);
  return [a, b];
}
