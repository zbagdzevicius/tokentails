/**
 * Sim v33 (docs/plans/moba/V33-KILLS.md): kills matter more (kill XP 120 + 30 × victim level, the killer +50% unshared,
 * bounties from a streak of 2, bigger shutdowns) and respawns grow with the match time (DifficultyRules.respawnGrowBp).
 * Sim v35 (V35-DEATHS.md, tests/unit/sim-v35.test.ts) raised the kill XP, the bounties and the respawn growth; what v33
 * set and v35 kept is checked here.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES } from '../../src/data/bots';
import { FISH } from '../../src/data/fish';
import { RESPAWN, XP } from '../../src/data/xp';
import { respawnTicks } from '../../src/sim/combat/damage';
import { shutdownFishOf } from '../../src/sim/progression/xp';

describe('sim v33 kill rewards (kept in v35)', () => {
  it('bounties from a streak of 2, shutdown Fish and the kill Fish', () => {
    expect(XP.bountyStreak).toBe(2);
    expect([1, 2, 4, 9].map(shutdownFishOf)).toEqual([0, 120, 240, 400]);
    expect(FISH.kill).toBe(150);
  });
});

describe('sim v33 respawn growth (kept in v35)', () => {
  it('Rookie never grows; growth starts at 3:00', () => {
    expect(DIFFICULTY_RULES.rookie.respawnGrowBp).toBe(0);
    const g = DIFFICULTY_RULES.normal.respawnGrowBp;
    // level 6: no growth up to 3:00, longer after it
    expect(respawnTicks(6, RESPAWN.growFrom, 1e9, g)).toBe(respawnTicks(6, RESPAWN.growFrom, 1e9, 0));
    expect(respawnTicks(6, RESPAWN.growFrom + 5 * 1800, 1e9, g)).toBeGreaterThan(respawnTicks(6, RESPAWN.growFrom + 5 * 1800, 1e9, 0));
  });
});
