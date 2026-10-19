import { describe, expect, it } from 'vitest';
import { TRACKS } from '../../core/track/tracks';
import { formatReport, runBalance } from './harness';

const N = Number(process.env.FM_BALANCE_N) || 0;

describe('balance harness (GDD 4.1)', () => {
  it('AI-only races mix the field: places change, finishes stay close, every item gets used, attacks land', { timeout: 600_000 }, () => {
    const seeds = N > 0 ? Math.ceil(N / (TRACKS.length * 3)) : 4;
    const r = runBalance(TRACKS, [0, 1, 2], seeds);
    if (N > 0) console.log(formatReport(r));
    expect(r.placeChange).toBeGreaterThanOrEqual(1.0);
    expect(r.closeFinish).toBeGreaterThanOrEqual(0.5);
    for (const id of ['hairball', 'yarn', 'cucumber', 'catnip', 'box', 'bell', 'zoomies', 'laser'] as const) expect(r.items[id].uses).toBeGreaterThan(0);
    for (const id of ['hairball', 'yarn', 'bell', 'laser'] as const) expect(r.items[id].hits / r.items[id].uses).toBeGreaterThanOrEqual(0.2);
    // hits sting but never decide everything: about one to four per kart per race
    expect(r.hitsPerKart).toBeGreaterThan(0.5);
    expect(r.hitsPerKart).toBeLessThan(6);
  });
});
