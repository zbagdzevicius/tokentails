/**
 * Local calendar helpers (GDD 3.4, 3.5). Everything works on the player's LOCAL date parts and converts with
 * Date.UTC arithmetic, so DST changes (23 h / 25 h days) never shift a day or a week.
 * DAY1 duplicates `content/daily.ts` DAY1 (progress must not import content); a test pins them equal.
 */

export const DAY1 = '2026-11-16'; // a Monday
const MS_DAY = 86_400_000;
/** Weekly Rap Sheet card unlocks Sunday at this local hour. */
export const WEEKLY_READY_HOUR = 18;

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of 'YYYY-MM-DD' (null when malformed). */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole local days from a to b (b - a), DST-safe. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / MS_DAY);
}

const day1 = (): Date => parseYmd(DAY1)!;

/** dayNo of a local date (Day #1 = DAY1); same formula as content's dayNoFor. */
export function dayNoOf(d: Date): number {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 0;
  return daysBetween(day1(), d) + 1;
}

/** Local midnight of a dayNo (works for preview days <= 0 too). */
export function dateOfDay(dayNo: number): Date {
  const d = day1();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (Math.floor(dayNo) - 1));
}

/** Local midnight of the Monday of d's week (weeks run Monday..Sunday). */
export function mondayOf(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // Mon 0 .. Sun 6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
}

/** ISO-8601 week id 'YYYY-Www' of d's Monday-based week. */
export function isoWeekId(d: Date): string {
  const mon = mondayOf(d);
  // ISO week-year: the year of the week's Thursday.
  const thu = new Date(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate() + 3));
  const year = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Mon = new Date(Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7)));
  const week = Math.round((thu.getTime() - 3 * MS_DAY - jan4Mon.getTime()) / (7 * MS_DAY)) + 1;
  return `${year}-W${pad(week)}`;
}

/** When the weekly card of d's week unlocks: Sunday 18:00 local. */
export function weeklyReadyAt(d: Date): Date {
  const mon = mondayOf(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, WEEKLY_READY_HOUR, 0, 0, 0);
}

/** GDD 3.5 weekday rooms (fallback "most wanted in" label when the caller does not name the room). */
export const WEEKDAY_ROOMS: readonly string[] = ['Kitchen', 'Living room', 'Bathroom', 'Home office', 'Party room', 'Boss room', 'Bedroom'];
export function weekdayRoom(d: Date): string {
  return WEEKDAY_ROOMS[(d.getDay() + 6) % 7];
}
