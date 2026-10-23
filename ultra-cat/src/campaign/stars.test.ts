import { describe, expect, it } from 'vitest';
import type { LevelDef, LevelId, Objective, RunResult, SaveData } from '../core/types';
import { LEVELS } from './levels';
import { evaluateStars, isLevelUnlocked, objectiveMet, objectiveValue, totalStars } from './stars';

const run = (o: Partial<RunResult> = {}): RunResult => ({
  levelId: 'meowhattan',
  catId: 'tabby',
  why: 'time',
  damage: 0,
  buildings: 0,
  landmarks: 0,
  kills: {},
  taxis: 0,
  fish: 0,
  maxCombo: 0,
  patience: 100,
  destroyedPct: 0,
  bossDefeated: false,
  elapsed: 90,
  ...o,
});

const save = (levels: Partial<Record<LevelId, number>>): SaveData => {
  const out: SaveData['levels'] = {};
  for (const [id, stars] of Object.entries(levels)) out[id as LevelId] = { stars: stars ?? 0, objectives: [false, false, false], best: 0, plays: 1 };
  return {
    v: 1,
    catnip: 0,
    selectedCat: 'tabby',
    cats: {
      tabby: { owned: true, upgrades: { power: 0, speed: 0, fur: 0, ultra: 0 } },
      chonk: { owned: false, upgrades: { power: 0, speed: 0, fur: 0, ultra: 0 } },
      shadow: { owned: false, upgrades: { power: 0, speed: 0, fur: 0, ultra: 0 } },
      siamese: { owned: false, upgrades: { power: 0, speed: 0, fur: 0, ultra: 0 } },
    },
    levels: out,
    settings: { master: 1, music: 0.6, sfx: 1, shake: 1, quality: 'high' },
    tutorialDone: true,
    totals: { runs: 0, damage: 0, catnipEarned: 0 },
  };
};

const obj = (kind: Objective['kind'], target: number, enemy?: Objective['enemy']): Objective => ({ kind, target, enemy, label: kind });

describe('objectiveValue / objectiveMet', () => {
  it('damage', () => {
    expect(objectiveValue(obj('damage', 500), run({ damage: 612.4 }))).toBe(612.4);
    expect(objectiveMet(obj('damage', 500), run({ damage: 500 }))).toBe(true);
    expect(objectiveMet(obj('damage', 500), run({ damage: 499.9 }))).toBe(false);
  });
  it('landmarks', () => {
    expect(objectiveMet(obj('landmarks', 2), run({ landmarks: 2 }))).toBe(true);
    expect(objectiveMet(obj('landmarks', 2), run({ landmarks: 1 }))).toBe(false);
  });
  it('kills of one enemy, and of all enemies when no enemy is named', () => {
    const r = run({ kills: { heli: 2, vacuum: 5, cannonTruck: 1 } });
    expect(objectiveValue(obj('kills', 3, 'heli'), r)).toBe(2);
    expect(objectiveMet(obj('kills', 3, 'heli'), r)).toBe(false);
    expect(objectiveMet(obj('kills', 5, 'vacuum'), r)).toBe(true);
    expect(objectiveValue(obj('kills', 3, 'mechaDog'), r)).toBe(0);
    expect(objectiveValue(obj('kills', 8), r)).toBe(8);
    expect(objectiveMet(obj('kills', 8), r)).toBe(true);
  });
  it('patience: counts on a finished run, fails on TOO WET', () => {
    expect(objectiveMet(obj('patience', 50), run({ patience: 50 }))).toBe(true);
    expect(objectiveMet(obj('patience', 50), run({ patience: 49 }))).toBe(false);
    expect(objectiveMet(obj('patience', 0), run({ why: 'wet', patience: 0 }))).toBe(false);
    expect(objectiveMet(obj('patience', 30), run({ why: 'wet', patience: 80 }))).toBe(false);
    expect(objectiveMet(obj('patience', 30), run({ why: 'boss', patience: 31 }))).toBe(true);
  });
  it('destroyedPct, combo, fish, buildings', () => {
    expect(objectiveMet(obj('destroyedPct', 40), run({ destroyedPct: 40.5 }))).toBe(true);
    expect(objectiveMet(obj('destroyedPct', 40), run({ destroyedPct: 39 }))).toBe(false);
    expect(objectiveMet(obj('combo', 40), run({ maxCombo: 40 }))).toBe(true);
    expect(objectiveMet(obj('combo', 40), run({ maxCombo: 39 }))).toBe(false);
    expect(objectiveMet(obj('fish', 2), run({ fish: 3 }))).toBe(true);
    expect(objectiveMet(obj('fish', 2), run({ fish: 1 }))).toBe(false);
    expect(objectiveMet(obj('buildings', 60), run({ buildings: 60 }))).toBe(true);
    expect(objectiveMet(obj('buildings', 60), run({ buildings: 10 }))).toBe(false);
  });
  it('boss', () => {
    expect(objectiveValue(obj('boss', 1), run({ bossDefeated: true }))).toBe(1);
    expect(objectiveMet(obj('boss', 1), run({ bossDefeated: true, why: 'boss' }))).toBe(true);
    expect(objectiveMet(obj('boss', 1), run({ bossDefeated: false }))).toBe(false);
  });
  it('a quit meets nothing, even with huge numbers', () => {
    const r = run({ why: 'quit', damage: 1e6, landmarks: 99, kills: { heli: 99 }, maxCombo: 999, patience: 100, bossDefeated: true, destroyedPct: 100, fish: 9, buildings: 999 });
    for (const kind of ['damage', 'landmarks', 'kills', 'patience', 'destroyedPct', 'combo', 'fish', 'buildings', 'boss'] as const) expect(objectiveMet(obj(kind, 1, kind === 'kills' ? 'heli' : undefined), r)).toBe(false);
  });
});

