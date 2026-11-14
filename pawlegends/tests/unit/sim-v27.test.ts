/**
 * Sim v27 (docs/plans/moba/V27.md): executions, the per-difficulty Fortified hero share and the Hearthwood chip scale
 * (§1), the Practice ground (§2), Cannon Chaos (§3) and the weekly twists (§4). The numbers come from the data files,
 * so a tuning pass changes the data, not these cases.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, PVP_RULES } from '../../src/data/bots';
import { MUTATOR_RULES } from '../../src/data/mutators';
import { PRACTICE } from '../../src/data/practice';
import { HEARTHWOOD_RULES } from '../../src/data/maps/hearthwood';
import { PICKUPS } from '../../src/data/pickups';
import { XP } from '../../src/data/xp';
import { CROSSING_CANNON } from '../../src/data/fun';
import { resolveDeaths } from '../../src/sim/combat/damage';
import { createMatch, fillPicks, replayRecord, result, step, type MatchHandle } from '../../src/sim/index';
import { decodeStream, encodeCommand, decodeCommand, encodeStream } from '../../src/sim/commands';
import { mutatorProblem } from '../../src/sim/mutator';
import { verifyReplay } from '../../src/sim/server';
import { applyBp } from '../../src/sim/fixed';
import { grantFish } from '../../src/sim/progression/fish';
import { bountyOf, executed } from '../../src/sim/progression/xp';
import { G, Kind, Order, RANGE } from '../../src/sim/world';
import { MUTATORS, Op, PRACTICE_KINDS, WEEKLY_TWISTS, type Command, type MatchConfig, type Mutator } from '../../src/sim/api';
import { SIM_VERSION } from '../../src/sim/version';
import { putHero, quietMatch } from './sim-helpers';

const config = (seed: number, mutator?: Mutator, extra: Partial<MatchConfig> = {}): MatchConfig => {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  return { seed, picks, tricks, difficulty: 'normal', ...(mutator ? { mutator } : {}), ...extra };
};

const kill = (m: MatchHandle, victim: number, by: number): void => {
  m.world.alive[victim] = 1;
  m.world.hp[victim] = 0;
  m.world.lastHitBy[victim] = by;
  resolveDeaths(m);
};

describe('sim v27: version and data', () => {
  it('is v27 or later with the new mutators appended (the index of none and blitz unchanged)', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(27);
    expect(MUTATORS.slice(0, 2)).toEqual(['none', 'blitz']);
    expect(MUTATORS.slice(0, 7)).toEqual(['none', 'blitz', 'cannon', 'practice', 'toybox', 'rapid', 'bounty']);
    expect(WEEKLY_TWISTS).toEqual(['toybox', 'rapid', 'bounty']);
    for (const id of MUTATORS) expect(MUTATOR_RULES[id]).toBeDefined();
    const none = MUTATOR_RULES.none;
    expect([none.cooldownBp, none.fishBp, none.pickupEveryBp, none.bountyBp, none.forfeitFrom, none.practice]).toEqual([10000, 10000, 10000, 10000, -1, false]);
    expect(MUTATOR_RULES.blitz.practice).toBe(false);
  });

  it('every new mutator is Crossing only and never in PvP', () => {
    for (const id of ['cannon', 'practice', 'toybox', 'rapid', 'bounty'] as const) {
      expect(MUTATOR_RULES[id].maps).toEqual(['crossing']);
      expect(mutatorProblem(id, 'crossing', false)).toBeNull();
      expect(mutatorProblem(id, 'hearthwood', false)).toMatch(/not played on hearthwood/);
      expect(mutatorProblem(id, 'crossing', true)).toMatch(/pvp/);
    }
  });

  it('Fortified hero share per difficulty, PvP keeps Hard’s', () => {
    expect(PVP_RULES.fortifyHeroBp).toBe(DIFFICULTY_RULES.hard.fortifyHeroBp);
    expect(DIFFICULTY_RULES.easy.fortifyHeroBp).toBeLessThanOrEqual(DIFFICULTY_RULES.normal.fortifyHeroBp);
  });
});

describe('sim v27 §1.A: executions', () => {
  it('a death with no enemy hero credited adds no kill and chips nothing; a takedown does', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    w.globals[G.Tick] = 3000;
    const core = RANGE.cores + 1;
    const hp = w.hp[core];
    // slot 3 (team 1) dies to a tower: an execution
    w.alive[3] = 1;
    w.hp[3] = 0;
    w.lastHitBy[3] = RANGE.towers;
    expect(executed(m, 3)).toBe(true);
    resolveDeaths(m);
    expect(w.globals[G.Kills0]).toBe(0);
    expect(w.hp[core]).toBe(hp);
    expect(m.stats[3].deaths).toBe(1);
    // the same death with hero 0 credited (it hit slot 3 within the assist window) is a takedown
    w.timer[3] = 0;
    w.alive[3] = 1;
    w.hp[3] = 0;
    w.lastHitBy[3] = RANGE.towers;
    w.assistTick[3 * RANGE.minions + 0] = w.globals[G.Tick] - 30;
    expect(executed(m, 3)).toBe(false);
    resolveDeaths(m);
    expect(w.globals[G.Kills0]).toBe(1);
    expect(w.hp[core]).toBeLessThan(hp);
  });

  it('an enemy hero landing the last hit is always a takedown', () => {
    const m = quietMatch(1, false, 'normal');
    kill(m, 3, 0);
    expect(m.world.globals[G.Kills0]).toBe(1);
  });
});

describe('sim v27 §1.B to §1.E: Hearthwood data', () => {
  it('a chip never takes a 5v5 tower below its floor (above half), Easy Fortified heroes weaker', () => {
    expect(HEARTHWOOD_RULES.chipFloorBp).toBeGreaterThanOrEqual(5000);
    expect(DIFFICULTY_RULES.easy.fortifyHeroBp).toBeLessThan(DIFFICULTY_RULES.normal.fortifyHeroBp);
  });
});

describe('sim v27 §2: the Practice ground', () => {
  const practice = (): MatchHandle => createMatch(config(7, 'practice'));

  it('dummies start on their spots, allies at the fountain; no waves, no Pudding, cores closed', () => {
    const m = practice();
    const w = m.world;
    for (let k = 0; k < 3; k++) {
      const id = 3 + k;
      expect([w.x[id], w.y[id]]).toEqual([PRACTICE.spots[k][0], PRACTICE.spots[k][1]]);
    }
    for (let t = 0; t < 30 * 60; t++) step(m);
    let minions = 0;
    for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.kind[id] === Kind.Minion && w.alive[id] === 1) minions++;
    expect(minions).toBe(0);
    expect(w.alive[RANGE.pudding]).toBe(0);
    expect(w.globals[G.CoreOpenAt]).toBeGreaterThan(30 * 60 * 10);
    // the allies never left the fountain
    expect(w.order[1]).toBe(Order.None);
    expect(w.order[2]).toBe(Order.None);
  });

  it('the walking dummy paces between its two points; the dummies never strike', () => {
    const m = practice();
    const w = m.world;
    const xs: number[] = [];
    // the player stands right next to the standing dummy: it must never hit back
    putHero(m, 0, PRACTICE.spots[0][0] - 1500, PRACTICE.spots[0][1]);
    const hp0 = w.hp[0];
    for (let t = 0; t < 30 * 40; t++) {
      step(m, t === 0 ? [{ op: Op.Stop }] : undefined);
      xs.push(w.x[4]);
    }
    expect(Math.max(...xs)).toBeGreaterThan(PRACTICE.walkTo[0] - PRACTICE.turn - 1000);
    expect(Math.min(...xs)).toBeLessThan(PRACTICE.spots[1][0] + PRACTICE.turn + 1000);
    // never lower (Practice Fish buys Toys, which may raise the max HP)
    expect(w.hp[0]).toBeGreaterThanOrEqual(hp0);
    expect(m.stats[3].heroDamage + m.stats[4].heroDamage + m.stats[5].heroDamage).toBe(0);
  });

  it('a dummy comes back on its spot; Op.Practice levels up, refreshes cooldowns and resets', () => {
    const m = practice();
    const w = m.world;
    step(m);
    kill(m, 3, 0);
    for (let t = 0; t < MUTATOR_RULES.practice.respawnFrom + 2; t++) step(m);
    expect(w.alive[3]).toBe(1);
    expect([w.x[3], w.y[3]]).toEqual([PRACTICE.spots[0][0], PRACTICE.spots[0][1]]);
    const lvl = w.level[0];
    step(m, [{ op: Op.Practice, kind: 1 }]);
    expect(w.level[0]).toBe(lvl + 1);
    w.cooldowns[0 * 5 + 0] = 300;
    step(m, [{ op: Op.Practice, kind: 2 }]);
    expect(w.cooldowns[0]).toBe(0);
    w.hp[3] = 10;
    w.hp[0] = 10;
    step(m, [{ op: Op.Practice, kind: 0 }]);
    expect(w.hp[3]).toBe(w.maxHp[3]);
    expect(w.hp[0]).toBe(w.maxHp[0]);
    expect(m.log.filter((c) => c.cmd.op === Op.Practice)).toHaveLength(3);
  });

  it('Op.Practice is ignored on any other match, and round-trips the command stream', () => {
    const m = createMatch(config(7));
    const lvl = m.world.level[0];
    step(m, [{ op: Op.Practice, kind: 1 }]);
    expect(m.world.level[0]).toBe(lvl);
    for (let k = 0; k < PRACTICE_KINDS.length; k++) {
      const c: Command = { op: Op.Practice, kind: k };
      expect(decodeCommand(encodeCommand(c))).toEqual(c);
    }
    const list = [{ tick: 3, cmd: { op: Op.Practice, kind: 2 } as Command }];
    expect(decodeStream(encodeStream(list))).toEqual(list);
    expect(() => decodeCommand(new Uint8Array([Op.Practice, 9]))).toThrow();
  });

  it('a Practice ground record re-simulates identically', () => {
    const m = practice();
    for (let t = 0; t < 1200; t++) step(m, t === 30 ? [{ op: Op.Practice, kind: 1 }] : t === 60 ? [{ op: Op.Move, x: 47000, y: 48000 }] : t === 400 ? [{ op: Op.Forfeit }] : undefined);
    expect(result(m)?.reason).toBe('forfeit');
    const rec = replayRecord(m)!;
    expect(rec.mutator).toBe('practice');
    expect(verifyReplay(rec).ok).toBe(true);
  });
});

describe('sim v27 §3: Cannon Chaos', () => {
  it('the cannon at 0:15 and every 20 s, level 3 start, 70% cooldowns, time up at 5:15', () => {
    const r = MUTATOR_RULES.cannon;
    expect(r.cannon).toEqual({ ...CROSSING_CANNON, first: 450, respawn: 600 });
    expect([r.startLevel, r.cooldownBp, r.hardEnd]).toEqual([3, 7000, 9450]);
    const m = createMatch(config(11, 'cannon'));
    let soon = -1;
    for (let t = 0; t < 600 && soon < 0; t++) {
      step(m);
      for (const e of m.events) if (e.type === 'cannonSoon') soon = e.tick;
    }
    expect(soon).toBe(450 - 300);
    expect(m.world.level[0]).toBe(3);
  });

  it('plays to its end and verifies', () => {
    const m = createMatch(config(12, 'cannon'));
    while (!result(m)) step(m);
    const res = result(m)!;
    expect(res.ticks).toBeLessThanOrEqual(MUTATOR_RULES.cannon.hardEnd);
    expect(verifyReplay(replayRecord(m)).ok).toBe(true);
  }, 120000);
});

describe('sim v27 §4: the weekly twists', () => {
  it('Toy Box doubles Fish and halves the pickup waits', () => {
    const m = createMatch(config(3, 'toybox'));
    const before = m.world.fish[0];
    grantFish(m, 0, 10, 'kill');
    expect(m.world.fish[0] - before).toBe(20);
    expect(m.world.globals[G.FrenzyAt]).toBe(applyBp(PICKUPS.frenzy.first, 5000));
  });

  it('Rapid Paws cuts every cooldown to 60%', () => {
    // the cooldown set on the tick slot 0's cast resolves (the first of W, E that sets one at level 1)
    const cast = (mut: Mutator | undefined, slot: 0 | 1 | 2): number => {
      const m = createMatch(config(4, mut));
      for (let t = 0; t < 400; t++) {
        step(m, t === 200 ? [{ op: Op.Cast, slot, x: m.world.x[0] + 4000, y: m.world.y[0], id: 255 }] : undefined);
        if (m.events.some((e) => e.type === 'cast' && e.src === 0 && e.slot === slot)) return m.world.cooldowns[slot];
      }
      return -1;
    };
    let checked = 0;
    for (const slot of [0, 1, 2] as const) {
      const a = cast(undefined, slot);
      if (a <= 0) continue;
      expect(cast('rapid', slot)).toBe(Math.max(1, applyBp(a, 6000)));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Bounty Hunt triples the bounty and the shutdown Fish', () => {
    const m = createMatch(config(5, 'bounty'));
    m.world.killStreak[3] = 4;
    m.events.length = 0;
    kill(m, 3, 0);
    const shut = m.events.find((e) => e.type === 'shutdown') as { value: number } | undefined;
    expect(shut?.value).toBe(applyBp(bountyOf(4), 30000));
    expect(bountyOf(4)).toBe(Math.min(XP.killPerStreak * 4, XP.killStreakMax));
  });

  it('every twist match plays to an end and verifies', () => {
    for (const id of WEEKLY_TWISTS) {
      const m = createMatch(config(21, id));
      while (!result(m)) step(m);
      expect(verifyReplay(replayRecord(m)).ok).toBe(true);
    }
  }, 120000);
});
