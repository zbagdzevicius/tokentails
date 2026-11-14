/**
 * Sim v28 (docs/plans/moba/V28.md): the Hearthwood bot fixes (§1), the Sunny Lane strip and One Lane Brawl (§2), the Duel
 * (§3) and Boss Weekend (§4). The numbers come from the data files, so a tuning pass changes the data, not these cases.
 */
import { describe, expect, it } from 'vitest';
import { BOSS } from '../../src/data/boss';
import { BOTS } from '../../src/data/bots';
import { MUTATOR_RULES } from '../../src/data/mutators';
import { JUNGLE_BOT } from '../../src/data/maps/hearthwoodGraph';
import { resolveDeaths } from '../../src/sim/combat/damage';
import { createMatch, fillPicks, replayRecord, result, snapshot, step, type MatchHandle } from '../../src/sim/index';
import { mutatorProblem } from '../../src/sim/mutator';
import { verifyReplay } from '../../src/sim/server';
import { bindMap } from '../../src/sim/map/runtime';
import { cellOf, createGrid, onPlayfield } from '../../src/sim/map/grid';
import { benched, bossOf, isBoss } from '../../src/sim/units/boss';
import { isInvulnerable } from '../../src/sim/units/kinds';
import { G, Kind, RANGE } from '../../src/sim/world';
import { MUTATORS, Op, type MatchConfig, type Mutator } from '../../src/sim/api';
import { SIM_VERSION } from '../../src/sim/version';

const config = (seed: number, mutator?: Mutator, extra: Partial<MatchConfig> = {}): MatchConfig => {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  return { seed, picks, tricks, difficulty: 'normal', ...(mutator ? { mutator } : {}), ...extra };
};

const kill = (m: MatchHandle, victim: number, by: number): void => {
  m.world.alive[victim] = 1;
  m.world.hp[victim] = 0;
  m.world.lastHitBy[victim] = by;
  m.world.hurtTick[victim] = m.world.globals[G.Tick];
  resolveDeaths(m);
};

describe('sim v28: version and data', () => {
  it('is v28 with One Lane Brawl, the Duel and Boss Weekend appended', () => {
    expect(SIM_VERSION).toBe(28);
    expect(MUTATORS.slice(0, 7)).toEqual(['none', 'blitz', 'cannon', 'practice', 'toybox', 'rapid', 'bounty']);
    expect(MUTATORS.slice(7)).toEqual(['onelane', 'duel', 'boss']);
    const none = MUTATOR_RULES.none;
    expect([none.strip, none.noRecall, none.playing, none.waves, none.structures, none.goalTakedowns, none.goalTower, none.boss]).toEqual([false, false, [0, 0], true, true, 0, false, false]);
    for (const id of ['onelane', 'duel', 'boss'] as const) {
      expect(MUTATOR_RULES[id].strip).toBe(true);
      expect(mutatorProblem(id, 'crossing', false)).toBeNull();
      expect(mutatorProblem(id, 'hearthwood', false)).toMatch(/not played on hearthwood/);
      expect(mutatorProblem(id, 'crossing', true)).toMatch(/pvp/);
    }
  });

  it('§1: Hard groups on Hearthwood right after Fortified; the other difficulties keep 8:00', () => {
    expect(BOTS.hard.hunts).toBe(true);
    expect(BOTS.normal.hunts).toBe(false);
    expect(JUNGLE_BOT.groupAtHard).toBeLessThan(JUNGLE_BOT.groupAt);
    expect(JUNGLE_BOT.groupAtHard).toBeGreaterThanOrEqual(9000);
  });
});

describe('sim v28 §2: the Sunny Lane strip and One Lane Brawl', () => {
  it('the strip walls off the Puddle lane and the jungle; the full Crossing does not', () => {
    bindMap(0, 1);
    const strip = createGrid().walls;
    // Sunny Lane's river crossing is walkable, the Puddle lane's and the rat camp are not
    expect(onPlayfield(50000, 53000)).toBe(true);
    expect(onPlayfield(50000, 7000)).toBe(false);
    expect(onPlayfield(30000, 30000)).toBe(false);
    expect(strip[cellOf(50000, 7000)]).toBe(1);
    bindMap(0, 0);
    const full = createGrid().walls;
    expect(onPlayfield(50000, 7000)).toBe(true);
    expect(full[cellOf(50000, 7000)]).toBe(0);
  });

  it('only Sunny Lane waves, no camps, Pudding or cannon; no Nap, no fountain heal; level 3 start', () => {
    const m = createMatch(config(3, 'onelane'));
    const w = m.world;
    let napped = false;
    for (let t = 0; t < 1500; t++) {
      step(m, t === 5 ? [{ op: Op.Nap }] : undefined);
      if (w.napT[0] > 0) napped = true;
    }
    expect(napped).toBe(false);
    expect(w.level[0]).toBeGreaterThanOrEqual(MUTATOR_RULES.onelane.startLevel);
    let puddle = 0;
    for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.alive[id] === 1 && w.kind[id] === Kind.Minion && w.lane[id] !== 0) puddle++;
    expect(puddle).toBe(0);
    for (let id = RANGE.camps; id < RANGE.pudding; id++) expect(w.alive[id]).toBe(0);
    expect(w.alive[RANGE.pudding]).toBe(0);
    expect(w.globals[G.CannonAt]).toBe(-1);
    // a hurt hero at its fountain is not healed
    w.hp[0] = 100;
    w.x[0] = w.x[RANGE.fountains];
    w.y[0] = w.y[RANGE.fountains];
    w.kHurt[0] = w.globals[G.Tick];
    for (let t = 0; t < 31; t++) step(m);
    expect(w.hp[0]).toBeLessThan(200);
  });

  it('plays to an end and verifies', () => {
    const m = createMatch(config(4, 'onelane'));
    while (!result(m)) step(m);
    expect(result(m)!.ticks).toBeLessThanOrEqual(MUTATOR_RULES.onelane.hardEnd);
    expect(verifyReplay(replayRecord(m)!).ok).toBe(true);
  }, 120000);
});

