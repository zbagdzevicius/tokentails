import { describe, expect, it } from 'vitest';
import { TRACKS, KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { playerBot } from './bots';

describe('balance (GDD 5.3)', () => {
  it('Kitten on Kitchen Counter: the average-player bot from 6th on the grid reaches the podium in ≥ 80 % of seeds', () => {
    let podium = 0;
    const N = 20;
    for (let seed = 1; seed <= N; seed++) {
      const w = world(raceConfig(KITCHEN, { seed, cls: 0, humans: [5] }));
      while (!w.done) w.step([playerBot(w.ctx, 5, 0.5)]);
      if (w.result().player.place <= 3) podium++;
    }
    expect(podium / N).toBeGreaterThanOrEqual(0.8);
  });

  it('150cc is not a walkover: the same bot does not win every race', () => {
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

  it('the field stays close: the Kitten pack finishes within 12 s of the winner', () => {
    const w = world({ ...raceConfig(KITCHEN, { seed: 2, cls: 0 }), tailTicks: 60 * 60 });
    while (!w.done) w.step();
    const t = w.result().places.map((p) => p.time!);
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(12);
  });
});
