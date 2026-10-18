import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, snapshot } from '../../src/sim/index';

describe('fillPicks and createMatch (§6.8)', () => {
  it('keeps the human pick, species teams (sim v5: cats vs dogs, each side hero at least once), stable per seed', () => {
    for (const human of ['cacklejaw', 'clem'] as const) {
      const own = human === 'clem' ? ['clem', 'sage'] : ['brutus', 'cacklejaw'];
      const other = human === 'clem' ? ['brutus', 'cacklejaw'] : ['clem', 'sage'];
      for (let seed = 0; seed < 300; seed++) {
        const { picks, tricks } = fillPicks(seed, human, 'hiss');
        expect(picks[0]).toBe(human);
        expect(tricks[0]).toBe('hiss');
        expect(new Set(picks.slice(0, 3))).toEqual(new Set(own));
        expect(new Set(picks.slice(3))).toEqual(new Set(other));
        expect(fillPicks(seed, human, 'hiss')).toEqual({ picks, tricks });
      }
    }
  });
  it('validates configs', () => {
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    expect(() => createMatch({ seed: -1, picks, tricks, difficulty: 'easy' })).toThrow();
    expect(() => createMatch({ seed: 1, picks: picks.slice(0, 5), tricks, difficulty: 'easy' })).toThrow();
    expect(() => createMatch({ seed: 1, picks: ['clem', 'tabby' as 'clem', 'sage', ...picks.slice(3)], tricks, difficulty: 'easy' })).toThrow();
    // Sim v5: a team may field a hero twice (2 heroes a side for 3 slots).
    expect(() => createMatch({ seed: 1, picks: ['clem', 'clem', 'sage', ...picks.slice(3)], tricks, difficulty: 'easy' })).not.toThrow();
  });
  it('places 6 heroes, 8 towers, 2 cores and 2 fountains, mirrored', () => {
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    const s = snapshot(createMatch({ seed: 1, picks, tricks, difficulty: 'easy' }), 0);
    const count = (k: string) => s.entities.filter((e) => e.kind === k).length;
    expect([count('hero'), count('tower'), count('core'), count('fountain')]).toEqual([6, 8, 2, 2]);
    const cores = s.entities.filter((e) => e.kind === 'core');
    expect(cores[0].x + cores[1].x).toBe(100000);
    const h0 = s.entities.find((e) => e.id === 0)!;
    expect(h0.cooldowns).toBeDefined();
    expect(s.entities.find((e) => e.id === 3)!.cooldowns).toBeUndefined();
  });
});
