/**
 * Sim v10, GAPS B0 (the prerequisites of Wave B): seeded bot talents and the headless `--bot-talents` modes, the
 * replay `mutator` field, and the new `SlotStats` (damage taken, heal and shield given, objective damage).
 */
import { describe, expect, it } from 'vitest';
import { BOT_TALENT_MODES, MUTATORS, type BotTalentMode, type HeroId, type MatchResult } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, replayRecord, result, step } from '../../src/sim/index';
import { botTalentChoice } from '../../src/sim/heroes/talents';
import { forkSeed, Rng } from '../../src/sim/rng';
import { checkReplayShape, verifyReplay } from '../../src/sim/server';
import { SIM_VERSION } from '../../src/sim/version';
import { TALENT_TIERS } from '../../src/sim/world';

function play(seed: number, hero: HeroId, botTalents?: BotTalentMode, difficulty: 'easy' | 'normal' = 'normal') {
  const { picks, tricks } = fillPicks(seed, hero, 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty, botTalents });
  const bot = createPlayerBot(m, 'normal');
  while (!result(m)) step(m, playerBotCommands(m, bot));
  return m;
}

const talentsOf = (m: ReturnType<typeof play>): number[][] =>
  Array.from({ length: 6 }, (_, slot) => Array.from({ length: TALENT_TIERS }, (_, t) => m.world.talents[slot * TALENT_TIERS + t]));

describe('sim v10 (GAPS B0)', () => {
  it('SIM_VERSION is 10', () => {
    expect(SIM_VERSION).toBe(10);
  });

  it("a bot's talent is draw number `tier` of its own stream fork('talent:' + slot), from the seed alone", () => {
    for (const seed of [1, 7, 4242, 0xffffffff]) {
      for (let slot = 0; slot < 6; slot++) {
        const rng = new Rng(seed).fork('talent:' + slot);
        const draws = [rng.int(2), rng.int(2), rng.int(2)];
        for (let tier = 0; tier < 3; tier++) expect(botTalentChoice(seed, slot, tier)).toBe(draws[tier]);
      }
    }
    // The stream is its own: it is not the picks stream, and it differs by slot.
    expect(forkSeed(7, 'talent:1')).not.toBe(forkSeed(7, 'talent:2'));
    expect(forkSeed(7, 'talent:1')).not.toBe(forkSeed(7, 'picks'));
  });

  it('both options are played: over 200 seeds each tier takes option 1 for 40% to 60% of the bots', () => {
    for (let tier = 0; tier < 3; tier++) {
      let ones = 0;
      for (let seed = 1; seed <= 200; seed++) for (let slot = 1; slot < 6; slot++) ones += botTalentChoice(seed, slot, tier);
      expect(ones / 1000).toBeGreaterThan(0.4);
      expect(ones / 1000).toBeLessThan(0.6);
    }
  });

  it("the headless modes: 'first' is option 0, 'branch' is option 1 at level 6 and seeded elsewhere", () => {
    expect(BOT_TALENT_MODES).toEqual(['first', 'seeded', 'branch']);
    for (let seed = 1; seed <= 20; seed++) {
      for (let slot = 0; slot < 6; slot++) {
        expect([0, 1, 2].map((t) => botTalentChoice(seed, slot, t, 'first'))).toEqual([0, 0, 0]);
        expect(botTalentChoice(seed, slot, 1, 'branch')).toBe(1);
        expect(botTalentChoice(seed, slot, 0, 'branch')).toBe(botTalentChoice(seed, slot, 0));
        expect(botTalentChoice(seed, slot, 2, 'branch')).toBe(botTalentChoice(seed, slot, 2));
      }
    }
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    expect(() => createMatch({ seed: 1, picks, tricks, difficulty: 'easy', botTalents: 'nope' as BotTalentMode })).toThrow(RangeError);
  });

  it('a full match: every bot (the player-bot too) holds its seeded talents; the modes change them, a replay verifies only when seeded', { timeout: 60000 }, () => {
    const seed = 31;
    const m = play(seed, 'sage');
    const seeded = talentsOf(m);
    for (let slot = 0; slot < 6; slot++) {
      for (let t = 0; t < TALENT_TIERS; t++) if (seeded[slot][t] >= 0) expect(seeded[slot][t], `slot ${slot} tier ${t}`).toBe(botTalentChoice(seed, slot, t));
    }
    // A normal match reaches level 9 on most heroes: at least one bot took option 1 somewhere.
    expect(seeded.flat().some((c) => c === 1)).toBe(true);
    const rec = replayRecord(m)!;
    expect(verifyReplay(rec)).toMatchObject({ ok: true, finalHash: rec.finalHash });

    const first = play(seed, 'sage', 'first');
    expect(talentsOf(first).flat().every((c) => c <= 0)).toBe(true);
    const branch = play(seed, 'sage', 'branch');
    for (let slot = 0; slot < 6; slot++) if (branch.world.talents[slot * TALENT_TIERS + 1] >= 0) expect(branch.world.talents[slot * TALENT_TIERS + 1]).toBe(1);
    // The replay carries no mode: a 'first' match re-sims as seeded and fails (unless the seeds happen to agree).
    const firstRec = replayRecord(first)!;
    if (firstRec.finalHash !== rec.finalHash) expect(verifyReplay(firstRec).ok).toBe(false);
  });

  it("replay records carry mutator 'none'; the server accepts no field or 'none' and refuses any other", { timeout: 60000 }, () => {
    expect(MUTATORS).toEqual(['none']);
    const m = play(5, 'gabe', undefined, 'easy');
    const rec = replayRecord(m)!;
    expect(rec).toMatchObject({ simVersion: 10, mutator: 'none' });
    expect(checkReplayShape(rec)).toBeNull();
    const { mutator: _drop, ...bare } = rec;
    expect(checkReplayShape(bare)).toBeNull();
    expect(verifyReplay(bare)).toMatchObject({ ok: true });
    expect(checkReplayShape({ ...rec, mutator: 'sunsetRush' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(checkReplayShape({ ...rec, mutator: null })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(checkReplayShape({ ...rec, simVersion: 9 })).toMatchObject({ ok: false, code: 'PAWLEGENDS_SIM_VERSION' });
  });

  it('SlotStats: damage taken for every hero, heal and shield for the heroes that give them, objective damage', { timeout: 60000 }, () => {
    const totals: Record<string, { taken: number; heal: number; objective: number }> = {};
    for (let seed = 1; seed <= 6; seed++) {
      for (const hero of ['gabe', 'lambo', 'brutus'] as HeroId[]) {
        const res = result(play(seed, hero)) as MatchResult;
        for (const s of res.stats) {
          const t = (totals[s.hero] ??= { taken: 0, heal: 0, objective: 0 });
          expect(s.damageTaken).toBeGreaterThanOrEqual(0);
          expect(s.healShield).toBeGreaterThanOrEqual(0);
          expect(s.objective).toBeGreaterThanOrEqual(0);
          t.taken += s.damageTaken;
          t.heal += s.healShield;
          t.objective += s.objective;
        }
      }
    }
    for (const [hero, t] of Object.entries(totals)) expect(t.taken, hero).toBeGreaterThan(0);
    // Gabė heals and shields, Lambo shields; Sir Brutus gives neither.
    expect(totals.gabe.heal).toBeGreaterThan(0);
    expect(totals.lambo.heal).toBeGreaterThan(0);
    expect(totals.brutus.heal).toBe(0);
    expect(Object.values(totals).some((t) => t.objective > 0)).toBe(true);
  });

});
