/**
 * Days history (GDD 3.4, 13.6): the frozen ranked record per dayNo (first completed run of the day,
 * honour-based) and the best score per dayNo across ranked and practice runs (key `best`, pruned to the
 * newest 400 days like `days`).
 */
import type { DayRecord, Store } from '../types';
import { DAYS_CAP, readDayRecord, readDays, writeDayRecord } from '../platform/records';

export const KEY_BEST = 'best';

export function readBest(store: Store): Record<string, number> {
  const raw = store.get<unknown>(KEY_BEST, {});
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[String(n)] = Math.floor(v);
  }
  return out;
}

export function bestScore(store: Store, dayNo: number): number | null {
  return readBest(store)[String(dayNo)] ?? null;
}

export interface RunRecordResult {
  /** This run became the day's ranked record (first completed run of the day). */
  ranked: boolean;
  best: number;
  newBest: boolean;
  record: DayRecord | null;
}

/**
 * Store a finished run. `wantRanked` = the UI started it as the ranked attempt; it only counts when the day
 * has no ranked record yet. Practice runs only move the best score.
 */
export function recordRun(store: Store, dayNo: number, rec: DayRecord, wantRanked: boolean): RunRecordResult {
  try {
    if (!Number.isInteger(dayNo) || dayNo < 1) return { ranked: false, best: rec.score, newBest: false, record: null };
    let record = readDayRecord(store, dayNo);
    let ranked = false;
    if (wantRanked && !record) {
      ranked = writeDayRecord(store, dayNo, rec) || !store.persistent;
      record = rec;
    }
    const best = readBest(store);
    const prev = best[String(dayNo)];
    const score = Math.max(0, Math.floor(rec.score));
    const newBest = prev === undefined || score > prev;
    if (newBest) {
      best[String(dayNo)] = score;
      const keys = Object.keys(best).map(Number).sort((a, b) => b - a);
      const pruned: Record<string, number> = {};
      for (const k of keys.slice(0, DAYS_CAP)) pruned[String(k)] = best[String(k)];
      store.set(KEY_BEST, pruned);
    }
    return { ranked, best: newBest ? score : prev, newBest, record };
  } catch {
    return { ranked: false, best: rec.score, newBest: false, record: null };
  }
}

/** History rows, newest first (archive screen). */
export function dayHistory(store: Store): { dayNo: number; record: DayRecord | null; best: number | null }[] {
  const days = readDays(store);
  const best = readBest(store);
  const all = new Set([...Object.keys(days), ...Object.keys(best)].map(Number));
  return [...all]
    .sort((a, b) => b - a)
    .map((dayNo) => ({ dayNo, record: days[String(dayNo)] ?? null, best: best[String(dayNo)] ?? null }));
}
