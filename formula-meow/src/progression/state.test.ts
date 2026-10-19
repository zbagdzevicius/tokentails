import { describe, expect, it } from 'vitest';
import { defaultProg, migrateProg, welcomeBackFish } from './state';

describe('progression save and migration', () => {
  it('a new player starts with the three free bodies, no fish, 50cc', () => {
    const s = migrateProg(undefined, null);
    expect(s.owned.bodies).toEqual([0, 1, 2]);
    expect(s.fish).toBe(0);
    expect(s.classUnlocked).toBe(0);
  });

  it('a v1 player keeps their classes and races, and gets a small welcome-back bonus', () => {
    const s = migrateProg(undefined, { races: 12, unlocked: 2 });
    expect(s.classUnlocked).toBe(2);
    expect(s.stats.races).toBe(12);
    expect(s.stats.finishes).toBe(12);
    expect(s.fish).toBe(60);
    expect(welcomeBackFish(1000)).toBe(200);
  });

  it('accepts its own output (it runs on every load)', () => {
    const a = migrateProg(undefined, { races: 3, unlocked: 1 });
    a.fish = 321;
    a.owned.hats = [0, 4];
    a.equip.hat = 4;
    a.achievements['first-win'] = 9;
    a.daily = { day: 9, ids: ['win:1', 'pink:2', 'tricks:4'], progress: [1, 0, 2], done: [true, false, false], swept: false, streak: 2, lastDone: 9, bestStreak: 3 };
    const b = migrateProg(JSON.parse(JSON.stringify(a)), { races: 3, unlocked: 1 });
    expect(b).toEqual(a);
  });

  it('cleans junk: unknown ids, negative fish, equipped things not owned', () => {
    const s = migrateProg(
      { v: 1, fish: -5, owned: { bodies: [9, 3], hats: ['x', 2], trails: [7], cats: [1, 'abc'] }, equip: { body: 4, hat: 2, trail: 3, cat: 'nope', number: 400 }, trophies: { 'kibble:0': 9, 'kibble:1': 2 } },
      null,
    );
    expect(s.fish).toBe(0);
    expect(s.owned.bodies).toEqual([0, 1, 2, 3]);
    expect(s.owned.hats).toEqual([0, 2]);
    expect(s.owned.trails).toEqual([0]);
    expect(s.owned.cats).toEqual(['abc']);
    expect(s.equip.body).toBe(0); // body 4 not owned
    expect(s.equip.hat).toBe(2);
    expect(s.equip.trail).toBe(0);
    expect(s.equip.cat).toBeNull();
    expect(s.equip.number).toBe(99);
    expect(s.trophies).toEqual({ 'kibble:1': 2 });
  });

  it('the shell unlocking a class later is honoured on load', () => {
    const a = defaultProg();
    expect(migrateProg(a, { races: 1, unlocked: 1 }).classUnlocked).toBe(1);
  });
});
