import { describe, expect, it } from 'vitest';
import { KITCHEN, ROOFTOPS, TRACKS } from '../../core/track/tracks';
import { formatShape, runShape } from './shape';

// 2 tracks × 30 seeds = 60 races per class (the full 200-race run: FM_SHAPE_SEEDS=100). The two v1 tracks keep this
// test stable while the tracks lane adds circuits; the integrator re-runs it on every track (FM_SHAPE_ALL=1).
const SEEDS = Number(process.env.FM_SHAPE_SEEDS) || 30;

// Targets (playtest round 2, SIM_VERSION 7: "the field strings out, so racing is lonely"): the pack now finishes
// together (5–10 s first to last at 50cc, 3–7 s at 150cc) and the bot's wins are close (`margin` < 2 s), so the podium
// share rises; 150cc stays clearly harder than 50cc. The 60-race default run allows its sampling error (about ±6 points
// of podium share) around them, so an unrelated change does not fail it by luck.
const TARGET = { podium50: [0.75, 0.95], podium150: [0.4, 0.75], spread50: [5, 10], spread150: [3, 7] } as const;
const SLACK = SEEDS >= 100 ? 0 : 1;

describe('race shape (feel lane targets)', () => {
  it('player-bot podium 75–95 % at 50cc and 40–75 % at 150cc; finish spread 5–10 s at 50cc and 3–7 s at 150cc; close wins', { timeout: 600_000 }, () => {
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
    // nobody wins alone: 1st beats 2nd by under 2 s on average in every class
    for (const r of rows) expect(r.margin).toBeLessThan(2);
  });
});
