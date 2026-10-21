/**
 * Sim v10, GAPS B3 (less rubber-banding on Normal and Hard): catch-up XP and the trailing team's rat-camp bonus are
 * difficulty fields. Every difficulty keeps the v9 numbers: the cut on Normal and Hard (+25% a level, cap 50%, 1.25×
 * camp XP) raised the 10+ takedowns-behind win rate (balance 1.0% → 3.4%, novice vs Normal 2.4% → 7.1%), see
 * data/bots.ts DIFFICULTY_RULES.hard.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, type Difficulty } from '../../src/data/bots';
import { createMatch, fillPicks } from '../../src/sim/index';
import { catchUpBp } from '../../src/sim/progression/levels';
import { Kind, RANGE } from '../../src/sim/world';

/** Catch-up for hero 0 when every enemy hero is `enemyLevel` and hero 0 is level 1. */
function catchUpAt(difficulty: Difficulty, enemyLevel: number): number {
  const { picks, tricks } = fillPicks(7, 'clem', 'pounce');
  const m = createMatch({ seed: 7, picks, tricks, difficulty });
  const w = m.world;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero) continue;
    w.level[h] = w.team[h] === w.team[0] ? 1 : enemyLevel;
  }
  return catchUpBp(m, 0);
}

describe('sim v10 (GAPS B3)', () => {
  it('every difficulty keeps +35% a level beyond the first (cap 75%) and 1.5× camp XP', () => {
    for (const d of ['rookie', 'easy', 'normal', 'hard'] as const) {
      expect(DIFFICULTY_RULES[d].campBehindBp).toBe(15000);
      expect(catchUpAt(d, 2)).toBe(0);
      expect(catchUpAt(d, 3)).toBe(3500);
      expect(catchUpAt(d, 4)).toBe(7000);
      expect(catchUpAt(d, 6)).toBe(7500);
    }
  });
});
