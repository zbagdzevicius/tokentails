import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, snapshot } from '../../src/sim/index';

describe('fillPicks and createMatch (§6.8)', () => {
  it('keeps the human pick, species teams (sim v5: cats vs dogs), stable per seed', () => {
    const cats = ['clem', 'sage', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts'];
    const dogs = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
    for (const human of ['cacklejaw', 'clem', 'gabe', 'chili'] as const) {
      const humanCat = human !== 'cacklejaw' && human !== 'chili';
      for (let seed = 0; seed < 300; seed++) {
        const { picks, tricks } = fillPicks(seed, human, 'hiss');
        expect(picks[0]).toBe(human);
        expect(tricks[0]).toBe('hiss');
        const catTeam = humanCat ? picks.slice(0, 3) : picks.slice(3);
        const dogTeam = humanCat ? picks.slice(3) : picks.slice(0, 3);
        // Sim v11: 10 cats, so a cat team never repeats a hero. Sim v14: 7 dogs, so a dog team never repeats one either
        // (GAPS N4; before v14 the 2 dogs meant one always played twice). Sim v15: 10 dogs.
        for (const h of catTeam) expect(cats).toContain(h);
        for (const h of dogTeam) expect(dogs).toContain(h);
        expect(new Set(catTeam).size).toBe(3);
        expect(new Set(dogTeam).size).toBe(3);
        expect(fillPicks(seed, human, 'hiss')).toEqual({ picks, tricks });
      }
    }
  });

  it('sim v9: every cat hero, the shelter champions (and sim v11 original cats) included, shows up as a bot pick', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) for (const h of fillPicks(seed, 'brutus', 'pounce').picks.slice(3)) seen.add(h);
    expect([...seen].sort()).toEqual(['aviete', 'bengas', 'clem', 'duchess', 'gabe', 'lambo', 'meatball', 'pixel', 'sage', 'stilts']);
  });

  it('sim v14 (v15: ten dogs): every dog shows up as a bot pick, as an ally of a dog human and as an enemy of a cat human', () => {
    const allies = new Set<string>();
    const enemies = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (const h of fillPicks(seed, 'chili', 'pounce').picks.slice(1, 3)) allies.add(h);
      for (const h of fillPicks(seed, 'clem', 'pounce').picks.slice(3)) enemies.add(h);
    }
    const dogs = ['bravo', 'brutus', 'cacklejaw', 'chili', 'domino', 'frankie', 'howler', 'marshmallow', 'nugget', 'rocket'];
    expect([...enemies].sort()).toEqual(dogs);
    expect([...allies].sort()).toEqual(dogs.filter((h) => h !== 'chili'));
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
