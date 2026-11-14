/**
 * Sim v15 (docs/plans/moba/DOGS-V15.md): three more dogs (Rocket, Frankie, Domino), so the sides are 10 v 10 with the
 * same roles; Domino's Spots in their own hashed World arrays; three new clip kinds. PARTY_SINCE stays 13.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroId, HeroRole } from '../../src/data/heroes';
import type { ReplayRecord, TrickId } from '../../src/sim/api';
import { createMatch, fillPicks, hashTrail, result, step } from '../../src/sim/index';
import { PARTY_SINCE } from '../../src/sim/party';
import { Rng } from '../../src/sim/rng';
import { SIM_VERSION } from '../../src/sim/version';
import { hashedArrays } from '../../src/sim/world';
import type { MatchHandle } from '../../src/sim/state';
import { randomCommand } from './helpers';
import { NIGHTLY } from './bot-helpers';

const NEW_DOGS: readonly HeroId[] = ['rocket', 'frankie', 'domino'];
const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');

function play(seed: number, picks: readonly HeroId[], ticks = 30 * 60 * 4) {
  const tricks: TrickId[] = ['pounce', 'snack', 'hiss', 'purrify', 'pounce', 'snack'];
  const m = createMatch({ seed, picks: [...picks], tricks, difficulty: 'easy' });
  const r = new Rng(seed ^ 0x15d0);
  for (let t = 0; t < ticks && !result(m); t++) {
    const c = randomCommand(r);
    step(m, c ? [c] : []);
  }
  return m;
}

const roles = (side: 'cat' | 'dog'): Record<HeroRole, number> => {
  const out = { fighter: 0, marksman: 0, tank: 0, assassin: 0, mage: 0, support: 0 } as Record<HeroRole, number>;
  for (const h of HERO_IDS) if (HEROES[h].side === side) out[HEROES[h].role]++;
  return out;
};

describe('sim v15: ten dogs', { timeout: 300000 }, () => {
  it('SIM_VERSION 15, PARTY_SINCE 13; 20 heroes, 10 a side with the same roles; the three new dogs at 17..19', () => {
    expect(SIM_VERSION).toBe(27);
    expect(PARTY_SINCE).toBe(13);
    expect(HERO_IDS).toHaveLength(20);
    expect(HERO_IDS.slice(17)).toEqual([...NEW_DOGS]);
    expect(HERO_IDS.filter((h) => HEROES[h].side === 'cat')).toHaveLength(10);
    expect(HERO_IDS.filter((h) => HEROES[h].side === 'dog')).toHaveLength(10);
    expect(roles('dog')).toEqual(roles('cat'));
    expect([HEROES.rocket.role, HEROES.frankie.role, HEROES.domino.role]).toEqual(['marksman', 'assassin', 'mage']);
  });

  it("Domino's Spots (dotN, dotT) are hashed World arrays", () => {
    const m = createMatch({ seed: 1, picks: ['clem', 'sage', 'gabe', 'domino', 'rocket', 'frankie'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy' });
    const w = (m as unknown as MatchHandle).world;
    expect(hashedArrays(w)).toContain(w.dotN);
    expect(hashedArrays(w)).toContain(w.dotT);
  });

  it('fillPicks never repeats a hero within a team (1,000 seeds); every new dog is drawn on the dog side and can be the human', () => {
    const drawn = new Set<HeroId>();
    for (let seed = 0; seed < 1000; seed++) {
      for (const human of ['clem', 'rocket'] as const) {
        const { picks } = fillPicks(seed, human, 'pounce');
        expect(new Set(picks.slice(0, 3)).size, `${seed} ${human}`).toBe(3);
        expect(new Set(picks.slice(3)).size, `${seed} ${human}`).toBe(3);
        for (const h of picks) if (NEW_DOGS.includes(h)) drawn.add(h);
      }
    }
    expect([...drawn].sort()).toEqual([...NEW_DOGS].sort());
  });

  it('Rocket and Frankie on both teams (untargetable travel during projectile flight is order-sensitive): same seed, same trail', { timeout: NIGHTLY ? 3600000 : 300000 }, () => {
    const n = NIGHTLY ? 200 : 6;
    for (let seed = 1; seed <= n; seed++) {
      const picks: HeroId[] = seed % 2 ? ['rocket', 'frankie', 'domino', 'rocket', 'frankie', 'chili'] : ['frankie', 'rocket', 'nugget', 'frankie', 'rocket', 'domino'];
      const a = play(seed, picks, 30 * 60 * 3);
      const b = play(seed, picks, 30 * 60 * 3);
      expect(hashTrail(a), String(seed)).toEqual(hashTrail(b));
    }
  });

  it('the new clip events fire in real bot matches (zzz, footlong, dots)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 6 && seen.size < 3; seed++) {
      const m = createMatch({ seed, picks: ['clem', 'sage', 'gabe', 'rocket', 'frankie', 'domino'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'normal' });
      while (!result(m)) {
        step(m);
        for (const e of m.events) if (e.type === 'clip' && (e.what === 'zzz' || e.what === 'footlong' || e.what === 'dots')) seen.add(e.what);
      }
    }
    expect([...seen].sort()).toEqual(['dots', 'footlong', 'zzz']);
  });

  it('the vendored v27 new-dog fixture is a Frankie replay at sim v27; the frozen v18, v17, v16, v15 and v14 fixtures keep their versions', () => {
    const live = JSON.parse(readFileSync(join(VENDOR, 'v27', 'new-dog-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(live.simVersion).toBe(27);
    expect(live.hero).toBe('frankie');
    const v18 = JSON.parse(readFileSync(join(VENDOR, 'v18', 'new-dog-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(v18.simVersion).toBe(18);
    const v17 = JSON.parse(readFileSync(join(VENDOR, 'v17', 'new-dog-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(v17.simVersion).toBe(17);
    const v16 = JSON.parse(readFileSync(join(VENDOR, 'v16', 'new-dog-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(v16.simVersion).toBe(16);
    const v15 = JSON.parse(readFileSync(join(VENDOR, 'v15', 'new-dog-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(v15.simVersion).toBe(15);
    const frozen = JSON.parse(readFileSync(join(VENDOR, 'v14', 'dog-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(frozen.simVersion).toBe(14);
  });
});
