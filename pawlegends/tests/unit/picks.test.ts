import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, snapshot } from '../../src/sim/index';

describe('fillPicks and createMatch (§6.8)', () => {
  it('keeps the human pick, species teams (sim v5: cats vs dogs), stable per seed', () => {
    const cats = ['clem', 'sage', 'lambo', 'aviete', 'bengas', 'gabe'];
    const dogs = ['brutus', 'cacklejaw'];
    for (const human of ['cacklejaw', 'clem', 'gabe'] as const) {
      const humanCat = human !== 'cacklejaw';
      for (let seed = 0; seed < 300; seed++) {
        const { picks, tricks } = fillPicks(seed, human, 'hiss');
        expect(picks[0]).toBe(human);
        expect(tricks[0]).toBe('hiss');
        const catTeam = humanCat ? picks.slice(0, 3) : picks.slice(3);
        const dogTeam = humanCat ? picks.slice(3) : picks.slice(0, 3);
        // Sim v9: 6 cats, so a cat team never repeats a hero; 2 dogs, so a dog team always fields both and one twice.
        for (const h of catTeam) expect(cats).toContain(h);
        expect(new Set(catTeam).size).toBe(3);
        expect(new Set(dogTeam)).toEqual(new Set(dogs));
        expect(fillPicks(seed, human, 'hiss')).toEqual({ picks, tricks });
      }
    }
  });

  it('sim v9: every cat hero, the shelter champions included, shows up as a bot pick', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) for (const h of fillPicks(seed, 'brutus', 'pounce').picks.slice(3)) seen.add(h);
    expect([...seen].sort()).toEqual(['aviete', 'bengas', 'clem', 'gabe', 'lambo', 'sage']);
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
