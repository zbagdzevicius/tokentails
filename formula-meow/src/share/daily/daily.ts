/**
 * Daily Cup (GDD 14). Day numbers follow the UTC date, so everyone races the same cup on the same day: one track a
 * day rotating through the authored tracks (mirrored on every other lap of the rotation), Alley Cat 100cc, and the
 * same seed worldwide (`seed = hash("daily", dayNo)`); from day 9 one Wild Card mutator a day (ITERATION-4.md F11).
 * The first finished race of the day is the ranked run;
 * practice after it is unlimited. No server: ranked runs and the streak live on this device only.
 * Pure helpers on top; the small storage wrapper at the bottom is guarded like the core's.
 */
import { Modifier, type RaceClass, type TrackDef } from '../../types';
import { MUTATORS, type MutatorDef } from '../../core/app/race-labels';
import { t } from '../../ui/i18n';

/** Day #1 (UTC). */
export const DAY1_UTC = Date.UTC(2026, 9, 19);
export const DAILY_CLASS: RaceClass = 1;
const DAY_MS = 86_400_000;

export function dayNoFor(d: Date): number {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((utc - DAY1_UTC) / DAY_MS) + 1;
}

/** UTC date (YYYY-MM-DD) of day n. */
export function dateOfDay(n: number): string {
  return new Date(DAY1_UTC + (n - 1) * DAY_MS).toISOString().slice(0, 10);
}

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // final avalanche so neighbouring days get unrelated seeds
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h & 0x7fffffff;
}

export interface DailySetup {
  day: number;
  track: TrackDef;
  cls: RaceClass;
  seed: number;
  modifiers: number;
  /** "Kitchen Counter", "Kitchen Counter (mirror)", from the cutoff day "Kitchen Counter · Box Party" */
  label: string;
  /** the day's Wild Card mutator (from `DAILY_MUTATOR_DAY`), absent before */
  mutator?: MutatorDef;
}

/**
 * ITERATION-4.md F11: from this day (#9, 2026-10-27 UTC) the Daily Cup also deals one Wild Card mutator. Days before
 * it keep their setup (and so their `isDailyRace` keys: ranked runs, daily links and dares on those days stay valid).
 */
export const DAILY_MUTATOR_DAY = 9;

/**
 * The mutator of day `day` (null before the cutoff). Each run of five days deals every mutator offered at the daily
 * class once, in an order shuffled from the block's hash, so the same one never comes up two days running inside a
 * block and every mutator shows up each week.
 */
export function dailyMutator(day: number): MutatorDef | null {
  if (day < DAILY_MUTATOR_DAY) return null;
  const pool = MUTATORS.filter((m) => DAILY_CLASS >= m.minCls);
  if (!pool.length) return null;
  const k = day - DAILY_MUTATOR_DAY;
  const block = Math.floor(k / pool.length);
  const order = pool.slice();
  let h = hash32(`daily-mutator:${block}`);
  for (let i = order.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[k % pool.length];
}

export function dailySetup(day: number, tracks: readonly TrackDef[]): DailySetup {
  const n = Math.max(1, tracks.length);
  const i = (((day - 1) % n) + n) % n;
  const mirror = Math.floor((day - 1) / n) % 2 === 1;
  const track = tracks[i];
  const base = mirror ? `${track.name} (mirror)` : track.name;
  const mut = dailyMutator(day);
  const out: DailySetup = {
    day,
    track,
    cls: DAILY_CLASS,
    seed: hash32(`daily:${day}`),
    modifiers: (mirror ? Modifier.Mirror : 0) | (mut?.bit ?? 0),
    label: mut ? `${base} · ${t(mut.name)}` : base,
  };
  if (mut) out.mutator = mut;
  return out;
}

/** Is this race setup the Daily Cup of `day`? */
export function isDailyRace(day: number, tracks: readonly TrackDef[], s: { trackId: string; seed: number; cls: number; modifiers: number }): boolean {
  const d = dailySetup(day, tracks);
  return d.track.id === s.trackId && d.seed === s.seed && d.cls === s.cls && d.modifiers === s.modifiers;
}

/** Position band per lap for the emoji card: 🟪 top 3, 🟧 4–6, ⬜ 7–8. */
export function bandEmoji(place: number): string {
  return place <= 3 ? '🟪' : place <= 6 ? '🟧' : '⬜';
}

export interface RankedRun {
  day: number;
  place: number;
  time: number | null;
  /** place at the end of each lap */
  laps: number[];
}

export interface DailyRecord {
  runs: Record<string, RankedRun>;
  /** consecutive days with a ranked run, ending at `lastDay` */
  streak: number;
  lastDay: number;
}

export const EMPTY_DAILY: DailyRecord = { runs: {}, streak: 0, lastDay: 0 };

/** Record a finished daily race. Returns the ranked run when this race became it, null for practice. */
export function recordDaily(rec: DailyRecord, run: RankedRun): RankedRun | null {
  const key = String(run.day);
  if (rec.runs[key]) return null;
  rec.runs[key] = run;
  rec.streak = rec.lastDay === run.day - 1 ? rec.streak + 1 : 1;
  rec.lastDay = run.day;
  // keep the last 60 days
  const keys = Object.keys(rec.runs).map(Number).sort((a, b) => a - b);
  while (keys.length > 60) delete rec.runs[String(keys.shift())];
  return run;
}

/**
 * Which Daily Cup day a finished race belongs to. `setupDay` is the day the race was started as (Daily Cup mode),
 * `startDay` the UTC day when it started, `nowDay` the UTC day at the finish: a tab left open past midnight must
 * not judge the race by the day the page loaded. Only a race of the day that was current at its start can be the
 * ranked run (a race started at 23:59 still ranks for that day; a restart after midnight is practice).
 */
export function dailyResultDay(
  tracks: readonly TrackDef[],
  race: { trackId: string; seed: number; cls: number; modifiers: number },
  o: { setupDay?: number; startDay: number; nowDay: number },
): { day: number; rankable: boolean } | null {
  for (const d of [o.setupDay ?? -1, o.startDay, o.nowDay]) {
    if (d > 0 && d <= o.nowDay && isDailyRace(d, tracks, race)) return { day: d, rankable: d === o.startDay };
  }
  return null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function migrateRun(v: unknown): RankedRun | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<RankedRun>;
  if (!isNum(r.day) || !isNum(r.place) || !(r.time === null || isNum(r.time))) return null;
  return { day: r.day, place: r.place, time: r.time, laps: Array.isArray(r.laps) ? r.laps.filter(isNum) : [] };
}

/** A stored daily record, checked field by field; always a fresh object (never EMPTY_DAILY itself). */
export function migrateDaily(raw: unknown): DailyRecord {
  const out: DailyRecord = { runs: {}, streak: 0, lastDay: 0 };
  if (!raw || typeof raw !== 'object') return out;
  const v = raw as Partial<Record<keyof DailyRecord, unknown>>;
  if (v.runs && typeof v.runs === 'object' && !Array.isArray(v.runs)) {
    for (const [k, r] of Object.entries(v.runs as Record<string, unknown>)) {
      const run = migrateRun(r);
      if (run && String(run.day) === k) out.runs[k] = run;
    }
  }
  if (isNum(v.streak) && v.streak >= 0) out.streak = Math.floor(v.streak);
  if (isNum(v.lastDay) && v.lastDay >= 0) out.lastDay = Math.floor(v.lastDay);
  return out;
}
