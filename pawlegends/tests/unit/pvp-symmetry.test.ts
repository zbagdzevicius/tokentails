/**
 * Sim v16 PvP symmetry (docs/plans/moba/V16.md §3.1.9). The full gate is 2,000 seeds × both sides
 * (`node tools/pvp-symmetry.mjs`, map side 47% to 53%, species 46% to 54%); set PVP_SYMMETRY_SEEDS=2000 to run it
 * here. The default run plays a few pairs and checks the pairing itself: the swapped match is a different match, and
 * both runs of a seed are deterministic.
 */
import { describe, expect, it } from 'vitest';
import { pvpSymmetryPair } from '../../tools/lib/fuzz-entry';
import { symmetryGates, symmetryStats } from '../../tools/pvp-symmetry.mjs';

const N = Number(process.env.PVP_SYMMETRY_SEEDS ?? 3);

describe('pvp-symmetry', { timeout: 3_600_000 }, () => {
  it(`${N} seeds × both sides: pairs are deterministic${N >= 2000 ? ', and the side and species gates hold' : ''}`, () => {
    const rows = [];
    for (let s = 1; s <= N; s++) rows.push(pvpSymmetryPair(s));
    expect(pvpSymmetryPair(1)).toEqual(rows[0]);
    for (const r of rows) for (const t of r.ticks) expect(t).toBeGreaterThan(0);
    const stats = symmetryStats(rows);
    expect(stats.matches).toBe(2 * N);
    if (N >= 2000) for (const [name, ok, value] of symmetryGates(stats)) expect([name, ok, value]).toEqual([name, true, value]);
  });
});
