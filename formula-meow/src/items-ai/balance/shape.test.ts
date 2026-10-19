import { describe, expect, it } from 'vitest';
import { KITCHEN, ROOFTOPS, TRACKS } from '../../core/track/tracks';
import { formatShape, runShape } from './shape';

// 2 tracks × 30 seeds = 60 races per class (the full 200-race run: FM_SHAPE_SEEDS=100). The two v1 tracks keep this
// test stable while the tracks lane adds circuits; the integrator re-runs it on every track (FM_SHAPE_ALL=1).
const SEEDS = Number(process.env.FM_SHAPE_SEEDS) || 30;

// Plan targets (ITERATION-2.md "Race shape"), met by the 200-race run (FM_SHAPE_SEEDS=100: 77 % / 42 % podium, 10.3 s /
// 5.9 s spread at the feel lane's commit). The 60-race default run allows its sampling error (about ±6 points of
// podium share) around them, so an unrelated change does not fail it by luck.
const TARGET = { podium50: [0.7, 0.9], podium150: [0.25, 0.5], spread50: [8, 15], spread150: [5, 8] } as const;
const SLACK = SEEDS >= 100 ? 0 : 1;

describe('race shape (feel lane targets)', () => {
  it('player-bot podium 70–90 % at 50cc and 25–50 % at 150cc; finish spread 8–15 s at 50cc and 5–8 s at 150cc', { timeout: 600_000 }, () => {
    const rows = runShape(process.env.FM_SHAPE_ALL ? TRACKS : [KITCHEN, ROOFTOPS], [0, 1, 2], SEEDS);
    if (process.env.FM_SHAPE_PRINT) console.log(formatShape(rows));
    const [k50, , k150] = rows;
    const p = 0.06 * SLACK;
    const s = 0.5 * SLACK;
    expect(k50.podium).toBeGreaterThanOrEqual(TARGET.podium50[0] - p);
    expect(k50.podium).toBeLessThanOrEqual(TARGET.podium50[1] + p);
    expect(k150.podium).toBeGreaterThanOrEqual(TARGET.podium150[0] - p);
    expect(k150.podium).toBeLessThanOrEqual(TARGET.podium150[1] + p);
    expect(k50.spread).toBeGreaterThanOrEqual(TARGET.spread50[0] - s);
    expect(k50.spread).toBeLessThanOrEqual(TARGET.spread50[1] + s);
    expect(k150.spread).toBeGreaterThanOrEqual(TARGET.spread150[0] - s);
    expect(k150.spread).toBeLessThanOrEqual(TARGET.spread150[1] + s);
    // the class order holds: 50cc is the friendliest, 150cc the hardest
    expect(k50.podium).toBeGreaterThan(k150.podium);
  });
});
