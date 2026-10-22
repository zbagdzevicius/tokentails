/**
 * F12 (ITERATION-4.md): the Style score row and the Style best per track, driven by a real race's stats (the
 * average-player bot on Kitchen Counter rides its loop and lands its jump gap every lap).
 */
import { describe, expect, it } from 'vitest';
import { trackById } from '../core/track/tracks';
import { raceConfig, world as simWorld } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { buildRaceStats, styleScore } from '../core/app/race-stats';
import { GO_TICK } from '../core/sim/world';
import { applyRace } from './record';
import { defaultProg, migrateProg } from './state';
import { record, stats, world } from './fixtures.test-util';
import type { RaceStats } from '../types';

function botRace(trackId: string, seed: number): RaceStats {
  const w = simWorld({ ...raceConfig(trackById(trackId), { seed, cls: 0, humans: [5] }), tailTicks: 0 });
  while (!w.done) w.step([playerBot(w.ctx, 5, 0.5)]);
  return buildRaceStats(w.st.events, w.st.karts.length, GO_TICK)[5];
}

describe('Style score (F12)', () => {
  it('a real Kitchen race scores its loops and landings; the first one is the Style best', () => {
    const x = botRace('kitchen', 1);
    expect(x.loops).toBeGreaterThanOrEqual(3);
    expect(x.cleanLandings).toBeGreaterThanOrEqual(3);
    expect(x.style).toBe(styleScore(x));
    expect(x.style).toBeGreaterThan(0);
    const r = applyRace(defaultProg(), record({}, { place: 3 }, x), world());
    expect(r.award.style).toEqual({ score: x.style, prev: null, newBest: true });
    expect(r.save.styleBest.kitchen).toBe(x.style);
    expect(r.save.stats.loops).toBe(x.loops);
    expect(r.save.stats.cleanLandings).toBe(x.cleanLandings);
    // a weaker race keeps the best and says what it was
    const low = applyRace(r.save, record({}, { place: 3 }, { ...x, style: x.style - 100 }), world());
    expect(low.award.style).toEqual({ score: x.style - 100, prev: x.style, newBest: false });
    expect(low.save.styleBest.kitchen).toBe(x.style);
    // a better one replaces it
    const high = applyRace(low.save, record({}, { place: 3 }, { ...x, style: x.style + 40 }), world());
    expect(high.award.style?.newBest).toBe(true);
    expect(high.save.styleBest.kitchen).toBe(x.style + 40);
  });

  it('no stunts, a battle or a Track Doodle never sets a best', () => {
    expect(applyRace(defaultProg(), record({}, {}, stats()), world()).award.style).toBeUndefined();
    expect(applyRace(defaultProg(), record({}, { mode: 'battle' }, stats({ style: 300 })), world()).award.style).toBeUndefined();
    const ugc = applyRace(defaultProg(), record({ ugc: true, trackId: 'ugc-1' }, { trackId: 'ugc-1' }, stats({ style: 300, loops: 3 })), world());
    expect(ugc.award.style).toEqual({ score: 300, prev: null, newBest: false });
    expect(ugc.save.styleBest).toEqual({});
  });

  it('an old save without Style bests or stunt totals migrates to zero', () => {
    const old = JSON.parse(JSON.stringify(defaultProg())) as Record<string, unknown>;
    delete old.styleBest;
    delete (old.stats as Record<string, unknown>).loops;
    const m = migrateProg(old);
    expect(m.styleBest).toEqual({});
    expect(m.stats.loops).toBe(0);
    expect(migrateProg({ ...old, styleBest: { kitchen: 620, bad: -3, nope: 'x' } }).styleBest).toEqual({ kitchen: 620 });
  });
});
