/**
 * Season track (GDD 8, 13.6 key `season`). Seasons by LOCAL date from types.ts SEASONS ('pre' before
 * launch, S0..S3), then generated 6-week seasons. 30 tiers: free players claim tiers 1..15, Club all 30.
 *
 * XP: a ranked run = 100 + floor(score / 100) (once per dayNo); practice and FTUE runs the same, counted
 * for the first 5 runs of a local day. XP_PER_TIER = 300 is tuned so a daily player (one ranked run plus
 * one practice run at a typical 4,000 points = ~280 XP a day) reaches tier 30 in about 5 weeks (32 days);
 * ranked runs alone reach the 15 free tiers in about 4.5 weeks.
 */
import {
  COSMETICS,
  FREE_SEASON_TIERS,
  SEASONS,
  SEASON_TIERS,
  XP_PRACTICE_CAP_PER_DAY,
  XP_RANKED_BASE,
  type CosmeticDef,
  type RunResult,
  type SeasonDef,
  type SeasonView,
  type Store,
} from '../types';
import { daysBetween, parseYmd, ymd } from './dates';
import { grantCosmetic } from './cosmetics';

export const KEY_SEASON = 'season';
export const XP_PER_TIER = 300;
export { SEASON_TIERS, FREE_SEASON_TIERS };
export const PRACTICE_XP_RUNS_PER_DAY = XP_PRACTICE_CAP_PER_DAY;
/** Generated seasons after the last listed one. */
export const GENERATED_SEASON_DAYS = 42;

/** Tier titles: every tier has a name, even the ones without a cosmetic. */
export const TIER_TITLES: readonly string[] = [
  'Curious Kitten', 'Counter Cruiser', 'Shelf Inspector', 'Paw Tapper', 'Gravity Tester',
  'Vase Whisperer', 'Sock Thief', 'Midnight Zoomer', 'Tablecloth Tugger', 'Certified Menace',
  'Mug Nudger', 'Loaf Impostor', 'Cable Connoisseur', 'Roomba Rider', 'Houseplant Critic',
  'Nine-Lives Navigator', 'Cardboard Commander', 'Toilet Paper Baron', 'Laptop Napper', 'Chaos Consultant',
  'Bad Kitty Royalty', 'Glass Half Empty', 'Floor Is Lava', 'Curtain Climber', 'Treat Negotiator',
  'Dinner Thief', 'Unblinking Stare', 'Professional Knocker', 'Most Wanted', 'Legendary Bad Cat',
];
export const tierTitle = (t: number): string => TIER_TITLES[Math.max(1, Math.min(SEASON_TIERS, Math.floor(t))) - 1];

/** Where track items sit: free items on tiers 1..15, Club items on 16..30, never two on one tier. */
const FREE_SLOTS = [5, 10, 15, 3, 8, 13, 1, 6, 11, 2, 4, 7, 9, 12, 14];
const CLUB_SLOTS = [20, 25, 30, 17, 22, 27, 16, 19, 24, 29, 18, 21, 23, 26, 28];

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The season of a local date. */
export function seasonFor(now: Date): SeasonDef {
  const day = ymd(now);
  if (day < SEASONS[0].start) return SEASONS[0];
  for (const s of SEASONS) if (day >= s.start && day <= s.end) return s;
  const last = SEASONS[SEASONS.length - 1];
  const firstGen = addDays(parseYmd(last.end)!, 1);
  const idx = Math.floor(daysBetween(firstGen, now) / GENERATED_SEASON_DAYS);
  const start = addDays(firstGen, idx * GENERATED_SEASON_DAYS);
  const n = Number(last.id.slice(1)) + 1 + idx;
  return { id: `s${n}`, name: `Season ${n}`, start: ymd(start), end: ymd(addDays(start, GENERATED_SEASON_DAYS - 1)), theme: 'default' };
}

export interface TrackTier {
  tier: number;
  title: string;
  free?: CosmeticDef;
  club?: CosmeticDef;
}

/** The 30-tier track of a season ('pre' previews the S0 items). */
export function seasonTrack(seasonId: string): TrackTier[] {
  const sid = seasonId === 'pre' ? 's0' : seasonId;
  const tiers: TrackTier[] = [];
  for (let t = 1; t <= SEASON_TIERS; t++) tiers.push({ tier: t, title: tierTitle(t) });
  const free = COSMETICS.filter((c) => c.source === 'free_track' && c.season === sid);
  const club = COSMETICS.filter((c) => c.source === 'club_track' && c.season === sid);
  free.slice(0, FREE_SLOTS.length).forEach((c, i) => (tiers[FREE_SLOTS[i] - 1].free = c));
  club.slice(0, CLUB_SLOTS.length).forEach((c, i) => (tiers[CLUB_SLOTS[i] - 1].club = c));
  return tiers;
}

export interface SeasonData {
  seasonId: string;
  xp: number;
  claimed: number[];
  /** Local date of the practice counter. */
  practiceDate: string;
  practiceRuns: number;
  /** dayNos whose ranked XP was already paid (newest 60). */
  rankedDays: number[];
}

