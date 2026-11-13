/**
 * Champion mastery (gap plan P2; Wild Rift Honorary Medals and Omnichamp, MLBB hero proficiency, Brawl Stars Prestige):
 * levels M1 to M7 per hero from the server's count of VERIFIED matches and wins (written only by the `/live` save,
 * backend/src/pawlegends/progress/mastery.ts, the source of these numbers). This file mirrors the level table and keeps
 * the last server answer as a display cache (meta/progressCloud.ts writes it). Cosmetic: it gates nothing.
 */
import type { HeroId } from '../sim/api';

/** Points (matches + wins) for M1..M7: the backend's MASTERY_STEPS. */
export const MASTERY_STEPS: readonly number[] = Object.freeze([1, 5, 12, 25, 45, 75, 120]);
export const MASTERY_MAX = MASTERY_STEPS.length;

export interface MasteryRow {
  m: number;
  w: number;
  level: number;
}
export type MasteryMap = Partial<Record<HeroId, MasteryRow>>;

export function masteryLevel(m: number, w: number): number {
  const pts = Math.max(0, Math.floor(m)) + Math.max(0, Math.floor(w));
  return MASTERY_STEPS.filter((s) => pts >= s).length;
}

/** Points to the next level (null at M7). Pure. */
export function masteryToNext(r: Pick<MasteryRow, 'm' | 'w'>): number | null {
  const pts = r.m + r.w;
  const next = MASTERY_STEPS.find((s) => pts < s);
  return next === undefined ? null : next - pts;
}

const HERO = /^[a-z]{2,16}$/;

/** The server's `mastery` map, checked (levels recomputed here, never trusted). Pure. */
export function parseMastery(raw: unknown): MasteryMap {
  const out: MasteryMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(1e6, Math.floor(v)) : 0);
  for (const [h, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!HERO.test(h) || !v || typeof v !== 'object') continue;
    const m = n((v as Record<string, unknown>).m);
    const w = Math.min(m, n((v as Record<string, unknown>).w));
    if (m > 0) out[h as HeroId] = { m, w, level: masteryLevel(m, w) };
  }
  return out;
}

const KEY = 'tt.pawlegends.mastery.v1';
let cache: MasteryMap | null = null;

export function loadMastery(): MasteryMap {
  if (cache) return cache;
  try {
    cache = parseMastery(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    cache = {};
  }
  return cache;
}

export function saveMastery(m: MasteryMap): void {
  cache = m;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* blocked: memory only */
  }
}

export function masteryOf(hero: HeroId): MasteryRow | null {
  return loadMastery()[hero] ?? null;
}

/** Tests only. */
export function resetMasteryCache(): void {
  cache = null;
}
