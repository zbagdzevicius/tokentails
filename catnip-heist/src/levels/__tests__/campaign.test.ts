import { describe, expect, it } from 'vitest';
import { SIM_VERSION, TICK_HZ } from '../../types';
import { validateLevel } from '../../sim/level';
import { replay } from '../../sim/replay';
import { LEVEL_IDS, getLevel, getSolution, nextLevelId } from '..';
import { proveOneCatUnsolvable } from '../../../tools/solver';

describe('campaign', () => {
  it('has 8 levels in order heist-01 .. heist-08', () => {
    expect(LEVEL_IDS).toEqual(['heist-01', 'heist-02', 'heist-03', 'heist-04', 'heist-05', 'heist-06', 'heist-07', 'heist-08']);
    expect(nextLevelId('heist-01')).toBe('heist-02');
    expect(nextLevelId('heist-08')).toBeNull();
  });

  it('at least 6 levels are designed (and proven) to need both cats', () => {
    const two = LEVEL_IDS.filter((id) => getLevel(id).meta.twoCatRequired);
    expect(two.length).toBeGreaterThanOrEqual(6);
  });

  it('level shapes vary: not every level is the same size', () => {
    const sizes = new Set(LEVEL_IDS.map((id) => `${getLevel(id).tiles[0].length}x${getLevel(id).tiles.length}`));
    expect(sizes.size).toBeGreaterThanOrEqual(6);
  });

  for (const id of LEVEL_IDS) {
    describe(id, () => {
      const level = getLevel(id);
      const sol = getSolution(id);

      it('is a valid level with campaign meta', () => {
        expect(validateLevel(level)).toEqual([]);
        expect(level.id).toBe(id);
        expect(level.meta.name).toBeTruthy();
        expect(level.meta.intro).toBeTruthy();
        expect(level.meta.title).toMatch(/^Heist \d\d: /);
        expect(level.crate.catName).toBeTruthy();
        expect(typeof level.meta.twoCatRequired).toBe('boolean');
        expect(level.checkpoints.length).toBeGreaterThanOrEqual(1);
        expect(level.checkpoints.length).toBeLessThanOrEqual(3);
      });

      it('has 15-30 coins, within its maxCoins cap', () => {
        expect(level.meta.maxCoins).toBeDefined();
        expect(level.coins.length).toBeLessThanOrEqual(level.meta.maxCoins!);
        expect(level.coins.length).toBeGreaterThanOrEqual(15);
        expect(level.coins.length).toBeLessThanOrEqual(30);
      });

      it('has a par time of 1-4 minutes', () => {
        expect(level.meta.parTicks).toBeGreaterThanOrEqual(60 * TICK_HZ);
        expect(level.meta.parTicks).toBeLessThanOrEqual(240 * TICK_HZ);
      });

      it('its planned solution replays to a clean win with the recorded hash, under par', () => {
        expect(sol.levelId).toBe(id);
        expect(sol.simVersion).toBe(SIM_VERSION);
        const a = replay(level, sol);
        const b = replay(level, sol);
        expect(a.final.won).toBe(true);
        expect(a.final.rescued).toBe(true);
        expect(a.final.spottedCount).toBe(0);
        expect(a.final.hash).toBe(sol.finalHash);
        expect(a.final.score).toBe(sol.score);
        expect(a.final.coinsCollected).toBe(sol.coins);
        expect(b.hashes).toEqual(a.hashes);
        expect(a.final.tick).toBe(sol.ticks);
        expect(sol.ticks).toBeLessThanOrEqual(level.meta.parTicks);
      });

      if (level.meta.twoCatRequired) {
        it('cannot be finished by one cat (static proof)', () => {
          const proof = proveOneCatUnsolvable(level);
          expect(proof.unsolvable).toBe(true);
          for (const c of proof.cats) expect(c.canReachCrate && c.canReachExit).toBe(false);
          // and the recorded win really uses both cats
          expect(sol.runs.some((r) => r[2] & 1)).toBe(true);
        });
      }
    });
  }
});
