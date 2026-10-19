import { describe, expect, it } from 'vitest';
import { cupClassUnlocks, isUnlocked, refreshUnlocks, trailsEarned, unlockState } from './unlocks';
import { defaultProg } from './state';
import { playableShelterCats, shelterCatsEarned, shelterUnlockOrder } from '../share/pinkpaw/unlocks';
import { PINK_PAW_CATS } from '../share/pinkpaw/pink-paw';
import { TRAIL_IDS } from '../content/ids';

describe('unlock rules', () => {
  it('100cc: finishing any 50cc cup (not a Mirror cup)', () => {
    expect(cupClassUnlocks('kibble', 0, 8, false).cls).toBe(1);
    expect(cupClassUnlocks('catnip', 0, 5, false).cls).toBe(1);
  });

  it('150cc: a podium in a 100cc cup', () => {
    expect(cupClassUnlocks('kibble', 1, 3, false).cls).toBe(2);
    expect(cupClassUnlocks('kibble', 1, 4, false).cls).toBeNull();
  });

  it('Mirror: gold in the Kibble Cup at 150cc', () => {
    expect(cupClassUnlocks('kibble', 2, 1, false).mirror).toBe(true);
    expect(cupClassUnlocks('kibble', 2, 2, false).mirror).toBe(false);
    expect(cupClassUnlocks('catnip', 2, 1, false).mirror).toBe(false);
  });

  it('Catnip Cup: any Kibble Cup trophy', () => {
    const s = defaultProg();
    expect(isUnlocked(s, 'cup:catnip')).toBe(false);
    s.trophies['kibble:0'] = 3;
    expect(isUnlocked(s, 'cup:catnip')).toBe(true);
    const t = defaultProg();
    t.trophies['catnip:0'] = 1;
    expect(isUnlocked(t, 'cup:catnip')).toBe(false);
  });

  it('Battle: after 3 finished races; Time Trial from the start', () => {
    const s = defaultProg();
    expect(isUnlocked(s, 'mode:tt')).toBe(true);
    expect(unlockState(s, 'mode:battle')).toEqual({ ok: false, hint: 'Finish 3 races' });
    s.stats.finishes = 3;
    expect(isUnlocked(s, 'mode:battle')).toBe(true);
  });

  it('trails: the first podium on the trail track', () => {
    expect(trailsEarned({ podiumTracks: [] })).toEqual([0]);
    expect(trailsEarned({ podiumTracks: ['kitchen', 'yarn'] }).map((i) => TRAIL_IDS[i])).toEqual(['none', 'sparkle', 'rainbow']);
  });

  it('Pink Paw cats: one per cup trophy, roster order, never an adopted cat', () => {
    expect(shelterCatsEarned(0)).toEqual([]);
    expect(shelterCatsEarned(2)).toEqual(shelterUnlockOrder().slice(0, 2).map((c) => c.id));
    expect(shelterUnlockOrder().every((c) => c.status !== 'ADOPTED')).toBe(true);
    const ids = shelterCatsEarned(3);
    expect(playableShelterCats(ids).map((c) => c.id)).toEqual(ids);
    expect(playableShelterCats(['bogus'])).toEqual([]);
    expect(shelterCatsEarned(99).length).toBe(PINK_PAW_CATS.filter((c) => c.status !== 'ADOPTED').length);
  });

  it('refreshUnlocks lists what changed and marks new trails and cats as fresh', () => {
    const before = defaultProg();
    const after = defaultProg();
    after.podiumTracks = ['rooftops'];
    after.trophies = { 'kibble:0': 2 };
    after.classUnlocked = 1;
    after.stats.finishes = 3;
    const r = refreshUnlocks(before, after);
    expect(r.news.map((n) => n.kind).sort()).toEqual(['cat', 'class', 'cup', 'mode', 'trail']);
    expect(r.save.owned.trails).toEqual([0, 2]);
    expect(r.save.owned.cats).toHaveLength(1);
    expect(r.save.fresh).toContain('trail:fishbones');
    // nothing new the second time
    expect(refreshUnlocks(r.save, r.save).news).toEqual([]);
  });
});
