/**
 * Sim v31 (docs/plans/moba/ROSTER-V31.md): the second roster release (Nova, Dusty, Barkula, Ranger). Version and the
 * v30 freeze, bot use of every slot of the four new heroes and their clip events in real bot matches, determinism,
 * verification on both maps, and the vendored fixtures (live v31 roster fixture, frozen v30 refusing a new hero).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroId } from '../../src/data/heroes';
import { HEARTHWOOD_PVP } from '../../src/data/maps/hearthwood';
import type { ReplayRecord, TrickId } from '../../src/sim/api';
import { createMatch, fillPicks, hashTrail, replayRecord, result, step } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { SIM_VERSION } from '../../src/sim/version';

const ROSTER: readonly HeroId[] = ['nova', 'dusty', 'barkula', 'ranger'];
const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const TRICKS: TrickId[] = ['pounce', 'snack', 'hiss', 'purrify', 'pounce', 'snack'];

describe('sim v31: the second roster release', { timeout: 600000 }, () => {
  it('SIM_VERSION 31, v30 frozen at its last commit on main (dc053f38); 28 heroes, the four at 24..27', () => {
    expect(SIM_VERSION).toBe(31);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const v30 = /simVersion: 30,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(v30?.[1].startsWith('dc053f38')).toBe(true);
    expect(v30?.[0]).toContain('roster-replay.fixture.json');
    expect(HERO_IDS).toHaveLength(28);
    expect(HERO_IDS.slice(24)).toEqual([...ROSTER]);
    for (const h of ROSTER) {
      expect(HEROES[h].talents.flat().length, h).toBe(6);
      expect(HEARTHWOOD_PVP.hero[h], h).toBeDefined();
    }
  });

  it('bots cast every slot of every new hero, and their clip events fire (Normal, 3v3)', () => {
    const slots = new Map<HeroId, Set<number>>(ROSTER.map((h) => [h, new Set<number>()]));
    const clips = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const picks: HeroId[] = seed % 2 ? ['nova', 'dusty', 'clem', 'barkula', 'ranger', 'brutus'] : ['barkula', 'ranger', 'nugget', 'nova', 'dusty', 'sage'];
      const m = createMatch({ seed, picks, tricks: TRICKS, difficulty: 'normal' });
      while (!result(m)) {
        step(m);
        for (const e of m.events) {
          if (e.type === 'cast' && e.slot < 4) slots.get(picks[e.src] as HeroId)?.add(e.slot);
          if (e.type === 'clip') clips.add(e.what);
        }
      }
    }
    for (const h of ROSTER) expect([...(slots.get(h) as Set<number>)].sort(), h).toEqual([0, 1, 2, 3]);
    expect([...clips]).toEqual(expect.arrayContaining(['bigcork', 'highnoon', 'redmoon', 'bitten', 'longshot', 'camoshot', 'ricochet']));
  });

  it('a new-hero human: same seed, same trail; the record verifies on Crossing and on Hearthwood', () => {
    for (const hero of ROSTER) {
      const { picks, tricks } = fillPicks(31, hero, 'pounce');
      const run = () => {
        const m = createMatch({ seed: 31, picks, tricks, difficulty: 'easy' });
        for (let t = 0; t < 30 * 60 * 2 && !result(m); t++) step(m);
        return m;
      };
      expect(hashTrail(run()), hero).toEqual(hashTrail(run()));
    }
    const { picks, tricks } = fillPicks(3131, 'nova', 'pounce', 'hearthwood');
    const m = createMatch({ seed: 3131, picks, tricks, difficulty: 'easy', map: 'hearthwood' });
    while (!result(m)) step(m);
    const rec = replayRecord(m)!;
    expect(rec.simVersion).toBe(SIM_VERSION);
    expect(verifyReplay(rec).ok).toBe(true);
  });

  it('the vendored live v31 roster fixture is a Ranger replay that verifies; frozen v30 has no v31 hero', () => {
    const live = JSON.parse(readFileSync(join(VENDOR, `v${SIM_VERSION}`, 'roster31-replay.fixture.json'), 'utf8')) as ReplayRecord;
    expect(live).toMatchObject({ simVersion: 31, hero: 'ranger' });
    expect(verifyReplay(live).ok).toBe(true);
    const v30 = readFileSync(join(VENDOR, 'v30', 'pawlegends-sim.bundle.ts'), 'utf8');
    expect(v30).not.toContain('"ranger"');
    expect(v30).not.toContain("'ranger'");
  });
});
