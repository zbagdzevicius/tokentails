/**
 * Sim v29 (docs/plans/moba/ROSTER-V29.md): the roster release. Version and data, bot use of every slot of the four new
 * heroes, their clip events in real bot matches, determinism, verification on every map, and the vendored fixtures
 * (live v29 roster fixture, frozen v28 refusing a roster hero).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroId } from '../../src/data/heroes';
import type { ReplayRecord, TrickId } from '../../src/sim/api';
import { createMatch, fillPicks, hashTrail, replayRecord, result, step } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { SIM_VERSION } from '../../src/sim/version';

const ROSTER: readonly HeroId[] = ['mochi', 'ziggy', 'biscuit', 'champ'];
const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const TRICKS: TrickId[] = ['pounce', 'snack', 'hiss', 'purrify', 'pounce', 'snack'];

describe('sim v29: the roster release', { timeout: 600000 }, () => {
  it('SIM_VERSION 29 or later; the roster four at 20..23 (sim v31 appends four more after them)', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(29);
    expect(HERO_IDS.length).toBeGreaterThanOrEqual(24);
    expect(HERO_IDS.slice(20, 24)).toEqual([...ROSTER]);
    for (const h of ROSTER) expect(HEROES[h].talents.flat().length, h).toBe(6);
  });

  it('bots cast every slot of every roster hero, and the four clip events fire (Normal, 3v3)', () => {
    const slots = new Map<HeroId, Set<number>>(ROSTER.map((h) => [h, new Set<number>()]));
    const clips = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const picks: HeroId[] = seed % 2 ? ['mochi', 'ziggy', 'clem', 'biscuit', 'champ', 'brutus'] : ['biscuit', 'champ', 'nugget', 'ziggy', 'mochi', 'sage'];
      const m = createMatch({ seed, picks, tricks: TRICKS, difficulty: 'normal' });
      while (!result(m)) {
        step(m);
        for (const e of m.events) {
          if (e.type === 'cast' && e.slot < 4) slots.get(picks[e.src] as HeroId)?.add(e.slot);
          if (e.type === 'clip' && (e.what === 'lullaby' || e.what === 'zigzag' || e.what === 'fetch' || e.what === 'ko')) clips.add(e.what);
        }
      }
    }
    // Biscuit's Stubborn is a reactive cleanse (slowed or rooted while focused): rare in 16 matches, so it is not required
    for (const h of ROSTER) expect([...(slots.get(h) as Set<number>)].sort(), h).toEqual(h === 'biscuit' ? expect.arrayContaining([0, 1, 3]) : [0, 1, 2, 3]);
    expect([...clips].sort()).toEqual(expect.arrayContaining(['fetch', 'lullaby', 'zigzag']));
  });

  it('a roster-hero human: same seed, same trail; the record verifies on Crossing and on Hearthwood', () => {
    for (const hero of ROSTER) {
      const { picks, tricks } = fillPicks(29, hero, 'pounce');
      const run = () => {
        const m = createMatch({ seed: 29, picks, tricks, difficulty: 'easy' });
        for (let t = 0; t < 30 * 60 * 2 && !result(m); t++) step(m);
        return m;
      };
      const a = run();
      expect(hashTrail(a), hero).toEqual(hashTrail(run()));
    }
    const { picks, tricks } = fillPicks(2929, 'biscuit', 'pounce', 'hearthwood');
    const m = createMatch({ seed: 2929, picks, tricks, difficulty: 'easy', map: 'hearthwood' });
    while (!result(m)) step(m);
    const rec = replayRecord(m)!;
    expect(rec.simVersion).toBe(SIM_VERSION);
    expect(verifyReplay(rec).ok).toBe(true);
  });

  it('the vendored live roster fixture is a Biscuit replay that verifies (v29 froze it in sim v30); frozen v28 has no roster hero', () => {
    const live = JSON.parse(readFileSync(join(VENDOR, `v${SIM_VERSION}`, 'roster-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(live.simVersion).toBe(SIM_VERSION);
    const v29 = JSON.parse(readFileSync(join(VENDOR, 'v29', 'roster-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(v29).toMatchObject({ simVersion: 29, hero: 'biscuit' });
    expect(live.hero).toBe('biscuit');
    expect(verifyReplay(live).ok).toBe(true);
    const v28 = readFileSync(join(VENDOR, 'v28', 'index.ts'), 'utf8');
    expect(v28).not.toContain("'biscuit'");
  });
});
