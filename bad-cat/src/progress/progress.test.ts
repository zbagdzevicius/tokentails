import { describe, expect, it } from 'vitest';
import type { SimEvent, Store } from '../types';
import { createStore, type StorageLike } from '../platform/storage';
import { readOwned } from './cosmetics';
import { recordRankedDay, streakStatus, weekOf, recordCrimes, crimesIn, addRunXp, recordRun, bestScore, dayHistory, exportSaveCode, importSaveCode, decodeSaveCode, unlocksFor } from './index';

const mem = (): Store => {
  const data = new Map<string, string>();
  const ls: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  return createStore('t:', ls);
};

// Day #1 = Mon Nov 16 2026: days 1..7 are week 0, 8..14 week 1.
describe('streak', () => {
  it('counts consecutive days once per day', () => {
    const s = mem();
    expect(recordRankedDay(s, 1).current).toBe(1);
    expect(recordRankedDay(s, 1).current).toBe(1); // same day again
    expect(recordRankedDay(s, 2).current).toBe(2);
    const r = recordRankedDay(s, 3);
    expect(r).toMatchObject({ current: 3, best: 3, lastDay: 3, persistent: true, broken: false, frozeDays: [] });
  });

  it('auto-uses a freeze on one missed day', () => {
    const s = mem();
    recordRankedDay(s, 1);
    recordRankedDay(s, 2);
    const r = recordRankedDay(s, 4); // missed day 3
    expect(r.current).toBe(3);
    expect(r.frozeDays).toEqual([3]);
    expect(r.freezesLeft).toBe(0);
    expect(r.broken).toBe(false);
  });

  it('breaks after two missed days in the same week (1 free freeze) and spends no freeze', () => {
    const s = mem();
    recordRankedDay(s, 1);
    recordRankedDay(s, 2);
    const r = recordRankedDay(s, 5); // missed 3 and 4
    expect(r).toMatchObject({ current: 1, best: 2, broken: true, frozeDays: [], freezesLeft: 1 });
  });

  it('second missed day in the same week breaks once the freeze is spent', () => {
    const s = mem();
    recordRankedDay(s, 1);
    recordRankedDay(s, 3); // freeze day 2
    const r = recordRankedDay(s, 5); // day 4 missed, no freeze left this week
    expect(r.broken).toBe(true);
    expect(r.current).toBe(1);
  });

  it('freezes refill at the week boundary (Sunday + Monday missed)', () => {
    const s = mem();
    for (let d = 1; d <= 6; d++) recordRankedDay(s, d);
    expect(weekOf(7)).toBe(0);
    expect(weekOf(8)).toBe(1);
    const r = recordRankedDay(s, 9); // missed 7 (week 0) and 8 (week 1)
    expect(r.frozeDays).toEqual([7, 8]);
    expect(r.current).toBe(7);
    expect(r.freezesLeft).toBe(0);
  });

  it('Club allowance covers longer gaps', () => {
    const s = mem();
    recordRankedDay(s, 1, { freezesPerWeek: 3 });
    const r = recordRankedDay(s, 5, { freezesPerWeek: 3 });
    expect(r).toMatchObject({ current: 2, frozeDays: [2, 3, 4], freezesLeft: 0 });
  });

  it('long absence restarts at 1', () => {
    const s = mem();
    recordRankedDay(s, 1);
    expect(recordRankedDay(s, 60)).toMatchObject({ current: 1, best: 1, broken: true });
  });

  it('time zones: an earlier dayNo (travel west, clock back) neither breaks nor counts', () => {
    const s = mem();
    recordRankedDay(s, 10);
    recordRankedDay(s, 11);
    const r = recordRankedDay(s, 10);
    expect(r).toMatchObject({ current: 2, lastDay: 11, broken: false });
    expect(recordRankedDay(s, 12).current).toBe(3);
  });

  it('time zones: travelling east skips no dayNo when played each local day', () => {
    // dayNo comes from the local date; a jump of +1 dayNo is a normal next day, whatever the hour gap.
    const s = mem();
    recordRankedDay(s, 20);
    expect(recordRankedDay(s, 21).current).toBe(2);
  });

  it('pre-launch preview days run a separate streak; Day 1 starts fresh', () => {
    const s = mem();
    expect(recordRankedDay(s, -2).current).toBe(1);
    expect(recordRankedDay(s, -1).current).toBe(2);
    expect(recordRankedDay(s, 0).current).toBe(3);
    expect(recordRankedDay(s, 1).current).toBe(1);
    expect(streakStatus(s, 1).current).toBe(1);
  });

  it('ignores invalid dayNo', () => {
    const s = mem();
    recordRankedDay(s, 3);
    expect(recordRankedDay(s, 2.5).current).toBe(1);
    expect(recordRankedDay(s, NaN).current).toBe(1);
  });

  it('streakStatus shows alive, pending freeze, or broken without writing', () => {
    const s = mem();
    recordRankedDay(s, 1);
    recordRankedDay(s, 2);
    expect(streakStatus(s, 3)).toMatchObject({ current: 2, broken: false, frozeDays: [] });
    expect(streakStatus(s, 4)).toMatchObject({ current: 2, broken: false, frozeDays: [3] });
    expect(streakStatus(s, 5)).toMatchObject({ current: 0, broken: true });
    expect(recordRankedDay(s, 3).current).toBe(3); // status did not spend anything
  });

  it('storage failure: streak works in memory with persistent false', () => {
    const throwing: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    const s = createStore('t:', throwing);
    expect(recordRankedDay(s, 1)).toMatchObject({ current: 1, persistent: false });
    expect(recordRankedDay(s, 2)).toMatchObject({ current: 2, persistent: false });
  });

  it('corrupt streak data is repaired', () => {
    const s = mem();
    s.set('streak', { current: 'x', best: -1, lastDay: null });
    expect(recordRankedDay(s, 5).current).toBe(1);
  });
});

