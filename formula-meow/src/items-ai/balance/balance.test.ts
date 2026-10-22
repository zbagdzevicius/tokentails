import { describe, expect, it } from 'vitest';
import { TRACKS, KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { playerBot } from './bots';

describe('balance (GDD 5.3)', () => {
  // SIM_VERSION 11 (ITERATION-4.md F1): the 72-race gate (6 tracks × 12 seeds) replaces the Kitchen-only 20 seeds,
  // which swung with any sim change: v10 reached 85 % on seeds 1–20 but 74 % on seeds 1–80 (v11: 75 % and 79 %)
  const podiumRate = (cls: 0 | 2): number => {
    let podium = 0;
    let n = 0;
    for (const def of TRACKS)
      for (let seed = 1; seed <= 12; seed++) {
        const w = world(raceConfig(def, { seed, cls, humans: [5] }));
        while (!w.done) w.step([playerBot(w.ctx, 5, 0.5)]);
        if (w.result().player.place <= 3) podium++;
        n++;
      }
    return podium / n;
  };

  it('Kitten: the average-player bot from 6th on the grid reaches the podium in 70–90 % of 72 races (6 tracks × 12 seeds)', { timeout: 900_000 }, () => {
    const r = podiumRate(0);
    expect(r).toBeGreaterThanOrEqual(0.7);
    expect(r).toBeLessThanOrEqual(0.9);
  });

  it('Zoomies: the same bot reaches the podium in at most 80 % of 72 races', { timeout: 900_000 }, () => {
    expect(podiumRate(2)).toBeLessThanOrEqual(0.8);
  });

  it('150cc is not a walkover: the same bot does not win every race', { timeout: 600_000 }, () => {
    for (const def of TRACKS) {
      let wins = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const w = world(raceConfig(def, { seed, cls: 2, humans: [5] }));
        while (!w.done) w.step([playerBot(w.ctx, 5, 0.5)]);
        if (w.result().player.place === 1) wins++;
      }
      expect(wins).toBeLessThan(8);
    }
  });

  // iteration 2 (feel lane): the field spreads out on purpose (target 8–15 s first to last at 50cc), but never strings out
  it('the field stays together: the Kitten pack finishes within 15 s of the winner', { timeout: 600_000 }, () => {
    const w = world({ ...raceConfig(KITCHEN, { seed: 2, cls: 0 }), tailTicks: 60 * 60 });
    while (!w.done) w.step();
    const t = w.result().places.map((p) => p.time!);
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(15);
  });
});
