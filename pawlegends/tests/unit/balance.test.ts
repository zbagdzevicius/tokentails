/**
 * Balance gates (POC.md §14 M3, §15 item 11). Nightly (PAWLEGENDS_NIGHTLY=1): 2,000 Normal-vs-Normal seeds, slot 0
 * played by the Normal brain from outside the sim and its hero and trick drawn per seed, so every hero plays both
 * sides. Median length 7:00 to 9:00, p95 ≤ 10:30, every match ends by 11:00; side win rate 45% to 55%; each hero 42%
 * to 58%. The seeds run in parallel processes on the bundled sim (tools/lib/batch.mjs); each match is still one
 * deterministic run. The day-to-day run is
 * `npm run match -- --seeds 200 --profile normal --difficulty normal --hero random --balance --quiet`, which checks
 * the same gates.
 */
import { describe, expect, it } from 'vitest';
import { TICK_HZ, TIMELINE } from '../../src/data/timeline';
import { NIGHTLY } from './bot-helpers';

describe.skipIf(!NIGHTLY)('balance (§15 item 11)', { timeout: 7200000 }, () => {
  it('2,000 Normal-vs-Normal matches hit the length, side and hero gates', async () => {
    const { runBatch } = await import('../../tools/lib/batch.mjs');
    const { rows, perHero } = await runBatch({ profile: 'normal', difficulty: 'normal', from: 1, seeds: 2000 });
    expect(rows).toHaveLength(2000);
    const len = rows.map((r) => r.ticks as number).sort((a, b) => a - b);
    const at = (p: number) => len[Math.min(len.length - 1, Math.floor((len.length * p) / 100))];
    const fmt = (t: number) => `${Math.floor(t / TICK_HZ / 60)}:${String(Math.floor(t / TICK_HZ) % 60).padStart(2, '0')}`;
    const side = (100 * rows.filter((r) => r.winner === 0).length) / rows.length;
    const heroes = Object.entries(perHero).map(([h, v]) => `${h} ${((100 * v.wins) / v.slots).toFixed(1)}%`);
    console.log(
      `balance nightly: ${rows.length} matches, median ${fmt(at(50))}, p95 ${fmt(at(95))}, max ${fmt(len[len.length - 1])}, ` +
        `core kills ${rows.filter((r) => r.reason === 'core').length}, Purrhaven ${side.toFixed(1)}%, ${heroes.join(', ')}`,
    );
    expect(at(50)).toBeGreaterThanOrEqual(7 * 60 * TICK_HZ);
    expect(at(50)).toBeLessThanOrEqual(9 * 60 * TICK_HZ);
    expect(at(95)).toBeLessThanOrEqual(10 * 60 * TICK_HZ + 30 * TICK_HZ);
    expect(len[len.length - 1]).toBeLessThanOrEqual(TIMELINE.safetyEnd);
    expect(rows.every((r) => r.reason === 'core')).toBe(true);
    expect(side).toBeGreaterThanOrEqual(45);
    expect(side).toBeLessThanOrEqual(55);
    for (const [, h] of Object.entries(perHero)) {
      expect((100 * h.wins) / h.slots).toBeGreaterThanOrEqual(42);
      expect((100 * h.wins) / h.slots).toBeLessThanOrEqual(58);
    }
  });
});
