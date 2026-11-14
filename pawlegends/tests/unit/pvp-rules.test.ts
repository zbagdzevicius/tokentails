/**
 * Sim v16 S-PvP rules (docs/plans/moba/V16.md §3.1.2): every DifficultyRules field is classified, and PVP_RULES holds
 * the neutral value of every human-only or one-sided field. A new rules field that is not classified here fails, so no
 * bot-only or human-only buff can leak into PvP unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, PVP_RULES, type DifficultyRules } from '../../src/data/bots';

/** Fields that favour one side (the human, its team or the enemy bots): PvP sets them to these neutral values. */
const NEUTRAL_IN_PVP: Partial<Record<keyof DifficultyRules, number | boolean>> = {
  coreOpenAt: 0,
  humanCoreOpenAt: 0,
  humanCoreFloorBp: 0,
  pushNeedsHuman: false,
  enemyBackdoor: true,
  humanRespawnBp: 10000,
  towerKnockback: false,
  carryAllies: 0,
  enemiesToHuman: false,
  humanDamageBp: 10000,
  humanTakenBp: 10000,
  humanRegenBp: 10000,
  humanPanicBp: 0,
  spareHuman: 0,
  enemyRespawnBp: 10000,
  enemyComeback: true,
  rallyBp: 0,
  rallyCap: 0,
  scriptFrom: 0,
  scriptUntil: 0,
  truceUntil: 0,
  enemyAheadXpBp: 10000,
  humanDeathCore: true,
  enemyFishBp: 10000,
  humanStreakRespawn: false,
  forfeitFrom: 7200,
  catchUpFrom: 5400,
};

/** Fields that apply to both teams alike: PvP keeps Hard's value. */
const SYMMETRIC: readonly (keyof DifficultyRules)[] = [
  'sideEdge',
  'nineLivesLossBp',
  'structureHpBp',
  'fortifyHeroBp',
  'coreHpBp',
  'nearAssists',
  'leadPressure',
  'takedownChipBp',
  'takedownChipCapBp',
  'takedownTowerChipBp',
  'catchUpPerLevelBp',
  'catchUpMaxBp',
  'campBehindBp',
];

describe('pvp-rules (no one-sided buff leaks into PvP)', () => {
  it('classifies every DifficultyRules field exactly once', () => {
    const keys = Object.keys(DIFFICULTY_RULES.hard).sort();
    const classified = [...Object.keys(NEUTRAL_IN_PVP), ...SYMMETRIC].sort();
    expect(classified).toEqual(keys);
    expect(Object.keys(PVP_RULES).sort()).toEqual(keys);
  });

  it('PVP_RULES holds the neutral value of every one-sided field and Hard’s value of every symmetric one', () => {
    for (const [k, v] of Object.entries(NEUTRAL_IN_PVP)) expect([k, PVP_RULES[k as keyof DifficultyRules]]).toEqual([k, v]);
    for (const k of SYMMETRIC) expect([k, PVP_RULES[k]]).toEqual([k, DIFFICULTY_RULES.hard[k]]);
    expect(PVP_RULES.humanStreakRespawn).toBe(false);
    expect(Object.isFrozen(PVP_RULES)).toBe(true);
  });

  it('every PvE row keeps the struggling-human respawn (v15 behaviour)', () => {
    for (const d of ['rookie', 'easy', 'normal', 'hard'] as const) expect(DIFFICULTY_RULES[d].humanStreakRespawn).toBe(true);
  });
});
