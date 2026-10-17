/**
 * Streak with freezes ("Nine Lives", GDD 8, 13.6 key `streak`).
 *
 * Everything is keyed by `dayNo` (content's `dayNoFor(localDate)`), never by timestamps, so time zones and
 * DST cannot split or merge days: the player's local midnight already decided the dayNo. Rules:
 * - A ranked run on dayNo extends the streak once; a second run on the same day is ignored.
 * - A dayNo lower than lastDay (travelled west, clock changed back, archive replay) never breaks or
 *   extends the streak.
 * - Missed days are covered by freezes, auto-used, `freezesPerWeek` per week (free 1, Club 3). Weeks
 *   run Monday to Sunday: Day #1 (Nov 16, 2026) is a Monday, so weekOf = floor((dayNo - 1) / 7).
 *   Freezes refill to the weekly allowance at each new week (they do not accumulate).
 * - If the gap cannot be fully covered the streak restarts at 1 and no freeze is spent on it.
 * - Blocked storage: the streak lives in memory and `persistent: false` ("this browser only").
 */
import type { StreakView, Store } from '../types';

export const KEY_STREAK = 'streak';
/** Pre-launch preview days (dayNo <= 0) run their own streak, shifted by PREVIEW_SHIFT to stay >= 1. */
export const KEY_PREVIEW_STREAK = 'previewStreak';
export const PREVIEW_SHIFT = 100_000;

/** Storage key and internal day number for a (possibly preview) dayNo. */
function streakSlot(dayNo: number): { key: string; day: number } {
  return dayNo < 1 ? { key: KEY_PREVIEW_STREAK, day: dayNo + PREVIEW_SHIFT } : { key: KEY_STREAK, day: dayNo };
}
export const FREE_FREEZES_PER_WEEK = 1;
/** Longer gaps are never coverable (max 3 freezes a week); skip walking them. */
const MAX_COVERABLE_GAP = 21;

export interface StreakData {
  current: number;
  best: number;
  lastDay: number; // 0 = never played
  freezesLeft: number;
  weekId: number; // week of the last refill, -1 = none
}

export interface Streak {
  current: number;
  best: number;
  lastDay: number;
  persistent: boolean;
  freezesLeft: number;
  /** Days covered by a freeze in this call (recordRankedDay) or that would be (streakStatus). */
  frozeDays: number[];
  /** True when this call restarted (recordRankedDay) or the streak is already lost (streakStatus). */
  broken: boolean;
}

export interface StreakOptions {
  freezesPerWeek?: number;
}

export const weekOf = (dayNo: number): number => Math.floor((dayNo - 1) / 7);

const nat = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : d);

export function readStreak(store: Store, perWeek = FREE_FREEZES_PER_WEEK, key = KEY_STREAK): StreakData {
  const raw = store.get<Partial<StreakData> | null>(key, null);
  const r = raw && typeof raw === 'object' ? raw : {};
  const current = nat(r.current);
  return {
    current,
    best: Math.max(nat(r.best), current),
    lastDay: nat(r.lastDay),
    freezesLeft: Math.min(nat(r.freezesLeft, perWeek), Math.max(perWeek, 3)),
    weekId: typeof r.weekId === 'number' && Number.isInteger(r.weekId) ? r.weekId : -1,
  };
}

/** Walk the missed days between lastDay and dayNo; returns the state after covering them, or null if not coverable. */
function cover(s: StreakData, dayNo: number, perWeek: number): { s: StreakData; frozen: number[] } | null {
  const next = { ...s };
  const frozen: number[] = [];
  const gap = dayNo - s.lastDay - 1;
  if (gap <= 0) return { s: next, frozen };
  if (gap > MAX_COVERABLE_GAP) return null;
  for (let d = s.lastDay + 1; d < dayNo; d++) {
    const w = weekOf(d);
    if (w !== next.weekId) {
      next.weekId = w;
      next.freezesLeft = perWeek;
    }
    if (next.freezesLeft <= 0) return null;
    next.freezesLeft--;
    frozen.push(d);
  }
  return { s: next, frozen };
}

function refill(s: StreakData, dayNo: number, perWeek: number): void {
  const w = weekOf(dayNo);
  if (w !== s.weekId) {
    s.weekId = w;
    s.freezesLeft = perWeek;
  }
}

const view = (s: StreakData, persistent: boolean, frozeDays: number[], broken: boolean): Streak => ({
  current: s.current,
  best: s.best,
  lastDay: s.lastDay,
  persistent,
  freezesLeft: s.freezesLeft,
  frozeDays,
  broken,
});

