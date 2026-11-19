/**
 * Sim v35 (docs/plans/moba/V35-DEATHS.md): deaths punish more (the death weight lengthens every next respawn, steeper
 * match-time growth, higher caps), champion kills give much more XP (and levels 8 to 10 cost more), and a Practice dummy
 * never holds or contests an objective (Ridge's Fish Mill can be taken in Practice).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, PVP_RULES } from '../../src/data/bots';
import { HEARTHWOOD_RULES } from '../../src/data/maps/hearthwood';
import { ACTIVE_MAP } from '../../src/data/map';
import { RESPAWN, XP } from '../../src/data/xp';
import type { MapId, SimEvent } from '../../src/sim/api';
import { createMatch, fillPicks, step, type MatchHandle } from '../../src/sim/index';
import { deathWeightBp, respawnTicks } from '../../src/sim/progression/respawn';
import { resolveDeaths } from '../../src/sim/combat/damage';
import { bountyOf } from '../../src/sim/progression/xp';
import { napKicker, napWeightBp } from '../../src/ui/napCard';
import { SIM_VERSION } from '../../src/sim/version';
import { G } from '../../src/sim/world';

describe('sim v35: version and the v34 freeze', () => {
  it('SIM_VERSION 35, v34 frozen (read from 59dafddf on main since the 2026-11-18 rebase; frozen at 0be26b01) with its maps fixture', () => {
    expect(SIM_VERSION).toBe(38);
    const tool = readFileSync(join(__dirname, '..', '..', 'tools', 'vendor-sim.mjs'), 'utf8');
    const entry = /simVersion: 34,\s*commit: '([0-9a-f]{40})'[^]*?\]\)/.exec(tool);
    expect(entry?.[1].startsWith('59dafddf')).toBe(true);
    expect(entry?.[0]).toContain('maps-replay.fixture.json');
  });
});

describe('sim v35: champion kill XP', () => {
  it('220 + 55 × victim level, the killer +75%, others 50% of their share, +25% a level the victim leads (max +100%)', () => {
    expect([XP.killBase, XP.killPerLevel, XP.killerBonusBp, XP.assistBp, XP.upsetPerLevelBp, XP.upsetMaxBp]).toEqual([220, 55, 7500, 5000, 2500, 10000]);
    // bounty from a streak of 2: +100 a takedown, at most +500
    expect([0, 1, 2, 3, 5, 9].map(bountyOf)).toEqual([0, 0, 200, 300, 500, 500]);
    expect(XP.toLevel).toEqual([0, 60, 210, 420, 650, 960, 1750, 2900, 4100, 5500]);
    expect(HEARTHWOOD_RULES.xpBp).toBe(7500);
  });
});

describe('sim v35: respawns', () => {
  it('per difficulty: growth a minute and the share of the death weight (Rookie and Easy keep v34 respawns)', () => {
    const rows = (['rookie', 'easy', 'normal', 'hard'] as const).map((d) => [DIFFICULTY_RULES[d].respawnGrowBp, DIFFICULTY_RULES[d].deathGrowBp]);
    expect(rows).toEqual([[0, 0], [400, 0], [1000, 10000], [1000, 10000]]);
    // Easy's enemies 2+ levels above the human earn 60% (v34 85%): the bigger kill XP kept fun2 at v34's 71.5%
    expect(DIFFICULTY_RULES.easy.enemyAheadXpBp).toBe(6000);
    expect([PVP_RULES.respawnGrowBp, PVP_RULES.deathGrowBp]).toEqual([1000, 10000]);
    expect([RESPAWN.hardCap, HEARTHWOOD_RULES.respawnCap]).toEqual([1200, 1650]);
  });

  it('the death weight: +12% a death, at most +72%; scaled by the difficulty share', () => {
    expect([0, 1, 3, 6, 9].map((n) => deathWeightBp(n, 10000))).toEqual([0, 1200, 3600, 7200, 7200]);
    expect(deathWeightBp(3, 5000)).toBe(1800);
    expect(deathWeightBp(5, 0)).toBe(0);
  });

  it('short early, then level × match time × death weight', () => {
    const g = DIFFICULTY_RULES.normal.respawnGrowBp;
    // level 6: 3 s + 6 s = 270 ticks; at most 4 s before 2:00 whatever the weight
    expect(respawnTicks(6, 1800, 1e9, g, 3600)).toBe(120);
    // before 3:00 the weight adds nothing (the opening minutes stay short)
    expect(respawnTicks(6, RESPAWN.growFrom, 1e9, g, 3600)).toBe(270);
    // 8:00: +50% for the time, × 1.36 for 3 earlier deaths
    expect(respawnTicks(6, RESPAWN.growFrom + 5 * 1800, 1e9, g, 0)).toBe(405);
    expect(respawnTicks(6, RESPAWN.growFrom + 5 * 1800, 1e9, g, 3600)).toBe(550);
    // the time growth stops at +160%
    expect(respawnTicks(10, RESPAWN.growFrom + 30 * 1800, 1e9, g, 0)).toBe(1014);
  });
});

function match(map: MapId, difficulty: 'normal' | 'rookie', mutator?: 'practice'): MatchHandle {
  const { picks, tricks } = fillPicks(35, 'sage', 'pounce', map);
  const m = createMatch({ seed: 35, picks, tricks, difficulty, map, ...(mutator ? { mutator } : {}) }) as MatchHandle;
  m.world.globals[G.BotsOff] = 1;
  return m;
}

/** Knock hero `id` out on the next tick; returns its death event. */
function knockOut(m: MatchHandle, id: number): Extract<SimEvent, { type: 'death' }> {
  m.world.hp[id] = 0;
  m.events.length = 0;
  resolveDeaths(m);
  const e = m.events.find((x) => x.type === 'death' && x.id === id);
  expect(e).toBeDefined();
  return e as Extract<SimEvent, { type: 'death' }>;
}

