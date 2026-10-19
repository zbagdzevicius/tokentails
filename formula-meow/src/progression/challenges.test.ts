import { describe, expect, it } from 'vitest';
import { challengeById, challengesFor, currentStreak, ensureDay, familyKeys, progressChallenges, type ChallengeEnv } from './challenges';
import { emptyDaily } from './state';
import { stats } from './fixtures.test-util';

const env: ChallengeEnv = { tracks: ['kitchen', 'rooftops'], hasCoins: true, hasBranches: true, hasBattle: true, hasTimeTrial: true };
const bare: ChallengeEnv = { tracks: ['kitchen', 'rooftops'], hasCoins: false, hasBranches: false, hasBattle: false, hasTimeTrial: false };

describe('daily challenges', () => {
  it('gives everyone the same three per day, from three different families, 30–60 fish each', () => {
    for (let day = 1; day < 200; day++) {
      const a = challengesFor(day, env);
      expect(a).toEqual(challengesFor(day, env));
      expect(a).toHaveLength(3);
      expect(new Set(a.map((id) => id.split(':')[0])).size).toBe(3);
      for (const id of a) {
        const c = challengeById(id)!;
        expect(c).not.toBeNull();
        expect(c.fish).toBeGreaterThanOrEqual(30);
        expect(c.fish).toBeLessThanOrEqual(60);
      }
    }
  });

  it('changes from day to day and uses most of the pool over a month', () => {
    const seen = new Set<string>();
    let same = 0;
    for (let day = 1; day <= 30; day++) {
      const a = challengesFor(day, env);
      if (a.join() === challengesFor(day + 1, env).join()) same++;
      a.forEach((id) => seen.add(id.split(':')[0]));
    }
    expect(same).toBe(0);
    expect(seen.size).toBeGreaterThanOrEqual(familyKeys().length - 3);
  });

  it('never asks for coins, shortcuts, battle or a medal when the build has none', () => {
    for (let day = 1; day < 300; day++)
      for (const id of challengesFor(day, bare)) expect(['coins', 'shortcut', 'battle', 'medal']).not.toContain(id.split(':')[0]);
  });

  it('rolls over at the new day and keeps the streak', () => {
    const d = ensureDay({ ...emptyDaily(), streak: 4, lastDone: 9, bestStreak: 5 }, 10, env);
    expect(d.day).toBe(10);
    expect(d.ids).toHaveLength(3);
    expect(d.progress).toEqual([0, 0, 0]);
    expect(d.streak).toBe(4);
    expect(ensureDay(d, 10, env)).toBe(d);
  });

  it('counts progress, pays once, keeps the streak and pays the sweep bonus', () => {
    let d = { ...emptyDaily(), day: 10, ids: ['win:1', 'tricks:4', 'races:3'], progress: [0, 0, 0], done: [false, false, false], streak: 2, lastDone: 9 };
    const race = (place: number, tricks: number) => ({ kind: 'race' as const, race: { mode: 'race' as const, trackId: 'kitchen', place, finished: true, stats: stats({ tricks }), fish: 12 } });
    let u = progressChallenges(d, race(2, 3), 10);
    expect(u.completed).toEqual([]);
    expect(u.daily.progress).toEqual([0, 3, 1]);
    d = u.daily;
    u = progressChallenges(d, race(1, 2), 10);
    expect(u.completed).toEqual([0, 1]);
    expect(u.fish.map((f) => f.amount)).toEqual([35, 35]);
    expect(u.daily.streak).toBe(3);
    expect(u.daily.lastDone).toBe(10);
    d = u.daily;
    u = progressChallenges(d, race(5, 0), 10);
    expect(u.completed).toEqual([2]);
    expect(u.daily.streak).toBe(3); // same day: no second step
    expect(u.fish.map((f) => f.key)).toEqual(['Daily challenge', 'All three dailies']);
    // done challenges stay done and pay nothing more
    expect(progressChallenges(u.daily, race(1, 9), 10).fish).toEqual([]);
  });

  it('a missed day restarts the streak', () => {
    const d = { ...emptyDaily(), day: 20, ids: ['races:3', 'win:1', 'tricks:4'], progress: [2, 0, 0], done: [false, false, false], streak: 6, lastDone: 17, bestStreak: 6 };
    expect(currentStreak(d, 20)).toBe(0);
    const u = progressChallenges(d, { kind: 'race', race: { mode: 'race', trackId: 'kitchen', place: 4, finished: true, stats: stats(), fish: 5 } }, 20);
    expect(u.daily.streak).toBe(1);
    expect(u.daily.bestStreak).toBe(6);
  });

  it('win-at only counts that track; medal only counts medals', () => {
    const d = { ...emptyDaily(), day: 3, ids: ['win-at:rooftops', 'medal:1', 'fish:40'], progress: [0, 0, 0], done: [false, false, false] };
    const win = (trackId: string) => ({ kind: 'race' as const, race: { mode: 'race' as const, trackId, place: 1, finished: true, stats: stats(), fish: 25 } });
    let u = progressChallenges(d, win('kitchen'), 3);
    expect(u.daily.progress).toEqual([0, 0, 25]);
    u = progressChallenges(u.daily, win('rooftops'), 3);
    expect(u.daily.done).toEqual([true, false, true]);
    u = progressChallenges(u.daily, { kind: 'medal', medal: 3 }, 3);
    expect(u.daily.done).toEqual([true, true, true]);
  });

  it('parses ids and names the track', () => {
    expect(challengeById('win-at:kitchen', () => 'Kitchen Counter')?.vars).toEqual({ track: 'Kitchen Counter' });
    expect(challengeById('pink:4')?.fish).toBe(60);
    expect(challengeById('pink:7')).toBeNull();
    expect(challengeById('nope:1')).toBeNull();
  });
});