export const tierFor = (xp: number): number => Math.max(0, Math.min(SEASON_TIERS, Math.floor(xp / XP_PER_TIER)));

/** Shape check of stored season data (any season id); null when unusable. */
export function sanitizeSeasonData(r: unknown): SeasonData | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  if (typeof o.seasonId !== 'string' || !/^(pre|s\d{1,3})$/.test(o.seasonId)) return null;
  const ints = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is number => typeof t === 'number' && Number.isInteger(t)) : []);
  return {
    seasonId: o.seasonId,
    xp: typeof o.xp === 'number' && Number.isFinite(o.xp) && o.xp >= 0 ? Math.min(1e7, Math.floor(o.xp)) : 0,
    claimed: [...new Set(ints(o.claimed).filter((t) => t >= 1 && t <= SEASON_TIERS))].sort((a, b) => a - b),
    practiceDate: typeof o.practiceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.practiceDate) ? o.practiceDate : '',
    practiceRuns: typeof o.practiceRuns === 'number' && Number.isInteger(o.practiceRuns) && o.practiceRuns >= 0 ? o.practiceRuns : 0,
    rankedDays: ints(o.rankedDays).slice(-60),
  };
}

/** This season's data (a new season starts at 0 XP). */
export function readSeason(store: Store, now: Date): SeasonData {
  const id = seasonFor(now).id;
  try {
    const s = sanitizeSeasonData(store.get<unknown>(KEY_SEASON, null));
    if (s && s.seasonId === id) return s;
  } catch {
    /* fresh */
  }
  return { seasonId: id, xp: 0, claimed: [], practiceDate: '', practiceRuns: 0, rankedDays: [] };
}

/** XP of one run: 100 + floor(score / 100). */
export function xpFor(score: number): number {
  const s = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  return XP_RANKED_BASE + Math.floor(s / 100);
}

function view(s: SeasonData, now: Date, club: boolean): SeasonView {
  const def = seasonFor(now);
  const tier = tierFor(s.xp);
  const end = parseYmd(def.end)!;
  return {
    id: def.id,
    name: def.name,
    start: def.start,
    end: def.end,
    daysLeft: Math.max(0, daysBetween(now, end) + 1),
    xp: s.xp,
    tier,
    xpPerTier: XP_PER_TIER,
    tiers: seasonTrack(def.id).map((t) => {
      const row: SeasonView['tiers'][number] = {
        tier: t.tier,
        title: t.title,
        claimed: s.claimed.includes(t.tier),
        unlocked: t.tier <= tier && (t.tier <= FREE_SEASON_TIERS || club),
      };
      if (t.free) row.free = t.free;
      if (t.club) row.club = t.club;
      return row;
    }),
  };
}

export function season(store: Store, now: Date, opts: { club: boolean }): SeasonView {
  return view(readSeason(store, now), now, !!opts?.club);
}

/**
 * Add a finished run's XP. Ranked XP is paid once per dayNo (a second "ranked" run on the same day counts as
 * practice); practice and FTUE runs pay for the first 5 runs of the local day. Never throws.
 */
export function addRunXp(store: Store, run: Pick<RunResult, 'score' | 'mode'>, opts: { ranked: boolean; dayNo: number; now: Date; club: boolean }): SeasonView {
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  try {
    const s = readSeason(store, now);
    const ranked = !!opts.ranked && run.mode !== 'ftue' && Number.isInteger(opts.dayNo) && !s.rankedDays.includes(opts.dayNo);
    if (ranked) {
      s.xp += xpFor(run.score);
      s.rankedDays = [...s.rankedDays, opts.dayNo].slice(-60);
    } else {
      const today = ymd(now);
      if (s.practiceDate !== today) {
        s.practiceDate = today;
        s.practiceRuns = 0;
      }
      if (s.practiceRuns < XP_PRACTICE_CAP_PER_DAY) {
        s.practiceRuns++;
        s.xp += xpFor(run.score);
      }
    }
    store.set(KEY_SEASON, s);
    return view(s, now, !!opts.club);
  } catch {
    return view(readSeason(store, now), now, !!opts?.club);
  }
}

/**
 * Claim a reached tier: returns the cosmetic it grants (Club item for Club, else the free item), or null
 * when the tier is locked, already claimed, or a title-only tier (then it is still marked claimed).
 */
export function claimTier(store: Store, tier: number, now: Date, opts: { club: boolean }): CosmeticDef | null {
  try {
    const s = readSeason(store, now);
    const v = view(s, now, !!opts.club);
    const row = v.tiers[tier - 1];
    if (!row || !row.unlocked || row.claimed) return null;
    s.claimed = [...s.claimed, tier].sort((a, b) => a - b);
    store.set(KEY_SEASON, s);
    const item = (opts.club && row.club) || row.free || (opts.club ? row.club : undefined) || null;
    if (item) grantCosmetic(store, item);
    return item;
  } catch {
    return null;
  }
}

/** Tiers reached but not claimed yet (the little red dot). */
export function claimableTiers(v: SeasonView): number[] {
  return v.tiers.filter((t) => t.unlocked && !t.claimed).map((t) => t.tier);
}