describe('evaluateStars', () => {
  const city1 = LEVELS[0];
  it('counts one star per met objective, in objective order', () => {
    expect(evaluateStars(city1, run({ damage: 10 }))).toEqual({ met: [false, false, false], stars: 0 });
    expect(evaluateStars(city1, run({ damage: 900 }))).toEqual({ met: [true, false, false], stars: 1 });
    expect(evaluateStars(city1, run({ damage: 900, landmarks: 3, kills: { heli: 6 } }))).toEqual({ met: [true, true, true], stars: 3 });
    expect(evaluateStars(city1, run({ damage: 900, landmarks: 3, kills: { heli: 6 }, why: 'quit' }))).toEqual({ met: [false, false, false], stars: 0 });
  });
  it('the final city: TOO WET loses the patience star but keeps the damage star', () => {
    const base = LEVELS.find((l) => l.id === 'base')!;
    const r = run({ levelId: 'base', why: 'wet', damage: 5000, patience: 0 });
    const ev = evaluateStars(base, r);
    expect(ev.stars).toBe(1);
    expect(ev.met[base.objectives.findIndex((o) => o.kind === 'damage')]).toBe(true);
  });
});

describe('totalStars', () => {
  it('sums the best stars of every city, missing cities count 0', () => {
    expect(totalStars(save({}))).toBe(0);
    expect(totalStars(save({ meowhattan: 3, docks: 2, nekotown: 1 }))).toBe(6);
  });
});

describe('isLevelUnlocked', () => {
  const all: LevelDef[] = LEVELS;
  const byId = (id: LevelId) => all.find((l) => l.id === id)!;
  it('the first city is always unlocked', () => {
    expect(isLevelUnlocked(byId('meowhattan'), save({}), all)).toBe(true);
  });
  it('needs the previous city at >= 1 star', () => {
    expect(isLevelUnlocked(byId('docks'), save({}), all)).toBe(false);
    expect(isLevelUnlocked(byId('docks'), save({ meowhattan: 0 }), all)).toBe(false);
    expect(isLevelUnlocked(byId('docks'), save({ meowhattan: 1 }), all)).toBe(true);
  });
  it('needs the campaign total too', () => {
    const sub = byId('suburbia'); // unlockStars 3
    expect(isLevelUnlocked(sub, save({ meowhattan: 1, docks: 1 }), all)).toBe(false);
    expect(isLevelUnlocked(sub, save({ meowhattan: 2, docks: 1 }), all)).toBe(true);
    // enough total but the previous city has no star
    expect(isLevelUnlocked(sub, save({ meowhattan: 3, docks: 0 }), all)).toBe(false);
  });
  it('the final city needs 8 stars and Nekotown cleared', () => {
    const base = byId('base');
    expect(isLevelUnlocked(base, save({ meowhattan: 3, docks: 3, suburbia: 2, nekotown: 0 }), all)).toBe(false);
    expect(isLevelUnlocked(base, save({ meowhattan: 3, docks: 2, suburbia: 2, nekotown: 1 }), all)).toBe(true);
    expect(isLevelUnlocked(base, save({ meowhattan: 1, docks: 1, suburbia: 1, nekotown: 1 }), all)).toBe(false);
  });
  it('a level whose predecessor is missing from the list stays locked', () => {
    expect(isLevelUnlocked(byId('docks'), save({ meowhattan: 3 }), [byId('docks')])).toBe(false);
  });
});