/** Step until hero `id` is back (or `max` ticks). */
function waitBack(m: MatchHandle, id: number, max = 4000): void {
  for (let i = 0; i < max && m.world.alive[id] === 0; i++) step(m, []);
  expect(m.world.alive[id]).toBe(1);
}

describe('sim v35: every death makes the next respawn longer', () => {
  it('Normal: the weight counts each death, the wait grows with it, and a long life forgives one', { timeout: 60000 }, () => {
    const m = match('crossing', 'normal');
    const w = m.world;
    while (w.globals[G.Tick] < RESPAWN.growFrom + 60) step(m, []);
    const hero = 4;
    const waits: number[] = [];
    for (let k = 1; k <= 3; k++) {
      const e = knockOut(m, hero);
      expect(e.weight).toBe(k);
      expect(e.weightBp).toBe(deathWeightBp(k - 1, 10000));
      waits.push(w.timer[hero]);
      waitBack(m, hero);
    }
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(waits[2]).toBeGreaterThan(waits[1]);
    // alive for two forgiveness spans: the weight drops by two before this death counts
    w.lifeAt[hero] = w.globals[G.Tick] - 2 * RESPAWN.forgiveTicks;
    const e = knockOut(m, hero);
    expect(e.weight).toBe(2);
    expect(e.weightBp).toBe(deathWeightBp(1, 10000));
  });

  it('Rookie: the weight is counted but never lengthens a wait', { timeout: 60000 }, () => {
    const m = match('crossing', 'rookie');
    const w = m.world;
    while (w.globals[G.Tick] < RESPAWN.growFrom + 60) step(m, []);
    for (let k = 1; k <= 2; k++) {
      const e = knockOut(m, 4);
      expect(e.weight).toBe(k);
      expect(e.weightBp).toBe(0);
      waitBack(m, 4);
    }
  });

  it('the nap card names the weight only when it lengthened the wait', () => {
    expect(napKicker(false, 4, 3600)).toBe('Knocked out 4× · wait +36%');
    expect(napKicker(true, 1, 0)).toBe('Knocked out · waits grow as the match goes on');
    expect(napKicker(false, 3, 0)).toBe('Knocked out');
  });

  it('live check 2026-11-18: before 3:00 the card names no death weight (the sim adds none to the wait then)', { timeout: 60000 }, () => {
    const m = match('crossing', 'normal');
    const w = m.world;
    while (w.globals[G.Tick] < 600) step(m, []);
    knockOut(m, 4);
    waitBack(m, 4);
    const e = knockOut(m, 4);
    expect(e.weight).toBe(2);
    expect(e.weightBp).toBeGreaterThan(0);
    expect(e.tick).toBeLessThanOrEqual(RESPAWN.growFrom);
    expect(napWeightBp(e.tick, e.weightBp!)).toBe(0);
    expect(napKicker(false, e.weight!, napWeightBp(e.tick, e.weightBp!))).toBe('Knocked out');
    expect(napWeightBp(RESPAWN.growFrom + 1, 1200)).toBe(1200);
  });
});

describe('sim v35: Practice dummies never play objectives (V35-BACKLOG.md §1)', () => {
  it('Ridge Practice: the player standing in the Fish Mill captures it despite the walking dummy', { timeout: 60000 }, () => {
    const m = match('ridge', 'normal', 'practice');
    const w = m.world;
    const o = ACTIVE_MAP.objective!;
    // one dummy lap (44,000 to 56,000 and back) is well under 1,800 ticks
    const until = o.first + o.capture + 1800;
    let got: SimEvent | undefined;
    while (w.globals[G.Tick] < until && !got) {
      w.x[0] = o.x;
      w.y[0] = o.y;
      step(m, []);
      got = m.events.find((e) => e.type === 'millCapture');
    }
    expect(got).toBeDefined();
    expect((got as Extract<SimEvent, { type: 'millCapture' }>).team).toBe(0);
  });
});
