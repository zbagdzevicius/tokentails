/**
 * Sim v38 (docs/plans/moba/V38.md): the human's allied bots lane like the enemy bots. Easy allies no longer "carry"
 * (follow the human's lane and stay within 7 m of it); they take their own lane by the slot roles and the lane swap,
 * as the enemy bots do, and still peel and leave kills in a fight they reach (DifficultyRules.helpAllies). Rookie
 * (match 1) keeps one carry ally, the roamer. Normal, Hard and PvP play exactly as on v37, so every v37 Normal, Hard
 * and PvP record re-sims to the same hash on v38.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, PVP_RULES } from '../../src/data/bots';
import { SIM_VERSION } from '../../src/sim/version';
import { verifyReplay } from '../../src/sim/server';
import { verifyPartyReplay, verifyPvpReplay } from '../../src/sim/party';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, step, type MatchHandle } from '../../src/sim/index';
import type { Difficulty } from '../../src/sim/api';
import { G } from '../../src/sim/world';
import { MAP } from '../../src/data/map';
import { limit } from './cpu-budget';

const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim');
const read = (v: number, name: string) => JSON.parse(readFileSync(join(VENDOR, `v${v}`, name), 'utf8'));

/** Share of seconds 0:30–3:00 that ally `id` stands within 10 m of the human (a Normal player-bot laning Sunny), and in Sunny's half. */
function shadow(seed: number, difficulty: Difficulty, id: number): { near: number; sunny: number } {
  const f = fillPicks(seed, 'clem', 'pounce', 'crossing');
  const m = createMatch({ seed, picks: f.picks, tricks: f.tricks, difficulty }) as MatchHandle;
  const w = m.world;
  const bot = createPlayerBot(m, 'normal');
  let n = 0;
  let near = 0;
  let sunny = 0;
  while (w.globals[G.Tick] < 5400) {
    step(m, playerBotCommands(m, bot));
    const t = w.globals[G.Tick];
    if (t < 900 || t % 30 !== 0 || w.alive[id] === 0 || w.alive[0] === 0) continue;
    n++;
    const dx = w.x[id] - w.x[0];
    const dy = w.y[id] - w.y[0];
    if (dx * dx + dy * dy <= 10000 * 10000) near++;
    if (w.y[id] >= MAP.height >> 1) sunny++;
  }
  return { near: near / n, sunny: sunny / n };
}

describe('sim v38: the human\'s allies lane like the enemy bots', { timeout: limit(600000) }, () => {
  it('SIM_VERSION 38, v37 frozen at aaa8033d (its sim commit on main) with every fixture', () => {
    expect(SIM_VERSION).toBe(38);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const entry = /simVersion: 37,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(entry?.[1].startsWith('aaa8033d')).toBe(true);
    expect(entry?.[0]).toContain('maps-replay.fixture.json');
    expect(entry?.[0]).toContain('blitz-replay.fixture.json');
  });

  it('carry allies: one (the roamer) on Rookie only; helpers on Rookie and Easy; none in PvP', () => {
    expect(DIFFICULTY_RULES.easy.carryAllies).toBe(0);
    expect(DIFFICULTY_RULES.rookie.carryAllies).toBe(1);
    expect(DIFFICULTY_RULES.easy.helpAllies).toBe(2);
    expect(PVP_RULES.carryAllies).toBe(0);
    expect(PVP_RULES.helpAllies).toBe(0);
  });

  it('every v37 Normal, Hard and PvP record (Crossing, the pool maps, Blitz, Hearthwood), relabelled 38, re-sims to the same hash', () => {
    for (const name of ['forfeit-replay.fixture.json', 'late-replay.fixture.json', 'blitz-replay.fixture.json']) {
      const r = read(37, name);
      expect(verifyReplay({ ...r, simVersion: 38 }), name).toMatchObject({ ok: true, finalHash: r.finalHash, ticks: r.ticks });
    }
    for (const r of read(37, 'maps-replay.fixture.json')) expect(verifyReplay({ ...r, simVersion: 38 }), r.map).toMatchObject({ ok: true, finalHash: r.finalHash, ticks: r.ticks });
    const party = read(37, 'hearthwood-party.fixture.json');
    expect(verifyPartyReplay({ ...party, simVersion: 38 })).toMatchObject({ ok: true, finalHash: party.finalHash, ticks: party.ticks });
    for (const name of ['pvp-replay.fixture.json', 'hearthwood-pvp.fixture.json']) {
      const r = read(37, name);
      expect(verifyPvpReplay({ ...r, simVersion: 38 }), name).toMatchObject({ ok: true, finalHash: r.finalHash, ticks: r.ticks });
    }
  });

  it('a v37 Easy record (allies carried) is refused relabelled 38: Easy matches changed', () => {
    const r = read(37, 'champion-replay.fixture.json');
    expect(verifyReplay({ ...r, simVersion: 38 }).ok).toBe(false);
  });

  it('Easy: with the human laning Sunny, the Puddle laner plays Puddle and neither ally shadows the human', () => {
    for (const seed of [3, 11]) {
      const puddle = shadow(seed, 'easy', 1);
      expect(puddle.sunny, `seed ${seed} slot 1 in Sunny`).toBeLessThan(0.25);
      expect(puddle.near, `seed ${seed} slot 1 near`).toBeLessThan(0.25);
      expect(shadow(seed, 'easy', 2).near, `seed ${seed} slot 2 near`).toBeLessThan(0.6);
    }
  });
});
