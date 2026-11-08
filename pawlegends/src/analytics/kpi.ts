/**
 * Live KPI helpers (docs/plans/moba/BENCHMARKS.md, "Live product KPIs"): flat numbers that ride the consent-gated
 * events of analytics/posthog.ts. Nothing here sends anything; it only computes props.
 *
 * - `day_n` (every event, through the common props): whole UTC days since this browser first opened the game. D1 / D7
 *   retention is "had an event with day_n = 1 / 7" among ids whose first event has day_n = 0. It works for embedded
 *   play too, where the host's anonymous id replaces ours. The first day is kept in browser storage only (a
 *   convenience: cleared storage starts a new cohort, which undercounts retention, never overcounts it).
 * - `load_ms`: ms since the page started loading (performance.now()), on match_start and mp_match_start: time to
 *   first match on a real device, cold or warm.
 *
 * Pure apart from the storage read/write; never throws.
 */

export const FIRST_DAY_KEY = 'tt.pawlegends.first.v1';
const DAY_MS = 86_400_000;

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): KV | null {
  try {
    return (globalThis as { localStorage?: KV }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Whole UTC days since the first day this storage saw (0 on the first day; 0 when storage is blocked). */
export function retentionDay(nowMs: number = Date.now(), kv: KV | null = store()): number {
  const today = Math.floor(nowMs / DAY_MS);
  try {
    const raw = kv?.getItem(FIRST_DAY_KEY) ?? null;
    const first = raw !== null && /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
    if (Number.isFinite(first) && first <= today) return today - first;
    kv?.setItem(FIRST_DAY_KEY, String(today));
  } catch {
    /* blocked storage: every day reads as day 0 */
  }
  return 0;
}

/** ms since navigation start, rounded (0 where performance is missing). */
export function sinceLoadMs(): number {
  try {
    const t = (globalThis as { performance?: { now(): number } }).performance?.now();
    return typeof t === 'number' && Number.isFinite(t) ? Math.max(0, Math.round(t)) : 0;
  } catch {
    return 0;
  }
}
