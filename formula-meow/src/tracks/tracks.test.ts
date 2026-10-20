/**
 * Tracks lane acceptance (ITERATION-2.md, lane "tracks"): on every circuit, 21 AI races (3 classes × 7 seeds, the
 * scripted player bot in the player slot) end with no DNF, fewer than 3 head-on wall hits in the worst race, and the
 * AI taking the alternative route on 10–60 % of its laps. `FM_TRACKS_PRINT=1` prints the reports.
 */
import { describe, expect, it } from 'vitest';
import { TRACKS } from '../core/track/tracks';
import { formatTrackReport, runTrackHarness } from './harness';

describe('track harness (iteration 2 acceptance)', () => {
  for (const def of TRACKS) {
    it(`${def.name}: no DNF, < 3 head-on wall hits a race, branch use 10–60 % of AI laps`, { timeout: 600_000 }, () => {
      const r = runTrackHarness(def, [0, 1, 2], 7);
      if (process.env.FM_TRACKS_PRINT) console.log(formatTrackReport(r));
      expect(r.races).toBe(21);
      expect(r.dnf).toBe(0);
      expect(r.headOnMax).toBeLessThan(3);
      expect(r.progressJumps).toBe(0);
      for (const u of r.branchUse) {
        expect(u).toBeGreaterThanOrEqual(0.1);
        expect(u).toBeLessThanOrEqual(0.6);
      }
      // a lap takes 25–45 s for the winner (laps 850–1100 m)
      expect(r.bestLap).toBeGreaterThan(22);
      expect(r.bestLap).toBeLessThan(45);
    });
  }
});
