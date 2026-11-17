/**
 * Sim v33 (docs/plans/moba/V33-KILLS.md): kills matter more (kill XP 120 + 30 × victim level, the killer +50% unshared,
 * bounties from a streak of 2, bigger shutdowns) and respawns grow with the match time (DifficultyRules.respawnGrowBp).
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, PVP_RULES } from '../../src/data/bots';
import { FISH } from '../../src/data/fish';
import { RESPAWN, XP } from '../../src/data/xp';
import { respawnTicks } from '../../src/sim/combat/damage';
import { bountyOf, shutdownFishOf } from '../../src/sim/progression/xp';

describe('sim v33 kill rewards', () => {
  it('kill XP, killer bonus, bounties and shutdowns', () => {
    expect([XP.killBase, XP.killPerLevel, XP.killerBonusBp]).toEqual([120, 30, 5000]);
    expect([0, 1, 2, 3, 5, 9].map(bountyOf)).toEqual([0, 0, 100, 150, 250, 250]);
    expect([1, 2, 4, 9].map(shutdownFishOf)).toEqual([0, 120, 240, 400]);
    expect(FISH.kill).toBe(150);
  });
});

describe('sim v33 respawn growth', () => {
  it('Rookie 0, Easy +4%, Normal, Hard and PvP +8% a minute from 3:00', () => {
    expect(['rookie', 'easy', 'normal', 'hard'].map((d) => DIFFICULTY_RULES[d as 'rookie'].respawnGrowBp)).toEqual([0, 400, 800, 800]);
    expect(PVP_RULES.respawnGrowBp).toBe(800);
  });

  it('short early, long late, capped at +120%', () => {
    const g = DIFFICULTY_RULES.normal.respawnGrowBp;
    // level 6 (252 ticks = 8.4 s): no growth before 3:00, +40% at 8:00, at most +120%
    expect(respawnTicks(6, RESPAWN.growFrom, 1e9, g)).toBe(252);
    expect(respawnTicks(6, RESPAWN.growFrom + 5 * 1800, 1e9, g)).toBe(352);
    expect(respawnTicks(6, RESPAWN.growFrom + 30 * 1800, 1e9, g)).toBe(554);
    // without growth (Rookie) the v32 wait
    expect(respawnTicks(6, RESPAWN.growFrom + 5 * 1800, 1e9, 0)).toBe(252);
  });
});
