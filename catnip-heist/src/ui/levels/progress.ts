/**
 * Campaign progress: per-level best score, best time and stars, persisted in browser storage.
 * Pure logic plus a tiny storage adapter, so it is unit-tested without a DOM.
 *
 * Storage: one JSON value under PROGRESS_KEY (namespaced and versioned). Every read and write is
 * wrapped in try/catch; when storage is blocked (private mode, sandboxed iframes) progress lives in
 * memory for the session instead.
 *
 * Stars (earned once, kept forever; each star can come from a different winning run):
 *   1. Heist complete  - win the level (shelter cat freed, both cats on the exit).
 *   2. All catnip      - win with every coin collected.
 *   3. Clean and quick - win without being spotted, at or under par time.
 * Level N unlocks when level N-1 has been won (level 1 is always open).
 */
import type { LevelDef, RunResult } from '../../types';

export const PROGRESS_KEY = 'catnip-heist.progress.v1';
export const PROGRESS_VERSION = 1;

export const STAR_WIN = 1;
export const STAR_COINS = 2;
export const STAR_CLEAN = 4;

export interface StarRule {
  bit: number;
  label: string;
  detail: string;
}

/** Star rules in display order (shown on the level select and the results screen). */
export const STAR_RULES: readonly StarRule[] = [
  { bit: STAR_WIN, label: 'Heist complete', detail: 'Free the shelter cat and get both cats out.' },
  { bit: STAR_COINS, label: 'All catnip', detail: 'Win with every catnip coin collected.' },
  { bit: STAR_CLEAN, label: 'Clean and quick', detail: 'Win without being spotted, at or under par.' },
];

export interface LevelRecord {
  won: boolean;
  /** Best score of a winning run (0 until won). */
  bestScore: number;
  /** Fastest winning run in ticks (0 until won). */
  bestTicks: number;
  /** Bitmask of STAR_* earned so far. */
  stars: number;
  /** Finished runs (won or not). */
  plays: number;
}

export interface ProgressData {
  v: number;
  levels: Record<string, LevelRecord>;
}

/** Minimal Storage surface (localStorage, or a fake in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const EMPTY_RECORD: Readonly<LevelRecord> = Object.freeze({ won: false, bestScore: 0, bestTicks: 0, stars: 0, plays: 0 });

/** Number of set bits in a star mask (0-3). */
export function starCount(mask: number): number {
  return (mask & STAR_WIN ? 1 : 0) + (mask & STAR_COINS ? 1 : 0) + (mask & STAR_CLEAN ? 1 : 0);
}

/** Stars a single finished run earns. Nothing unless it was won. */
export function runStars(r: Pick<RunResult, 'coins' | 'ticks' | 'spottedCount'>, won: boolean, level: Pick<LevelDef, 'coins' | 'meta'>): number {
  if (!won) return 0;
  let m = STAR_WIN;
  if (r.coins >= level.coins.length) m |= STAR_COINS;
  if (r.spottedCount === 0 && r.ticks <= level.meta.parTicks) m |= STAR_CLEAN;
  return m;
}

function isRecord(v: unknown): v is LevelRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as LevelRecord;
  return typeof r.won === 'boolean' && Number.isFinite(r.bestScore) && Number.isFinite(r.bestTicks) && Number.isInteger(r.stars) && Number.isFinite(r.plays);
}

/** Parse a stored value; anything malformed or from another version yields empty progress. */
export function parseProgress(raw: string | null): ProgressData {
  const empty: ProgressData = { v: PROGRESS_VERSION, levels: {} };
  if (!raw) return empty;
  try {
    const d = JSON.parse(raw) as ProgressData;
    if (!d || typeof d !== 'object' || d.v !== PROGRESS_VERSION || !d.levels || typeof d.levels !== 'object') return empty;
    const levels: Record<string, LevelRecord> = {};
    for (const [id, rec] of Object.entries(d.levels)) if (isRecord(rec)) levels[id] = { ...rec, stars: rec.stars & 7 };
    return { v: PROGRESS_VERSION, levels };
  } catch {
    return empty;
  }
}

/** Default storage: localStorage when it works, else an in-memory map (private mode). */
export function defaultStorage(): StorageLike {
  const mem = new Map<string, string>();
  const memory: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
  try {
    const ls = globalThis.localStorage;
    if (!ls) return memory;
    const probe = `${PROGRESS_KEY}.probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    // Wrap so a later quota error or revoked access falls back to memory instead of throwing.
    return {
      getItem: (k) => {
        try {
          return ls.getItem(k) ?? mem.get(k) ?? null;
        } catch {
          return mem.get(k) ?? null;
        }
      },
      setItem: (k, v) => {
        mem.set(k, v);
        try {
          ls.setItem(k, v);
        } catch {
          /* keep the in-memory copy */
        }
      },
      removeItem: (k) => {
        mem.delete(k);
        try {
          ls.removeItem(k);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return memory;
  }
}

export interface RecordOutcome {
  record: LevelRecord;
  /** Stars this run earned that were not held before. */
  newStars: number;
  /** This run was the level's first win (the next level just unlocked). */
  firstWin: boolean;
  /** This run set a new best score. */
  newBest: boolean;
}

export class ProgressStore {
  private data: ProgressData;

  constructor(
    private readonly storage: StorageLike = defaultStorage(),
    private readonly order: readonly string[] = [],
  ) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(PROGRESS_KEY);
    } catch {
      raw = null;
    }
    this.data = parseProgress(raw);
  }

  get(id: string): LevelRecord {
    return this.data.levels[id] ?? { ...EMPTY_RECORD };
  }

  /** Level 1 (first in `order`) is always unlocked; level N once level N-1 is won. */
  isUnlocked(id: string): boolean {
    const i = this.order.indexOf(id);
    if (i <= 0) return i === 0 || this.order.length === 0;
    return this.get(this.order[i - 1]).won;
  }

  /** Total stars across the campaign. */
  totalStars(): number {
    let n = 0;
    for (const id of Object.keys(this.data.levels)) n += starCount(this.data.levels[id].stars);
    return n;
  }

  /** Record a finished run (won or not) and persist. */
  record(r: Pick<RunResult, 'levelId' | 'coins' | 'ticks' | 'spottedCount' | 'score'>, won: boolean, level: Pick<LevelDef, 'coins' | 'meta'>): RecordOutcome {
    const prev = this.get(r.levelId);
    const earned = runStars(r, won, level);
    const rec: LevelRecord = {
      won: prev.won || won,
      bestScore: won ? Math.max(prev.bestScore, r.score) : prev.bestScore,
      bestTicks: won ? (prev.bestTicks > 0 ? Math.min(prev.bestTicks, r.ticks) : r.ticks) : prev.bestTicks,
      stars: prev.stars | earned,
      plays: prev.plays + 1,
    };
    this.data.levels[r.levelId] = rec;
    this.save();
    return { record: rec, newStars: earned & ~prev.stars, firstWin: won && !prev.won, newBest: won && r.score > prev.bestScore };
  }

  /** Forget everything (QA / settings). */
  reset(): void {
    this.data = { v: PROGRESS_VERSION, levels: {} };
    this.save();
  }

  toJSON(): ProgressData {
    return JSON.parse(JSON.stringify(this.data)) as ProgressData;
  }

  private save(): void {
    try {
      this.storage.setItem(PROGRESS_KEY, JSON.stringify(this.data));
    } catch {
      /* storage is best effort; the in-memory copy stays authoritative */
    }
  }
}
