// The Daily Run calendar (SHARE lane). Pure (node-importable): one seeded endless course per UTC day.
import type { ThemeId } from '../core/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const THEMES: readonly ThemeId[] = ['meadow', 'gorge', 'sunset'];
const DAY_MS = 86400000;

/** UTC 'YYYY-MM-DD' for a timestamp (the Daily Run resets at 00:00 UTC) */
export function dayKey(ms: number): string {
  const d = new Date(Number.isFinite(ms) ? ms : 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** FNV-1a (32 bit) of the day key, salted; never 0 (makeRng treats 0 specially) */
export function seedForDay(key: string): number {
  let h = 0x811c9dc5;
  const s = `meowrun-daily:${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0 || 1;
}

/** the landscape for a seed (meadow, gorge or sunset) */
export function themeForSeed(seed: number): ThemeId {
  // mix the high bits in: FNV's low bits alone cycle too regularly for neighbouring days
  const m = ((seed >>> 0) ^ ((seed >>> 0) >>> 16)) >>> 0;
  return THEMES[m % THEMES.length];
}

/** 'YYYY-MM-DD' -> 'Oct 24' ('' for anything else) */
export function dayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return '';
  const mo = +m[2];
  if (mo < 1 || mo > 12) return '';
  return `${MONTHS[mo - 1]} ${+m[3]}`;
}

/** which recent day (today back to `days` ago) a seed belongs to; '' = not a recent Daily (an endless course) */
export function dayForSeed(seed: number, nowMs: number, days = 30): string {
  for (let i = 0; i <= days; i++) {
    const k = dayKey(nowMs - i * DAY_MS);
    if (seedForDay(k) === seed >>> 0) return k;
  }
  return '';
}