describe('rap sheet', () => {
  const ev: SimEvent[] = [
    { t: 'break', tick: 10, prop: 0, points: 150, combo: 1 },
    { t: 'spill', tick: 20, prop: 1, points: 200, combo: 5 },
    { t: 'stash', tick: 30, prop: 2 },
    { t: 'end', tick: 2250 },
  ];
  const now = new Date(2026, 10, 18, 12);
  it('counts crimes and returns first stamps only once', () => {
    const s = mem();
    const kinds = [1, 5, 19];
    expect(crimesIn(ev, kinds)).toEqual({ 'kind-1': 1, 'kind-5': 1, 'kind-19': 1, 'sock-smuggler': 1, 'chain-reaction': 1, ghost: 1 });
    expect(recordCrimes(s, ev, kinds, 3, { now }).sort()).toEqual(['chain-reaction', 'ghost', 'kind-1', 'kind-19', 'kind-5', 'sock-smuggler']);
    expect(recordCrimes(s, ev, kinds, 4, { now })).toEqual([]);
    expect(recordCrimes(s, [{ t: 'caught', tick: 5 }, { t: 'end', tick: 5 }], undefined, undefined, { now })).toEqual(['cuddled']);
  });
});

describe('days + unlocks', () => {
  it('first completed run is ranked; best tracks every run', () => {
    const s = mem();
    const rec = (score: number) => ({ score, stamp: 'clean' as const, rank: 'Menace', shared: false });
    expect(recordRun(s, 18, rec(3000), true)).toMatchObject({ ranked: true, best: 3000, newBest: true });
    expect(recordRun(s, 18, rec(5000), true)).toMatchObject({ ranked: false, best: 5000, newBest: true });
    expect(recordRun(s, 18, rec(100), false)).toMatchObject({ ranked: false, best: 5000, newBest: false });
    expect(bestScore(s, 18)).toBe(5000);
    expect(dayHistory(s)[0]).toMatchObject({ dayNo: 18, best: 5000, record: { score: 3000 } });
  });
  it('unlocks follow streak milestones and season tiers', () => {
    const s = mem();
    for (let d = 1; d <= 3; d++) recordRankedDay(s, d);
    const now = new Date(2026, 10, 20, 12);
    expect(unlocksFor(s, now)).toContain('streak:3');
    addRunXp(s, { score: 50_000, mode: 'ranked' }, { ranked: true, dayNo: 5, now, club: false });
    expect(unlocksFor(s, now)).toContain('s0:t2');
  });
});

describe('save code', () => {
  it('round-trips through export/import (deflated) and rejects garbage', async () => {
    const a = mem();
    recordRankedDay(a, 1);
    recordRankedDay(a, 2);
    recordRun(a, 2, { score: 777, stamp: 'perfect', rank: 'Menace', shared: true }, true);
    a.set('profile', { cats: [{ name: 'Mochi' }], active: 0 });
    const code = await exportSaveCode(a);
    expect(code.startsWith('BCD1')).toBe(true);
    const b = mem();
    const r = await importSaveCode(b, code);
    expect(r.ok).toBe(true);
    expect(recordRankedDay(b, 3).current).toBe(3);
    expect(bestScore(b, 2)).toBe(777);
    expect(b.get<{ cats: { name: string }[] }>('profile', { cats: [] }).cats[0].name).toBe('Mochi');
    expect((await importSaveCode(b, 'hello')).ok).toBe(false);
    expect((await importSaveCode(b, 'BCD1z!!!')).ok).toBe(false);
    const plain = await exportSaveCode(a, { compress: false });
    expect(plain.startsWith('BCD1j')).toBe(true);
    expect((await importSaveCode(mem(), plain)).ok).toBe(true);
  });
  it('a save code never unlocks shop, Club or charity cosmetics (only earned ones move)', async () => {
    // The review's example: Bandana (shop), Tiny crown (shop), Chaos Club collar (Club), Pink Paw collar (charity),
    // plus two earnable items that must survive.
    const json = JSON.stringify({ v: 1, cosmetics: { owned: ['collar:5', 'hat:5', 'collar:1', 'collar:2', 'hat:4', 'collar:6'] } });
    const code = 'BCD1j' + Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b = mem();
    expect((await importSaveCode(b, code)).ok).toBe(true);
    expect(b.get<{ owned: string[] }>('cosmetics', { owned: [] }).owned.sort()).toEqual(['collar:6', 'hat:4']);
    // An edited store that already lists paid items unlocks nothing either.
    b.set('cosmetics', { owned: ['collar:5', 'collar:1', 'collar:2', 'trail:3', 'caption:2', 'stamp:2', 'trail:2'] });
    expect(readOwned(b)).toEqual(['trail:2']);
  });
  it('stops inflating a deflate bomb past the cap instead of exhausting memory', async () => {
    // 8 MB of zeros (> 4 × SAVE_CODE_MAX) deflates to a few KB
    const zeros = new Uint8Array(8_000_000);
    const buf = await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    let bin = '';
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeSaveCode(`BCD1z${b64}`)).toBeNull();
  });
});
