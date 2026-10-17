import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, snapshot } from '../../src/sim/index';

describe('fillPicks and createMatch (§6.8)', () => {
  it('keeps the human pick, no duplicates within a team, stable per seed', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { picks, tricks } = fillPicks(seed, 'cacklejaw', 'hiss');
      expect(picks[0]).toBe('cacklejaw');
      expect(tricks[0]).toBe('hiss');
      expect(new Set(picks.slice(0, 3)).size).toBe(3);
      expect(new Set(picks.slice(3)).size).toBe(3);
      expect(fillPicks(seed, 'cacklejaw', 'hiss')).toEqual({ picks, tricks });
    }
  });
  it('validates configs', () => {
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    expect(() => createMatch({ seed: -1, picks, tricks, difficulty: 'easy' })).toThrow();
    expect(() => createMatch({ seed: 1, picks: picks.slice(0, 5), tricks, difficulty: 'easy' })).toThrow();
    expect(() => createMatch({ seed: 1, picks: ['clem', 'clem', 'sage', ...picks.slice(3)], tricks, difficulty: 'easy' })).toThrow();
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
