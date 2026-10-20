/**
 * Stabilise acceptance (ITERATION-2.md 1.8): a 72-race headless harness (2 tracks × 3 classes × 12 seeds, the
 * scripted player bot in the player slot) and 20 random doodle tracks. `FM_HARNESS_PRINT=1` prints the reports.
 */
import { describe, expect, it } from 'vitest';
import { TRACKS } from '../track/tracks';
import { formatHarness, runHarness } from './harness';
import { doodleWalls, randomDoodles } from '../../test/doodles';

describe('stabilise harness', () => {
  it('72 races: no laser multi-hits, bump or overtake spam, finish mismatches or 50cc DNFs; < 3 head-on wall hits a race; no progress jumps', () => {
    const r = runHarness(TRACKS, [0, 1, 2], 12);
    if (process.env.FM_HARNESS_PRINT) console.log(formatHarness(r));
    expect(r.races).toBe(TRACKS.length * 36); // [tracks lane] 2 tracks × 3 classes × 12 seeds became 6 tracks
    expect(r.laserMultiHits).toBe(0);
    expect(r.bumpSpam).toBe(0);
    expect(r.overtakeSpam).toBe(0);
    expect(r.finishMismatches).toBe(0);
    expect(r.dnf[0]).toBe(0);
    expect(r.headOnMax).toBeLessThan(3);
    expect(r.progressJumps).toBe(0);
  }, 1_800_000);

  it('20 random doodle tracks: the AI scrapes a wall fewer than 2 times per lap on average (B15)', () => {
    const defs = randomDoodles(20, 3);
    expect(defs.length).toBe(20);
    for (const cls of [0, 1, 2] as const) {
      const r = doodleWalls(defs, cls);
      if (process.env.FM_HARNESS_PRINT) console.log(`doodles cls ${cls}: mean ${r.mean.toFixed(2)}, worst ${r.worst.toFixed(2)} (${r.worstId})`);
      expect(r.mean).toBeLessThan(2);
      expect(r.worst).toBeLessThan(3);
    }
  }, 1_800_000);
});
