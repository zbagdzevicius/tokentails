/**
 * Sim v37 (docs/plans/moba/V37.md): bots commit to a walk goal on the 3v3 maps (no more flicker between two goals that
 * left a bot standing still), a Blitz rout at the 3:15 time up, and the Blitz hero rows refit. Hearthwood keeps its own
 * walk clock and the new bot memory is empty there, so every v36 Hearthwood record re-sims to the same hash on v37.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HeroId, MapId, TrickId } from '../../src/sim/api';
import { HERO_IDS } from '../../src/data/heroes';
import { MUTATOR_RULES } from '../../src/data/mutators';
import { BOT_AI } from '../../src/data/bots';
import { SIM_VERSION } from '../../src/sim/version';
import { verifyPartyReplay, verifyPvpReplay } from '../../src/sim/party';
import { timeUpWinner } from '../../src/sim/match';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { G } from '../../src/sim/world';
import { limit } from './cpu-budget';

const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const read = (v: number, name: string) => JSON.parse(readFileSync(join(VENDOR, `v${v}`, name), 'utf8'));

/** The Blitz rows the v37 refit set (V37.md §4), pinned so a later edit is deliberate. */
const BLITZ_ROWS: Record<HeroId, [number, number]> = {
  aviete: [9172, 10831],
  bengas: [10703, 9296],
  bravo: [10570, 9394],
  brutus: [10307, 9668],
  cacklejaw: [9486, 10453],
  chili: [10219, 9771],
  clem: [9231, 10805],
  domino: [10086, 9912],
  duchess: [9769, 10227],
  frankie: [9257, 10675],
  gabe: [10405, 9576],
  howler: [9035, 11027],
  lambo: [10350, 9632],
  marshmallow: [10354, 9647],
  meatball: [11633, 8356],
  nugget: [10678, 9347],
  pixel: [9374, 10601],
  rocket: [10084, 9912],
  sage: [9286, 10743],
  stilts: [9546, 10394],
  mochi: [10263, 9728],
  ziggy: [9533, 10461],
  nova: [9643, 10365],
  dusty: [10018, 9980],
  barkula: [10194, 9805],
  biscuit: [10144, 9853],
  champ: [9283, 10726],
  ranger: [10622, 9400],
};

/** Stuck bots (moving, < 0.3 m of progress a second for 5 s) in one Normal match, the maps-sanity measure. */
function stuckBots(seed: number, map: MapId): number {
  const tricks: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];
  const hero = HERO_IDS[(Math.imul(seed ^ 0x51, 0x9e3779b1) >>> 0) % HERO_IDS.length] as HeroId;
  const trick = tricks[(Math.imul(seed ^ 0x7a, 0x9e3779b1) >>> 0) % tricks.length];
  const f = fillPicks(seed, hero, trick, map);
  const m = createMatch({ seed, picks: f.picks, tricks: f.tricks, difficulty: 'normal', map }) as MatchHandle;
  const w = m.world;
  const bot = createPlayerBot(m, 'normal');
  const lx = new Int32Array(6);
  const ly = new Int32Array(6);
  const still = new Int32Array(6);
  let n = 0;
  while (!result(m)) {
    step(m, playerBotCommands(m, bot));
    if (w.globals[G.Tick] % 30 !== 0) continue;
    for (let h = 0; h < 6; h++) {
      const moved = Math.abs(w.x[h] - lx[h]) + Math.abs(w.y[h] - ly[h]) > 300;
      still[h] = w.alive[h] === 1 && !moved && w.state[h] === 1 ? still[h] + 1 : 0;
      if (still[h] === 5) n++;
      lx[h] = w.x[h];
      ly[h] = w.y[h];
    }
  }
  return n;
}

describe('sim v37: bot commitment on the 3v3 maps, the Blitz rout and rows', { timeout: limit(600000) }, () => {
  it('SIM_VERSION 38 (37 at release), v36 frozen at df342432 (its sim commit on main) with every fixture', () => {
    expect(SIM_VERSION).toBe(38);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const entry = /simVersion: 36,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(entry?.[1].startsWith('df342432')).toBe(true);
    expect(entry?.[0]).toContain('maps-replay.fixture.json');
    expect(entry?.[0]).toContain('hearthwood-pvp.fixture.json');
  });

  it('every frozen v36 Hearthwood record (party, PvP; the Easy solo one until v38), relabelled live, re-sims to the same hash', () => {
    // Sim v38 (V38.md): Easy allies stopped carrying, so the Easy solo record changed; Normal and Hard did not.
    const party = read(36, 'hearthwood-party.fixture.json');
    expect(verifyPartyReplay({ ...party, simVersion: SIM_VERSION })).toMatchObject({ ok: true, finalHash: party.finalHash, ticks: party.ticks });
    const pvp = read(36, 'hearthwood-pvp.fixture.json');
    expect(verifyPvpReplay({ ...pvp, simVersion: SIM_VERSION })).toMatchObject({ ok: true, finalHash: pvp.finalHash, ticks: pvp.ticks });
  });

  it('the walk hold is one rule for the 3v3 maps: 2 s, 4 m', () => {
    expect(BOT_AI.walkHold).toBe(60);
    expect(BOT_AI.walkFar).toBe(4000);
  });

  it('bots that flickered in place on v36 (Thicket, Quarry, Ridge seeds of the V35 backlog measure) are no longer stuck', () => {
    // v36: one stuck bot in each of these matches (tools/maps-sanity.mjs, seeds 1,001+)
    expect(stuckBots(2800407833, 'thicket')).toBe(0);
    expect(stuckBots(1159876298, 'thicket')).toBe(0);
    expect(stuckBots(3814312059, 'ridge')).toBe(0);
  });

  it('Blitz rout: 8+ takedowns ahead at 3:15 wins before the towers; Cannon Chaos and every other mode keep the old order', () => {
    expect(MUTATOR_RULES.blitz.routTakedowns).toBe(8);
    for (const [k, r] of Object.entries(MUTATOR_RULES)) if (k !== 'blitz') expect(r.routTakedowns, k).toBe(0);
    const f = fillPicks(7, 'clem', 'pounce', 'crossing');
    const m = createMatch({ seed: 7, picks: f.picks, tricks: f.tricks, difficulty: 'normal', mutator: 'blitz' }) as MatchHandle;
    const w = m.world;
    w.globals[G.Towers0] = 0;
    w.globals[G.Towers1] = 2;
    w.globals[G.Kills0] = 12;
    w.globals[G.Kills1] = 3;
    expect(timeUpWinner(w)).toBe(0);
    w.globals[G.Kills0] = 10;
    expect(timeUpWinner(w)).toBe(1);
    const c = createMatch({ seed: 7, picks: f.picks, tricks: f.tricks, difficulty: 'normal', mutator: 'cannon' }) as MatchHandle;
    c.world.globals[G.Towers1] = 1;
    c.world.globals[G.Kills0] = 20;
    expect(timeUpWinner(c.world)).toBe(1);
  });

  it('every hero carries the pinned Blitz row; dealt and taken move the other way and stay in bounds', () => {
    for (const h of HERO_IDS) {
      const r = MUTATOR_RULES.blitz.hero[h];
      expect(r, h).toEqual({ dmgBp: BLITZ_ROWS[h][0], takenBp: BLITZ_ROWS[h][1] });
      expect(r!.dmgBp, h).toBeGreaterThanOrEqual(7500);
      expect(r!.dmgBp, h).toBeLessThanOrEqual(13000);
      expect(r!.takenBp, h).toBeGreaterThanOrEqual(7500);
      expect(r!.takenBp, h).toBeLessThanOrEqual(12500);
    }
  });
});
