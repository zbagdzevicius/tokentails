/**
 * Sim v7 (playtest round 1: "kills and fights barely decide the match", "Hard is hidden stat edges", "I lost the
 * guided first match"): a takedown lead becomes map pressure (longer respawns for the trailing team, a core chip per
 * takedown, Sudden Death burns the trailing core faster, early grouping), bots defend their base, Hard hunts as a team,
 * and Rookie's rubber band and core rules protect a first-timer who feeds.
 */
import { describe, expect, it } from 'vitest';
import { BOTS, DIFFICULTY_RULES, FEEDER, PLAYER_PROFILES } from '../../src/data/bots';
import { SUDDEN_DEATH, SUNSET } from '../../src/data/timeline';
import { RESPAWN, XP } from '../../src/data/xp';
import { baseThreat } from '../../src/sim/bots/brain';
import { resolveDeaths } from '../../src/sim/combat/damage';
import { BP_ONE, applyBp } from '../../src/sim/fixed';
import { respawnTicks } from '../../src/sim/progression/respawn';
import { grantXp } from '../../src/sim/progression/levels';
import { stepSeconds } from '../../src/sim/units/core';
import { G } from '../../src/sim/world';
import { SIM_VERSION } from '../../src/sim/version';
import { coreId, putHero, quietMatch } from './sim-helpers';

describe('sim v7 lead pressure', () => {
  it('is on for Normal and Hard only; SIM_VERSION is 10 (sim v8, v9 and v10 kept it)', () => {
    expect(SIM_VERSION).toBe(10);
    expect(DIFFICULTY_RULES.normal.leadPressure && DIFFICULTY_RULES.hard.leadPressure).toBe(true);
    expect(DIFFICULTY_RULES.easy.leadPressure || DIFFICULTY_RULES.rookie.leadPressure).toBe(false);
  });

  it('a hero whose team trails by 10 waits longer (capped), and only on Normal and Hard', () => {
    for (const d of ['normal', 'easy'] as const) {
      const m = quietMatch(1, false, d);
      const w = m.world;
      w.globals[G.Tick] = 4000;
      w.globals[G.Kills0] = 10;
      w.hp[4] = 0;
      resolveDeaths(m);
      const base = respawnTicks(w.level[4], 4000, w.globals[G.Sunset]);
      const gap = 11 - RESPAWN.gapFree;
      const want = d === 'normal' ? applyBp(base, BP_ONE + Math.min(RESPAWN.gapCapBp, gap * RESPAWN.gapPerBp)) : base;
      expect(w.timer[4]).toBe(want);
    }
  });

  it('before Sunset every takedown chips the victim core on Normal; after Sunset the Sunset shares apply', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    const core = coreId(1);
    w.globals[G.Tick] = 3000;
    const full = w.hp[core];
    w.hp[3] = 0;
    resolveDeaths(m);
    expect(full - w.hp[core]).toBe(applyBp(w.maxHp[core], DIFFICULTY_RULES.normal.takedownChipBp));
    w.globals[G.Tick] = w.globals[G.Sunset] + 30;
    const before = w.hp[core];
    w.hp[4] = 0;
    resolveDeaths(m);
    expect(before - w.hp[core]).toBe(applyBp(w.maxHp[core], SUNSET.closedCoreBp));
  });

  it('Sudden Death burns the core of the team behind on takedowns faster', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    const sd = w.globals[G.SuddenDeath];
    w.globals[G.Tick] = sd + (30 - (sd % 30)) % 30;
    w.globals[G.Kills0] = 10;
    const c0 = w.hp[coreId(0)];
    const c1 = w.hp[coreId(1)];
    stepSeconds(m);
    expect(c0 - w.hp[coreId(0)]).toBe(applyBp(w.maxHp[coreId(0)], SUDDEN_DEATH.decayMinBp));
    expect(c1 - w.hp[coreId(1)]).toBe(applyBp(w.maxHp[coreId(1)], SUDDEN_DEATH.coreDecayBpPerSecond + 10 * SUDDEN_DEATH.decayPerTakedownBp));
  });
});

describe('sim v7 bots', () => {
  it('see an enemy hero at the own core as a base threat', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    expect(baseThreat(w, 0)).toBe(-1);
    putHero(m, 3, w.x[coreId(0)] + 3000, w.y[coreId(0)]);
    expect(baseThreat(w, 0)).toBe(coreId(0));
  });

  it('Normal and Hard defend the base; only Hard hunts', () => {
    expect(BOTS.normal.defendBase && BOTS.hard.defendBase).toBe(true);
    expect(BOTS.easy.defendBase || BOTS.rookie.defendBase).toBe(false);
    expect(BOTS.hard.hunts).toBe(true);
    expect(BOTS.normal.hunts).toBe(false);
  });
});

describe('sim v7 Rookie protection', () => {
  it('the feeder player-bot exists for the fun gate', () => {
    expect(PLAYER_PROFILES).toContain('feeder');
    expect(FEEDER.dive).toBe(true);
    expect(FEEDER.towerHits).toBeGreaterThan(100);
  });

  it('an enemy hero 2+ levels above the human earns half XP on Rookie only', () => {
    for (const d of ['rookie', 'easy'] as const) {
      const m = quietMatch(1, false, d);
      const w = m.world;
      w.level[3] = w.level[0] + XP.aheadLevels;
      w.xp[3] = XP.toLevel[w.level[3] - 1];
      const before = w.xp[3];
      grantXp(m, 3, 100, 'minion', true);
      expect(w.xp[3] - before).toBe(d === 'rookie' ? 50 : 100);
    }
  });

  it("on Rookie the human's own death costs its core nothing after Sunset", () => {
    for (const d of ['rookie', 'easy'] as const) {
      const m = quietMatch(1, false, d);
      const w = m.world;
      const core = coreId(0);
      w.globals[G.Tick] = w.globals[G.Sunset] + 30;
      const before = w.hp[core];
      w.hp[0] = 0;
      resolveDeaths(m);
      expect(before - w.hp[core]).toBe(d === 'rookie' ? 0 : applyBp(w.maxHp[core], SUNSET.closedCoreBp));
    }
  });
});
