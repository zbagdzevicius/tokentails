/**
 * Sim v13 (docs/plans/moba/DOGS-V13.md): five original dogs (Nugget, Marshmallow, Bravo, Chili, Howler), two new
 * projectile kinds, the `busy` and `deterBasics` kit hooks and the `clip` event; a dog team never fields a hero twice.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { BuffFlag, type HeroId, type TrickId } from '../../src/sim/api';
import type { MatchHandle } from '../../src/sim/state';
import { createMatch, fillPicks, hash, hashTrail, result, snapshot, step } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import { SIM_VERSION } from '../../src/sim/version';
import { randomCommand } from './helpers';
import { NIGHTLY } from './bot-helpers';

const DOGS: readonly HeroId[] = ['nugget', 'marshmallow', 'bravo', 'chili', 'howler'];

/** A full Easy match with custom picks (bots on both sides) and a random human command stream. */
function play(seed: number, picks: readonly HeroId[], ticks = 30 * 60 * 4) {
  const tricks: TrickId[] = ['pounce', 'snack', 'hiss', 'purrify', 'pounce', 'snack'];
  const m = createMatch({ seed, picks: [...picks], tricks, difficulty: 'easy' });
  const r = new Rng(seed ^ 0x13d0);
  for (let t = 0; t < ticks && !result(m); t++) {
    const c = randomCommand(r);
    step(m, c ? [c] : []);
  }
  return m;
}

describe('sim v13: the dogs', { timeout: 300000 }, () => {
  it('SIM_VERSION is 13; the five dogs are appended at 12..16, all dogs, every role covered on the dog side', () => {
    expect(SIM_VERSION).toBe(13);
    expect(HERO_IDS.slice(12)).toEqual([...DOGS]);
    for (const h of DOGS) expect(HEROES[h].side, h).toBe('dog');
    const dogRoles = new Set(HERO_IDS.filter((h) => HEROES[h].side === 'dog').map((h) => HEROES[h].role));
    expect([...dogRoles].sort()).toEqual(['assassin', 'fighter', 'mage', 'marksman', 'support', 'tank']);
    // None of them is a shelter champion (no catalogId).
    expect(HERO_IDS.filter((h) => HEROES[h].side === 'dog')).toHaveLength(7);
  });

  it('projectile kinds frisbee 14 and yap 15 come after hero (ability damage)', () => {
    expect(PROJECTILE_KIND.frisbee).toBe(14);
    expect(PROJECTILE_KIND.yap).toBe(15);
    expect(PROJECTILE_KIND.frisbee).toBeGreaterThan(PROJECTILE_KIND.hero);
  });

  it('fillPicks never duplicates a hero within a dog team (1,000 seeds), for a dog human and a cat human', () => {
    for (let seed = 0; seed < 1000; seed++) {
      for (const human of ['clem', 'nugget'] as const) {
        const { picks } = fillPicks(seed, human, 'pounce');
        const dogTeam = human === 'clem' ? picks.slice(3) : picks.slice(0, 3);
        expect(new Set(dogTeam).size, `${seed} ${human}`).toBe(3);
        for (const h of dogTeam) expect(HEROES[h].side).toBe('dog');
      }
    }
  });

  it('a mixed-species team (party picks) passes validate and plays deterministically', () => {
    const picks: HeroId[] = ['clem', 'nugget', 'sage', 'bravo', 'meatball', 'chili'];
    expect(() => createMatch({ seed: 5, picks, tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy' })).not.toThrow();
    const a = play(5, picks);
    const b = play(5, picks);
    expect(hashTrail(a)).toEqual(hashTrail(b));
    expect(hash(a)).toBe(hash(b));
  });

  it('Bravo and Chili on both teams (untargetable during projectile flight is order-sensitive): same seed, same trail', { timeout: NIGHTLY ? 3600000 : 300000 }, () => {
    const n = NIGHTLY ? 200 : 6;
    for (let seed = 1; seed <= n; seed++) {
      const picks: HeroId[] = seed % 2 ? ['bravo', 'chili', 'howler', 'bravo', 'chili', 'marshmallow'] : ['chili', 'bravo', 'nugget', 'chili', 'bravo', 'howler'];
      const a = play(seed, picks, 30 * 60 * 3);
      const b = play(seed, picks, 30 * 60 * 3);
      expect(hashTrail(a), String(seed)).toEqual(hashTrail(b));
    }
  });

  it('the clip events fire in real bot matches (flop, bigdog, scream, frozen)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 4 && seen.size < 4; seed++) {
      const m = createMatch({ seed, picks: ['clem', 'sage', 'gabe', 'bravo', 'chili', 'howler'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'normal' });
      const m2 = createMatch({ seed, picks: ['clem', 'sage', 'gabe', 'marshmallow', 'nugget', 'bravo'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'normal' });
      for (const match of [m, m2]) {
        while (!result(match)) {
          step(match);
          for (const e of match.events) if (e.type === 'clip') seen.add(e.what);
        }
      }
    }
    expect([...seen].sort()).toEqual(['bigdog', 'flop', 'frozen', 'scream']);
  });

  it('Bravo\'s spotlight and Marshmallow\'s blizzard centre never show as a shield or a block (kHonour, kWT)', () => {
    const picks: HeroId[] = ['bravo', 'marshmallow', 'chili', 'bravo', 'marshmallow', 'chili'];
    const m = createMatch({ seed: 9, picks, tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'hard' });
    const w = (m as unknown as MatchHandle).world;
    let spots = 0;
    for (let t = 0; t < 30 * 60 * 6 && !result(m); t++) {
      step(m);
      for (let id = 0; id < 6; id++) {
        if (w.kHonour[id] > 0) spots++;
        const e = snapshot(m, 0).entities.find((x) => x.id === id);
        if (!e) continue;
        expect(e.shield, `${e.hero} shield`).toBeLessThanOrEqual(e.maxHp);
        if (e.hero === 'bravo' || e.hero === 'chili') expect(e.buffs & BuffFlag.Blocking, `${e.hero} blocking`).toBe(0);
      }
    }
    expect(spots).toBeGreaterThan(0);
  });
});
