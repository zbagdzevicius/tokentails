import { describe, expect, it } from 'vitest';
import { PROGRESS_KEY, ProgressStore, STAR_CLEAN, STAR_COINS, STAR_WIN, parseProgress, runStars, starCount, type StorageLike } from '../progress';
import { pathSlot } from '../LevelSelect';

const ORDER = ['l1', 'l2', 'l3'];
const LEVEL = { coins: new Array(10).fill(null).map((_, i) => ({ id: `c${i}`, tile: { x: 0, y: 0 } })), meta: { title: 't', parTicks: 3000, meowRadiusTiles: 6, investigateTicks: 60 } };

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const run = (p: Partial<{ coins: number; ticks: number; spottedCount: number; score: number }>) => ({
  levelId: 'l1',
  coins: 10,
  ticks: 2000,
  spottedCount: 0,
  score: 150,
  ...p,
});

describe('stars', () => {
  it('win / all coins / clean and under par', () => {
    expect(runStars(run({}), true, LEVEL)).toBe(STAR_WIN | STAR_COINS | STAR_CLEAN);
    expect(runStars(run({}), false, LEVEL)).toBe(0);
    expect(runStars(run({ coins: 9 }), true, LEVEL)).toBe(STAR_WIN | STAR_CLEAN);
    expect(runStars(run({ spottedCount: 1 }), true, LEVEL)).toBe(STAR_WIN | STAR_COINS);
    expect(runStars(run({ ticks: 3001 }), true, LEVEL)).toBe(STAR_WIN | STAR_COINS);
    expect(runStars(run({ ticks: 3000 }), true, LEVEL) & STAR_CLEAN).toBe(STAR_CLEAN);
    expect(starCount(7)).toBe(3);
    expect(starCount(STAR_COINS)).toBe(1);
  });
});

describe('ProgressStore', () => {
  it('only level 1 is unlocked on a fresh profile; winning N unlocks N+1', () => {
    const st = memStorage();
    const p = new ProgressStore(st, ORDER);
    expect(ORDER.map((id) => p.isUnlocked(id))).toEqual([true, false, false]);
    const lost = p.record(run({}), false, LEVEL);
    expect(lost.firstWin).toBe(false);
    expect(p.isUnlocked('l2')).toBe(false);
    const won = p.record(run({ coins: 5, spottedCount: 2 }), true, LEVEL);
    expect(won.firstWin).toBe(true);
    expect(won.newStars).toBe(STAR_WIN);
    expect(p.isUnlocked('l2')).toBe(true);
    expect(p.isUnlocked('l3')).toBe(false);
    expect(p.get('l1').plays).toBe(2);
  });

  it('stars accumulate across runs and best score / time keep the best', () => {
    const p = new ProgressStore(memStorage(), ORDER);
    p.record(run({ coins: 5, score: 100, ticks: 2500 }), true, LEVEL);
    const o = p.record(run({ coins: 10, spottedCount: 1, score: 90, ticks: 2800 }), true, LEVEL);
    expect(o.newStars).toBe(STAR_COINS);
    expect(o.newBest).toBe(false);
    const rec = p.get('l1');
    expect(rec.stars).toBe(STAR_WIN | STAR_COINS | STAR_CLEAN);
    expect(rec.bestScore).toBe(100);
    expect(rec.bestTicks).toBe(2500);
    expect(p.totalStars()).toBe(3);
  });

  it('persists under a namespaced, versioned key and reloads', () => {
    const st = memStorage();
    new ProgressStore(st, ORDER).record(run({}), true, LEVEL);
    expect(PROGRESS_KEY).toMatch(/^catnip-heist\.progress\.v\d+$/);
    const raw = JSON.parse(st.map.get(PROGRESS_KEY)!);
    expect(raw.v).toBe(1);
    const again = new ProgressStore(st, ORDER);
    expect(again.get('l1').won).toBe(true);
    expect(again.isUnlocked('l2')).toBe(true);
  });

  it('survives blocked storage (private mode) and junk data', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const p = new ProgressStore(throwing, ORDER);
    expect(() => p.record(run({}), true, LEVEL)).not.toThrow();
    expect(p.isUnlocked('l2')).toBe(true);
    expect(parseProgress('not json').levels).toEqual({});
    expect(parseProgress(JSON.stringify({ v: 99, levels: { l1: { won: true } } })).levels).toEqual({});
    expect(parseProgress(JSON.stringify({ v: 1, levels: { l1: { won: 'yes' } } })).levels).toEqual({});
  });
});

describe('level map layout', () => {
  it('snakes 4 per row on wide screens and 2 per row on narrow ones', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => pathSlot(i, 4))).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 4 },
      { row: 2, col: 3 },
      { row: 2, col: 2 },
      { row: 2, col: 1 },
    ]);
    expect(pathSlot(2, 2)).toEqual({ row: 2, col: 2 });
    expect(pathSlot(3, 2)).toEqual({ row: 2, col: 1 });
  });
});
