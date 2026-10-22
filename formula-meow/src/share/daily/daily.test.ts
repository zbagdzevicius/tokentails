import { describe, expect, it } from 'vitest';
import { Modifier, type TrackDef } from '../../types';
import { TRACKS } from '../../core/track/tracks';
import { MUTATORS, dailyLabel, gridBanner, raceTag } from '../../core/app/race-labels';
import { DAILY_MUTATOR_DAY, dailyMutator, dailyResultDay, dailySetup, isDailyRace } from './daily';

/** The Daily Cup setup as SIM_VERSION 10 dealt it (track rotation, mirror every other rotation, no mutator). */
function legacySetup(day: number, tracks: readonly TrackDef[]) {
  const n = tracks.length;
  const i = (((day - 1) % n) + n) % n;
  const mirror = Math.floor((day - 1) / n) % 2 === 1;
  // same hash as daily.ts (kept here verbatim so a change to it shows up as a test failure)
  let h = 0x811c9dc5;
  const s = `daily:${day}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return { trackId: tracks[i].id, seed: h & 0x7fffffff, cls: 1, modifiers: mirror ? Modifier.Mirror : 0 };
}

describe('Daily Cup mutator (ITERATION-4.md F11)', () => {
  it('days before the cutoff keep their setup and isDailyRace keys', () => {
    expect(DAILY_MUTATOR_DAY).toBe(9);
    for (let day = -2; day < DAILY_MUTATOR_DAY; day++) {
      const old = legacySetup(day, TRACKS);
      const d = dailySetup(day, TRACKS);
      expect({ trackId: d.track.id, seed: d.seed, cls: d.cls, modifiers: d.modifiers }).toEqual(old);
      expect(d.mutator).toBeUndefined();
      expect(d.label).not.toContain('·');
      if (day >= 1) {
        expect(isDailyRace(day, TRACKS, old)).toBe(true);
        expect(dailyResultDay(TRACKS, old, { setupDay: day, startDay: day, nowDay: day })).toEqual({ day, rankable: true });
      }
    }
  });

  it('from the cutoff every day deals exactly one mutator on top of the rotation', () => {
    for (let day = DAILY_MUTATOR_DAY; day < DAILY_MUTATOR_DAY + 60; day++) {
      const d = dailySetup(day, TRACKS);
      const old = legacySetup(day, TRACKS);
      expect(d.mutator).toBeDefined();
      // track, seed, class and mirror are what they would have been
      expect(d.track.id).toBe(old.trackId);
      expect(d.seed).toBe(old.seed);
      expect(d.modifiers & Modifier.Mirror).toBe(old.modifiers);
      expect(d.modifiers & ~Modifier.Mirror).toBe(d.mutator!.bit);
      expect(d.label).toContain(d.mutator!.name);
      // the mutator is part of the race's key: the same race without it is not the Daily Cup
      expect(isDailyRace(day, TRACKS, { trackId: d.track.id, seed: d.seed, cls: d.cls, modifiers: d.modifiers })).toBe(true);
      expect(isDailyRace(day, TRACKS, old)).toBe(false);
    }
  });

  it('each five-day block deals every mutator once (no repeats two days running inside a block), same for everyone', () => {
    const n = MUTATORS.length;
    for (let b = 0; b < 12; b++) {
      const ids = new Set<string>();
      for (let k = 0; k < n; k++) ids.add(dailyMutator(DAILY_MUTATOR_DAY + b * n + k)!.id);
      expect(ids.size).toBe(n);
    }
    expect(dailyMutator(20)?.id).toBe(dailyMutator(20)?.id);
    // not the same order every week
    const orders = new Set<string>();
    for (let b = 0; b < 8; b++) orders.add([0, 1, 2, 3, 4].map((k) => dailyMutator(DAILY_MUTATOR_DAY + b * n + k)!.id).join());
    expect(orders.size).toBeGreaterThan(2);
  });

  it('labels: the grid banner, HUD tag and menu say the day and its mutator', () => {
    const d = dailySetup(DAILY_MUTATOR_DAY, TRACKS);
    const name = d.mutator!.name;
    expect(dailyLabel(9, d.modifiers)).toBe(`Daily Cup #9 · ${name}`);
    expect(gridBanner('daily', 9, d.modifiers)).toBe(`🏆 Daily Cup #9 · ${name}`);
    expect(raceTag('daily', 9, d.modifiers)).toBe(`Daily Cup #9 · ${name}`);
    // before the cutoff: as today
    expect(gridBanner('daily', 3, dailySetup(3, TRACKS).modifiers)).toBe('🏆 Daily Cup #3');
    expect(raceTag('daily', 7, Modifier.Mirror)).toBe('Daily Cup #7');
    // a Wild Card single race
    expect(gridBanner('race', undefined, Modifier.BoxParty)).toBe('🃏 Wild Card: 📦 Box Party');
    expect(raceTag('race', undefined, Modifier.CatnipRain)).toBe('🌿 Catnip Rain');
    expect(gridBanner('race', undefined, Modifier.Mirror)).toBeNull();
    expect(raceTag('gp', undefined, Modifier.BoxParty)).toBeUndefined();
  });
});
