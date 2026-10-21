import { describe, expect, it } from 'vitest';
import { applyCup, applyGhostWins, applyMedal, applyRace, applyShellClass, trophyKey } from './record';
import { defaultProg } from './state';
import { record, world } from './fixtures.test-util';

describe('recording a race', () => {
  it('a first win pays the place bonus, first-win and records the lifetime stats', () => {
    const w = world();
    const { save, award } = applyRace(defaultProg(), record({ distance: 3120.4 }, { place: 1, cls: 0, coins: 2 }, { coinsPicked: 3, tricks: 2 }), w);
    expect(save.stats.races).toBe(1);
    expect(save.stats.wins).toBe(1);
    expect(save.stats.podiums).toBe(1);
    expect(save.stats.distance).toBe(3120);
    expect(save.stats.tricks).toBe(2);
    expect(award.achievements).toContain('first-win');
    // 10 place + 3 picked + 2 held + 25 achievement (+ any daily challenge it completed)
    const race = award.fish.filter((f) => f.key !== 'Achievement' && f.key !== 'Daily challenge' && f.key !== 'All three dailies');
    expect(race.reduce((a, f) => a + f.amount, 0)).toBe(15);
    expect(save.fish).toBe(award.total);
    expect(save.fishTotal).toBe(award.total);
    expect(save.racedTracks).toEqual(['kitchen']);
    expect(save.podiumTracks).toEqual(['kitchen']);
    expect(save.owned.trails).toContain(1); // sparkle: podium at Kitchen
    expect(award.unlocks.some((u) => u.kind === 'trail' && u.id === 'sparkle')).toBe(true);
    expect(save.daily.day).toBe(w.today);
  });

  it('keeps best laps per track, class and modifiers and flags a new best', () => {
    let s = applyRace(defaultProg(), record({}, { place: 4, bestLap: 31 }), world()).save;
    expect(s.bestLaps['kitchen:0:0']).toBe(31);
    const r = applyRace(s, record({}, { place: 4, bestLap: 30.5 }), world());
    expect(r.award.newBestLap).toBe(30.5);
    s = applyRace(r.save, record({}, { place: 4, bestLap: 33 }), world()).save;
    expect(s.bestLaps['kitchen:0:0']).toBe(30.5);
  });

  it('a Track Doodle is not a circuit for trails or Globetrotter, but it is Track Maker', () => {
    const { save, award } = applyRace(defaultProg(), record({ ugc: true, trackId: 'ugc-123' }, { place: 1, trackId: 'ugc-123' }), world());
    expect(save.racedTracks).toEqual([]);
    expect(save.podiumTracks).toEqual([]);
    expect(award.achievements).toContain('track-maker');
  });

  it('battle unlocks after the third finished race', () => {
    let s = defaultProg();
    for (let i = 0; i < 2; i++) s = applyRace(s, record({}, { place: 6 }), world()).save;
    const r = applyRace(s, record({}, { place: 6 }), world());
    expect(r.award.unlocks).toContainEqual({ kind: 'mode', id: 'battle' });
  });

  it('records the head-to-head against the rival and Revenge', () => {
    const r = applyRace(defaultProg(), record({ rival: { kart: 0, name: 'Medutis', hit: true } }, { place: 2 }), world());
    expect(r.award.rival).toMatchObject({ name: 'Medutis', won: false, w: 0, l: 1 });
    expect(r.award.achievements).toContain('revenge');
    const r2 = applyRace(r.save, record({ rival: { kart: 0, name: 'Medutis', hit: false } }, { place: 1 }), world());
    expect(r2.save.rivals.Medutis).toEqual({ w: 1, l: 1 });
  });

  it('shortcuts count only on tracks with a route', () => {
    const s = applyRace(defaultProg(), record({ hasBranches: true }, { place: 5 }, { shortcuts: 1 }), world()).save;
    expect(s.shortcutTracks).toEqual(['kitchen']);
    const t = applyRace(defaultProg(), record({ hasBranches: false }, { place: 5 }, { shortcuts: 1 }), world()).save;
    expect(t.shortcutTracks).toEqual([]);
  });

  it('never mutates the save it was given', () => {
    const s = defaultProg();
    const copy = JSON.stringify(s);
    applyRace(s, record({}, { place: 1 }), world());
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('cups, medals, ghosts', () => {
  it('a 50cc cup unlocks 100cc and a trophy unlocks the Catnip Cup and a shelter cat', () => {
    const { save, award } = applyCup(defaultProg(), { cupId: 'kibble', cls: 0, place: 2 }, world());
    expect(save.classUnlocked).toBe(1);
    expect(save.trophies[trophyKey('kibble', 0, false)]).toBe(2);
    expect(award.unlocks.map((u) => u.kind).sort()).toEqual(['cat', 'class', 'cup']);
    expect(save.owned.cats).toHaveLength(1);
    expect(award.fish[0]).toEqual({ key: 'Cup trophy', amount: 30 });
  });

  it('a worse place later keeps the better trophy and pays nothing again', () => {
    const a = applyCup(defaultProg(), { cupId: 'kibble', cls: 1, place: 1 }, world()).save;
    const b = applyCup(a, { cupId: 'kibble', cls: 1, place: 3 }, world());
    expect(b.save.trophies['kibble:1']).toBe(1);
    expect(b.award.fish).toEqual([]);
    expect(a.classUnlocked).toBe(2);
    expect(a.achievements['gold-kibble']).toBeDefined();
  });

  it('gold in the Kibble Cup at 150cc unlocks Mirror; a Mirror cup is its own trophy', () => {
    const a = applyCup(defaultProg(), { cupId: 'kibble', cls: 2, place: 1 }, world());
    expect(a.save.mirror).toBe(true);
    expect(a.award.unlocks).toContainEqual({ kind: 'mirror', id: 'mirror' });
    const b = applyCup(a.save, { cupId: 'kibble', cls: 2, place: 1, mirror: true }, world());
    expect(b.save.trophies['kibble:2m']).toBe(1);
    expect(b.save.owned.cats).toHaveLength(2);
  });

  it('time trial medals pay 15/10/5, an upgrade pays the difference', () => {
    const a = applyMedal(defaultProg(), 'kitchen', 0, 3, world());
    expect(a.award.fish[0].amount).toBe(5);
    const b = applyMedal(a.save, 'kitchen', 0, 1, world());
    expect(b.award.fish[0].amount).toBe(10);
    expect(b.save.medals['kitchen:0']).toBe(1);
    const c = applyMedal(b.save, 'rooftops', 1, 1, world());
    expect(c.award.achievements).toContain('medal-hunter');
  });

  it('a Mirror time trial medal has its own slot and pays even after 150cc gold', () => {
    const gold150 = applyMedal(defaultProg(), 'kitchen', 2, 1, world());
    const mirror = applyMedal(gold150.save, 'kitchen', 2, 1, world(), true);
    expect(mirror.award.fish[0].amount).toBe(15);
    expect(mirror.award.medal).toEqual({ trackId: 'kitchen', cls: 2, medal: 1, mirror: true });
    expect(mirror.save.medals['kitchen:2']).toBe(1);
    expect(mirror.save.medals['kitchen:2m']).toBe(1);
    // and a Mirror bronze never fills (or lowers) the 150cc slot
    const bronze = applyMedal(defaultProg(), 'kitchen', 2, 3, world(), true);
    expect(bronze.save.medals['kitchen:2']).toBeUndefined();
    expect(bronze.save.medals['kitchen:2m']).toBe(3);
  });

  it('dare wins from the share ledger earn Ghostbuster once', () => {
    let s = applyGhostWins(defaultProg(), 0, world()).save;
    expect(s.ghostWins).toBe(0);
    const r = applyGhostWins(s, 1, world());
    expect(r.award.achievements).toEqual(['ghostbuster']);
    s = r.save;
    expect(applyGhostWins(s, 1, world()).award.achievements).toEqual([]);
    expect(applyGhostWins(s, 2, world()).award.achievements).toEqual([]);
  });

  it('the shell unlocking a class is mirrored', () => {
    const r = applyShellClass(defaultProg(), 1, world());
    expect(r.save.classUnlocked).toBe(1);
    expect(r.award.unlocks).toContainEqual({ kind: 'class', id: '1' });
  });
});