/** Pure transition (exported for tests and the M2 server port). */
export function applyRankedDay(s: StreakData, dayNo: number, perWeek = FREE_FREEZES_PER_WEEK): { s: StreakData; frozeDays: number[]; broken: boolean; counted: boolean } {
  if (!Number.isInteger(dayNo) || dayNo < 1) return { s, frozeDays: [], broken: false, counted: false };
  if (s.lastDay > 0 && dayNo <= s.lastDay) return { s, frozeDays: [], broken: false, counted: false };
  if (s.lastDay === 0 || s.current === 0) {
    const n = { ...s, current: 1, lastDay: dayNo };
    refill(n, dayNo, perWeek);
    n.best = Math.max(n.best, 1);
    return { s: n, frozeDays: [], broken: false, counted: true };
  }
  const covered = cover(s, dayNo, perWeek);
  let n: StreakData;
  let broken = false;
  let frozeDays: number[] = [];
  if (covered) {
    n = covered.s;
    frozeDays = covered.frozen;
    n.current = s.current + 1;
  } else {
    n = { ...s, current: 1 };
    broken = true;
  }
  n.lastDay = dayNo;
  refill(n, dayNo, perWeek);
  n.best = Math.max(n.best, n.current);
  return { s: n, frozeDays, broken, counted: true };
}

/** Record a ranked run on dayNo and return the updated streak. Never throws. */
export function recordRankedDay(store: Store, dayNo: number, opts: StreakOptions = {}): Streak {
  const perWeek = opts.freezesPerWeek ?? FREE_FREEZES_PER_WEEK;
  try {
    const slot = Number.isInteger(dayNo) ? streakSlot(dayNo) : { key: KEY_STREAK, day: dayNo };
    const before = readStreak(store, perWeek, slot.key);
    const r = applyRankedDay(before, slot.day, perWeek);
    if (r.counted) store.set(slot.key, r.s);
    return view(r.s, store.persistent, r.frozeDays, r.broken);
  } catch {
    return { current: 0, best: 0, lastDay: 0, persistent: false, freezesLeft: 0, frozeDays: [], broken: false };
  }
}

/**
 * What the home screen shows today without recording anything: the live streak if today or yesterday was
 * played or the missed days are coverable by freezes (`frozeDays` = days that will be frozen when today
 * is played), otherwise current 0 with `broken: true`. Read-only.
 */
export function streakStatus(store: Store, todayNo: number, opts: StreakOptions = {}): Streak {
  const perWeek = opts.freezesPerWeek ?? FREE_FREEZES_PER_WEEK;
  try {
    const slot = Number.isInteger(todayNo) ? streakSlot(todayNo) : { key: KEY_STREAK, day: todayNo };
    todayNo = slot.day;
    const s = readStreak(store, perWeek, slot.key);
    if (s.lastDay === 0 || s.current === 0) return view({ ...s, current: 0 }, store.persistent, [], false);
    if (todayNo <= s.lastDay + 1) {
      const shown = { ...s };
      if (todayNo > s.lastDay) refill(shown, todayNo, perWeek);
      return view(shown, store.persistent, [], false);
    }
    const covered = cover(s, todayNo, perWeek);
    if (!covered) return view({ ...s, current: 0 }, store.persistent, [], true);
    const shown = covered.s;
    refill(shown, todayNo, perWeek);
    return view(shown, store.persistent, covered.frozen, false);
  } catch {
    return { current: 0, best: 0, lastDay: 0, persistent: false, freezesLeft: 0, frozeDays: [], broken: false };
  }
}

/** Club allowance (GDD 8 "Nine Lives"). */
export const CLUB_FREEZES_PER_WEEK = 3;
/** Milestone badges shown on the flame (7 also grants the Streak star collar, see cosmetics.ts). */
export const STREAK_BADGES: readonly { days: number; name: string; icon: string }[] = [
  { days: 3, name: 'Habit Forming', icon: '🐾' },
  { days: 7, name: 'Streak Star', icon: '⭐' },
  { days: 14, name: 'Fortnight Felon', icon: '🌙' },
  { days: 30, name: 'Monthly Menace', icon: '🔥' },
  { days: 100, name: 'Century Cat', icon: '👑' },
];
export function streakBadges(best: number): { days: number; name: string; icon: string }[] {
  return STREAK_BADGES.filter((b) => best >= b.days);
}

/**
 * Home flame and the streak-break paywall moment (GDD 9.2): the live streak, freezes left this week,
 * whether today's ranked run is still needed (`atRisk`), and whether skipping today breaks it
 * (`breaksTonight`: no freeze would cover today). Read-only, never throws.
 */
export function streakDetail(store: Store, todayNo: number, opts: StreakOptions = {}): StreakView {
  const local = !store.persistent;
  try {
    const st = streakStatus(store, todayNo, opts);
    if (!Number.isInteger(todayNo)) return { current: 0, best: st.best, freezesLeft: st.freezesLeft, atRisk: false, breaksTonight: false, local };
    const slot = streakSlot(todayNo);
    const raw = readStreak(store, opts.freezesPerWeek ?? FREE_FREEZES_PER_WEEK, slot.key);
    const playedToday = raw.lastDay === slot.day;
    const atRisk = st.current > 0 && !st.broken && !playedToday;
    // The last preview day (0) never "breaks": Day #1 starts a fresh streak anyway.
    const breaksTonight = atRisk && todayNo !== 0 && streakStatus(store, todayNo + 1, opts).broken;
    return { current: st.current, best: st.best, freezesLeft: st.freezesLeft, atRisk, breaksTonight, local };
  } catch {
    return { current: 0, best: 0, freezesLeft: 0, atRisk: false, breaksTonight: false, local };
  }
}
