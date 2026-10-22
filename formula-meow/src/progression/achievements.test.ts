import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, coverage, newAchievements, type CheckCtx, type RaceCheck } from './achievements';
import { ACHIEVEMENT_IDS } from '../content/ids';
import { defaultProg, type ProgSave } from './state';
import { stats } from './fixtures.test-util';
import type { RaceStats } from '../types';

function race(o: Partial<RaceCheck> = {}, s: Partial<RaceStats> = {}): RaceCheck {
  return { mode: 'race', trackId: 'kitchen', place: 4, finished: true, karts: 8, stats: stats({ hitsTaken: 1, itemsUsed: 1, wallHits: 1, ...s }), maxCoinsHeld: 0, hitRival: false, ugc: false, ...o };
}
const ctx = (r?: RaceCheck, edit: (s: ProgSave) => void = () => {}): CheckCtx => {
  const s = defaultProg();
  edit(s);
  return { s, race: r, branchTracks: ['kitchen', 'rooftops'], circuits: ['kitchen', 'rooftops'] };
};
const earned = (c: CheckCtx) => new Set(newAchievements(c));

describe('achievements', () => {
  it('covers the 26 frozen ids exactly once (append-only: the first 24 keep their order)', () => {
    expect(coverage()).toEqual({ missing: [], extra: [] });
    expect(ACHIEVEMENTS).toHaveLength(26);
    expect(ACHIEVEMENT_IDS.slice(0, 24)).toContain('track-maker');
    expect(ACHIEVEMENT_IDS.slice(24)).toEqual(['loop-de-meow', 'combo-king']);
  });

  it('a plain mid-pack race earns nothing', () => {
    expect(newAchievements(ctx(race()))).toEqual([]);
  });

  const cases: Array<[string, CheckCtx, CheckCtx]> = [
    ['first-pounce', ctx(race({}, { pounce: true })), ctx(race())],
    ['pink-turbo', ctx(race({}, { miniTurbos: [0, 0, 1] })), ctx(race({}, { miniTurbos: [5, 5, 0] }))],
    ['untouchable', ctx(race({}, { hitsTaken: 0 })), ctx(race({ mode: 'tt' }, { hitsTaken: 0 }))],
    ['comeback', ctx(race({ place: 1 }, { worstPlace: 8 })), ctx(race({ place: 1 }, { worstPlace: 7 }))],
    ['revenge', ctx(race({ hitRival: true })), ctx(race({ hitRival: false }))],
    ['collector', ctx(race({ maxCoinsHeld: 10 })), ctx(race({ maxCoinsHeld: 9 }))],
    ['ghostbuster', ctx(undefined, (s) => (s.ghostWins = 1)), ctx(undefined, (s) => (s.ghostWins = 0))],
    ['shortcut-scout', ctx(undefined, (s) => (s.shortcutTracks = ['kitchen', 'rooftops'])), ctx(undefined, (s) => (s.shortcutTracks = ['kitchen']))],
    ['gold-kibble', ctx(undefined, (s) => (s.trophies['kibble:0'] = 1)), ctx(undefined, (s) => (s.trophies['kibble:0'] = 2))],
    ['gold-catnip', ctx(undefined, (s) => (s.trophies['catnip:2m'] = 1)), ctx(undefined, (s) => (s.trophies['kibble:2'] = 1))],
    ['medal-hunter', ctx(undefined, (s) => (s.medals = { 'kitchen:0': 1, 'rooftops:2': 1 })), ctx(undefined, (s) => (s.medals = { 'kitchen:0': 1, 'rooftops:2': 2 }))],
    ['last-cat-standing', ctx(race({ mode: 'battle', place: 1 })), ctx(race({ mode: 'battle', place: 2 }))],
    ['pacifist', ctx(race({ place: 1 }, { itemsUsed: 0 })), ctx(race({ place: 2 }, { itemsUsed: 0 }))],
    ['air-cat', ctx(race({}, { tricks: 5 })), ctx(race({}, { tricks: 4 }))],
    ['slipstreamer', ctx(race({}, { slipstreams: 4 })), ctx(race({}, { slipstreams: 3 }))],
    ['daily-devotee', ctx(undefined, (s) => (s.daily.bestStreak = 7)), ctx(undefined, (s) => (s.daily.bestStreak = 6))],
    ['first-win', ctx(race({ place: 1 })), ctx(race({ place: 1, finished: false }))],
    ['podium-ten', ctx(undefined, (s) => (s.stats.podiums = 10)), ctx(undefined, (s) => (s.stats.podiums = 9))],
    ['drift-master', ctx(race({}, { miniTurbos: [5, 5, 2] })), ctx(race({}, { miniTurbos: [5, 5, 1] }))],
    ['sharpshooter', ctx(race({}, { hitsDealt: 5 })), ctx(race({}, { hitsDealt: 4 }))],
    ['big-air', ctx(undefined, (s) => (s.stats.tricks = 50)), ctx(undefined, (s) => (s.stats.tricks = 49))],
    ['clean-lap', ctx(race({}, { wallHits: 0 })), ctx(race({}, { wallHits: 0, respawns: 1 }))],
    ['globetrotter', ctx(undefined, (s) => (s.racedTracks = ['kitchen', 'rooftops', 'laundry', 'yarn', 'cafe', 'shelter'])), ctx(undefined, (s) => (s.racedTracks = ['kitchen', 'rooftops', 'laundry', 'yarn', 'cafe']))],
    ['track-maker', ctx(race({ ugc: true })), ctx(race({ ugc: false }))],
    ['loop-de-meow', ctx(undefined, (s) => (s.stats.loops = 20)), ctx(undefined, (s) => (s.stats.loops = 19))],
    ['combo-king', ctx(race({}, { bestCombo: 3 })), ctx(race({}, { bestCombo: 2 }))],
  ];

  for (const [id, yes, no] of cases) {
    it(`${id}: earned when the rule holds, not otherwise`, () => {
      expect(earned(yes).has(id as never)).toBe(true);
      expect(earned(no).has(id as never)).toBe(false);
    });
  }

  it('every achievement has a case above', () => {
    expect(new Set(cases.map((c) => c[0]))).toEqual(new Set(ACHIEVEMENTS.map((a) => a.id)));
  });

  it('is never earned twice', () => {
    const c = ctx(race({}, { pounce: true }), (s) => (s.achievements['first-pounce'] = 3));
    expect(earned(c).has('first-pounce')).toBe(false);
  });

  it('Shortcut Scout needs at least one circuit with a route', () => {
    const c = ctx(undefined);
    c.branchTracks = [];
    expect(earned(c).has('shortcut-scout')).toBe(false);
  });

  it('progress counts up for the long ones', () => {
    const c = ctx(undefined, (s) => {
      s.stats.podiums = 4;
      s.racedTracks = ['kitchen', 'yarn'];
    });
    expect(ACHIEVEMENTS.find((a) => a.id === 'podium-ten')!.progress!(c)).toEqual([4, 10]);
    expect(ACHIEVEMENTS.find((a) => a.id === 'globetrotter')!.progress!(c)).toEqual([2, 6]);
  });
});
