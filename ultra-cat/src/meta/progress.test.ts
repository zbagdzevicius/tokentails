import { describe, expect, it } from 'vitest';
import type { RunResult } from '../core/types';
import { newlyAffordable, newStarsOf, recordRun } from './progress';
import { defaultSave } from './save';

const run = (o: Partial<RunResult> = {}): RunResult => ({
  levelId: 'meowhattan',
  catId: 'tabby',
  why: 'time',
  damage: 300,
  buildings: 4,
  landmarks: 1,
  kills: {},
  taxis: 0,
  fish: 0,
  maxCombo: 10,
  patience: 50,
  destroyedPct: 5,
  bossDefeated: false,
  elapsed: 90,
  ...o,
});

describe('recordRun', () => {
  it('records best, objectives, stars, plays, totals and catnip', () => {
    const s0 = defaultSave();
    const s1 = recordRun(s0, run({ damage: 600 }), { met: [true, false, false], stars: 1 }, 70);
    expect(s1.levels.meowhattan).toEqual({ stars: 1, objectives: [true, false, false], best: 600, plays: 1 });
    expect(s1.catnip).toBe(70);
    expect(s1.totals).toEqual({ runs: 1, damage: 600, catnipEarned: 70 });
    // worse run: best and objectives keep the max / OR
    const s2 = recordRun(s1, run({ damage: 100 }), { met: [false, false, true], stars: 1 }, 10);
    expect(s2.levels.meowhattan).toEqual({ stars: 2, objectives: [true, false, true], best: 600, plays: 2 });
    expect(s2.catnip).toBe(80);
    expect(s2.totals.runs).toBe(2);
    expect(s2.totals.damage).toBe(700);
  });

  it('never mutates the input save', () => {
    const s0 = defaultSave();
    const copy = JSON.parse(JSON.stringify(s0));
    recordRun(s0, run(), { met: [true, true, true], stars: 3 }, 100);
    expect(s0).toEqual(copy);
  });

  it('a quit records nothing', () => {
    const s0 = defaultSave();
    expect(recordRun(s0, run({ why: 'quit' }), { met: [true, true, true], stars: 3 }, 100)).toBe(s0);
  });

  it('ignores bad numbers', () => {
    const s = recordRun(defaultSave(), run({ damage: NaN }), { met: [false, false, false], stars: 0 }, -5);
    expect(s.catnip).toBe(0);
    expect(s.levels.meowhattan?.best).toBe(0);
  });

  it('keeps other levels', () => {
    const s0 = recordRun(defaultSave(), run(), { met: [true, false, false], stars: 1 }, 1);
    const s1 = recordRun(s0, run({ levelId: 'docks' }), { met: [false, true, false], stars: 1 }, 1);
    expect(s1.levels.meowhattan?.stars).toBe(1);
    expect(s1.levels.docks?.objectives).toEqual([false, true, false]);
  });
});

describe('newStarsOf', () => {
  it('counts only objectives met for the first time', () => {
    const s = recordRun(defaultSave(), run(), { met: [true, false, false], stars: 1 }, 0);
    const n = newStarsOf(s, 'meowhattan', { met: [true, true, false], stars: 2 });
    expect(n.fresh).toEqual([false, true, false]);
    expect(n.count).toBe(1);
    expect(newStarsOf(defaultSave(), 'docks', { met: [true, true, true], stars: 3 }).count).toBe(3);
  });
});

describe('newlyAffordable', () => {
  it('lists cats crossing their price', () => {
    const cost = (id: string) => ({ tabby: 0, chonk: 300, shadow: 600, siamese: 900 })[id] ?? 0;
    const a = { ...defaultSave(), catnip: 250 };
    const b = { ...defaultSave(), catnip: 650 };
    expect(newlyAffordable(a, b, cost)).toEqual(['chonk', 'shadow']);
    expect(newlyAffordable(b, b, cost)).toEqual([]);
  });
});
