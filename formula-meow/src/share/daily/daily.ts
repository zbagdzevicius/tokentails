/**
 * Daily Cup (GDD 14). Day numbers follow the UTC date, so everyone races the same cup on the same day: one track a
 * day rotating through the authored tracks (mirrored on every other lap of the rotation), Alley Cat 100cc, and the
 * same seed worldwide (`seed = hash("daily", dayNo)`). The first finished race of the day is the ranked run;
 * practice after it is unlimited. No server: ranked runs and the streak live on this device only.
 * Pure helpers on top; the small storage wrapper at the bottom is guarded like the core's.
 */
import { Modifier, type RaceClass, type TrackDef } from '../../types';

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
  /** "Kitchen Counter GP" or "Kitchen Counter GP (mirror)" */
  label: string;
}

export function dailySetup(day: number, tracks: readonly TrackDef[]): DailySetup {
  const n = Math.max(1, tracks.length);
  const i = (((day - 1) % n) + n) % n;
  const mirror = Math.floor((day - 1) / n) % 2 === 1;
  const track = tracks[i];
  return {
    day,
    track,
    cls: DAILY_CLASS,
    seed: hash32(`daily:${day}`),
    modifiers: mirror ? Modifier.Mirror : 0,
    label: mirror ? `${track.name} (mirror)` : track.name,
  };
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