describe('sim v28 §3: the Duel', () => {
  it('one hero a side: the others sit out and are not in the snapshot', () => {
    const m = createMatch(config(5, 'duel'));
    const w = m.world;
    for (let t = 0; t < 60; t++) step(m);
    expect([benched(w, 0), benched(w, 1), benched(w, 2), benched(w, 3), benched(w, 4), benched(w, 5)]).toEqual([false, true, true, false, true, true]);
    for (const id of [1, 2, 4, 5]) expect(w.alive[id]).toBe(0);
    const heroes = snapshot(m, 0).entities.filter((e) => e.kind === 'hero').map((e) => e.id);
    expect(heroes).toEqual([0, 3]);
  });

  it('the second takedown wins (goal)', () => {
    const m = createMatch(config(6, 'duel'));
    for (let t = 0; t < 30; t++) step(m);
    kill(m, 3, 0);
    step(m);
    expect(result(m)).toBeNull();
    for (let t = 0; t < 200; t++) step(m);
    kill(m, 3, 0);
    step(m);
    expect(result(m)).toMatchObject({ winner: 0, reason: 'goal', outcome: 'won' });
  });

  it('the first tower wins (goal), and a played-out duel verifies', () => {
    const m = createMatch(config(7, 'duel'));
    for (let t = 0; t < 30; t++) step(m);
    m.world.globals[G.Towers1] = 1;
    step(m);
    expect(result(m)).toMatchObject({ winner: 1, reason: 'goal' });
    const p = createMatch(config(8, 'duel'));
    while (!result(p)) step(p);
    expect(['goal', 'timeUp']).toContain(result(p)!.reason);
    expect(verifyReplay(replayRecord(p)!).ok).toBe(true);
  }, 120000);
});

describe('sim v28 §4: Boss Weekend', () => {
  it('the boss is the enemy first slot with its hero, HP and arena; its team-mates sit out; structures take nothing', () => {
    const m = createMatch(config(9, 'boss'));
    const w = m.world;
    const b = bossOf(w);
    expect(b).toBe(3);
    expect(isBoss(w, 3)).toBe(true);
    expect(w.maxHp[b]).toBe(BOSS.hp);
    expect(w.x[b]).toBe(100000 - BOSS.homeX);
    expect([benched(w, 4), benched(w, 5), benched(w, 1)]).toEqual([true, true, false]);
    for (let id = RANGE.towers; id < RANGE.fountains; id++) expect(isInvulnerable(w, id)).toBe(true);
    for (let t = 0; t < 900; t++) step(m);
    // no waves
    let minions = 0;
    for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.alive[id] === 1) minions++;
    expect(minions).toBe(0);
    expect(snapshot(m, 0).entities.find((e) => e.id === b)?.boss).toBe(1);
  });

  it('phases at 66% and 33% call pups; the telegraphs are windup events on slots 6 and 7', () => {
    const m = createMatch(config(10, 'boss'));
    const w = m.world;
    const b = bossOf(w);
    const phases: number[] = [];
    const slots = new Set<number>();
    for (let t = 0; t < 1200; t++) {
      if (t === 300) w.hp[b] = Math.floor((w.maxHp[b] * 6000) / 10000);
      if (t === 600) w.hp[b] = Math.floor((w.maxHp[b] * 3000) / 10000);
      step(m);
      for (const e of m.events) {
        if (e.type === 'bossPhase') phases.push(e.phase);
        if (e.type === 'windup' && e.src === b && e.slot >= 6) slots.add(e.slot);
      }
    }
    expect(phases).toEqual([1, 2]);
    expect(slots.has(BOSS.poundSlot)).toBe(true);
    let pups = 0;
    for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.kind[id] === Kind.Minion && w.team[id] === w.team[b]) pups++;
    expect(pups).toBeGreaterThanOrEqual(BOSS.pups[0]);
  });

  it('felling the boss wins (goal); time up is the boss team’s win; a boss match verifies', () => {
    const m = createMatch(config(11, 'boss'));
    for (let t = 0; t < 30; t++) step(m);
    kill(m, bossOf(m.world), 0);
    step(m);
    expect(result(m)).toMatchObject({ winner: 0, reason: 'goal', outcome: 'won' });
    const p = createMatch(config(12, 'boss'));
    while (!result(p)) step(p);
    const r = result(p)!;
    if (r.reason === 'timeUp') expect(r.winner).toBe(1);
    else expect(r).toMatchObject({ reason: 'goal', winner: 0 });
    expect(verifyReplay(replayRecord(p)!).ok).toBe(true);
  }, 120000);
});
