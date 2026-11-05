/**
 * Sim v12 (docs/FUN-PROGRESSION-V12.md): Fish and Toys (S1), the XP curve and shared XP (S2), respawn and the match
 * clock (S3), the bots' Toy power and the Fish handicap (S4), the cast-first input gate and the re-plan after a cast
 * (S5). Amounts are read from data/ (S6 tunes them); the comments give the spec's starting values.
 */
import { describe, expect, it } from 'vitest';
import { BOT_AI, DIFFICULTY_RULES } from '../../src/data/bots';
import { FISH } from '../../src/data/fish';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroRole } from '../../src/data/heroes/types';
import { MINIONS } from '../../src/data/minions';
import { TIMELINE_BY } from '../../src/data/timeline';
import { TOY_COST, TOY_POWER_TIERS, TOY_SUM, TOY_TIER, TOY_TIERS } from '../../src/data/toys';
import { RESPAWN, XP } from '../../src/data/xp';
import { Op, type Command, type SimEvent } from '../../src/sim/api';
import { dealDamage, resolveDeaths, respawnTicks } from '../../src/sim/combat/damage';
import { BP_ONE, applyBp } from '../../src/sim/fixed';
import { createMatch, fillPicks, step, type MatchHandle } from '../../src/sim/index';
import { createGate, gateCommand } from '../../src/sim/input';
import { fishTick, grantFish } from '../../src/sim/progression/fish';
import { catchUpBp, heroHp, levelForXp } from '../../src/sim/progression/levels';
import { shareOf } from '../../src/sim/progression/xp';
import { powerOf } from '../../src/sim/bots/sense';
import { placeAtFountain, applyOrder } from '../../src/sim/units/hero';
import { attackDamage, attackEvery, moveSpeed } from '../../src/sim/units/kinds';
import { G, Kind, RANGE, hashWorld } from '../../src/sim/world';
import { MOVE_MIN_GAP } from '../../src/data/limits';
import { MID, heroMatch, hold, place, setLevel } from './heroes/kit-helpers';
import { putMinion, quietMatch, towerId } from './sim-helpers';

const match = (): MatchHandle => {
  const m = heroMatch(['brutus', 'sage', 'clem', 'lambo', 'cacklejaw', 'bengas']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -30000 : 30000), MID.y + id * 3000, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
};

function kill(m: MatchHandle, by: number, victim: number): void {
  m.world.hp[victim] = 1;
  dealDamage(m, by, m.world.team[by], Kind.Hero, victim, 1000, 'basic');
  resolveDeaths(m);
}

const fishEvents = (m: MatchHandle): Extract<SimEvent, { type: 'fish' }>[] => m.events.filter((e): e is Extract<SimEvent, { type: 'fish' }> => e.type === 'fish');

describe('sim v12 Fish (S1)', () => {
  it('a lane minion pays its last hitter FISH.lastHitBp and each other hero in range FISH.nearBp (spec start: melee 12 → 7 and 4)', () => {
    const m = match();
    const w = m.world;
    const minion = putMinion(m, 1, MID.x, MID.y);
    place(m, 0, MID.x - 3000, MID.y, 0);
    place(m, 1, MID.x - 6000, MID.y, 0);
    w.lastHitBy[minion] = 0;
    w.hp[minion] = 0;
    resolveDeaths(m);
    expect(applyBp(12, FISH.lastHitBp)).toBe(7);
    expect(applyBp(12, FISH.nearBp)).toBe(4);
    expect(w.fish[0]).toBe(applyBp(FISH.minion[0], FISH.lastHitBp));
    expect(w.fish[1]).toBe(applyBp(FISH.minion[0], FISH.nearBp));
    expect(w.fish[2]).toBe(0);
    expect(m.stats[0].lastHits).toBe(1);
    expect(fishEvents(m).map((e) => [e.id, e.reason])).toEqual([
      [0, 'lastHit'],
      [1, 'minion'],
    ]);
    // No hero last hit (a minion did): every hero in range gets FISH.nearBp.
    const m2 = match();
    const minion2 = putMinion(m2, 1, MID.x, MID.y);
    const ally = putMinion(m2, 0, MID.x - 1000, MID.y);
    place(m2, 0, MID.x - 3000, MID.y, 0);
    place(m2, 1, MID.x - 6000, MID.y, 0);
    m2.world.lastHitBy[minion2] = ally;
    m2.world.hp[minion2] = 0;
    resolveDeaths(m2);
    expect([m2.world.fish[0], m2.world.fish[1]]).toEqual([applyBp(FISH.minion[0], FISH.nearBp), applyBp(FISH.minion[0], FISH.nearBp)]);
    expect(m2.stats[0].lastHits).toBe(0);
  });

  it('kills: the kill value, first blood, less for a victim that keeps dying, shutdown for the killer, assists split half', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    kill(m, 0, 3);
    expect(w.fish[0]).toBe(FISH.kill + FISH.firstBlood); // 170
    expect(fishEvents(m).map((e) => e.reason)).toEqual(['kill', 'firstBlood']);
    expect(w.deathStreak[3]).toBe(1);
    const fishFor = (deaths: number, streak = 0): number => {
      const m2 = match();
      m2.world.globals[G.FirstBlood] = 1;
      place(m2, 4, MID.x, MID.y, 0);
      place(m2, 0, MID.x - 2000, MID.y, 0);
      m2.world.deathStreak[4] = deaths;
      m2.world.killStreak[4] = streak;
      kill(m2, 0, 4);
      return m2.world.fish[0];
    };
    expect([FISH.kill, FISH.killRepeat, FISH.killFed]).toEqual([120, 80, 50]);
    expect(fishFor(0)).toBe(FISH.kill);
    expect(fishFor(1)).toBe(FISH.kill);
    expect(fishFor(2)).toBe(FISH.killRepeat);
    expect(fishFor(4)).toBe(FISH.killFed);
    expect(fishFor(0, 4)).toBe(FISH.kill + 4 * FISH.shutdownPerStreak); // +160
    expect(fishFor(0, 9)).toBe(FISH.kill + FISH.shutdownMax);
    // Two assisters on a 120 kill split FISH.assistBp of it: 30 each.
    const m3 = match();
    m3.world.globals[G.FirstBlood] = 1;
    place(m3, 3, MID.x, MID.y, 0);
    place(m3, 0, MID.x - 2000, MID.y, 0);
    dealDamage(m3, 1, 0, Kind.Hero, 3, 5, 'basic');
    dealDamage(m3, 2, 0, Kind.Hero, 3, 5, 'basic');
    m3.world.deathStreak[1] = 3;
    kill(m3, 0, 3);
    expect([m3.world.fish[1], m3.world.fish[2]]).toEqual([30, 30]);
    expect(m3.events.find((e) => e.type === 'shutdown')).toBeUndefined();
    // An assist resets the assister's death streak.
    expect(m3.world.deathStreak[1]).toBe(0);
  });

  it('a shutdown event carries its Fish', () => {
    const m = match();
    m.world.globals[G.FirstBlood] = 1;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    m.world.killStreak[3] = 4;
    kill(m, 0, 3);
    expect(m.events.find((e) => e.type === 'shutdown')).toMatchObject({ killer: 0, victim: 3, fish: 160 });
  });

  it('a tower kill (no killer) pays no kill Fish; near assisters (Easy) are still paid', () => {
    const m = quietMatch(3, false, 'easy');
    const w = m.world;
    w.globals[G.FirstBlood] = 1;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 1, MID.x - 2000, MID.y, 0);
    w.hp[3] = 1;
    dealDamage(m, towerId(0, 0), 0, Kind.Tower, 3, 1000, 'tower');
    resolveDeaths(m);
    expect(m.stats[1].assists).toBe(1);
    expect(w.fish[1]).toBe(applyBp(FISH.kill, FISH.assistBp));
    expect(fishEvents(m).every((e) => e.reason === 'assist')).toBe(true);
  });

  it('fishTick buys tier 1 at exactly its cost, tiers 1 and 2 in one second, in slot order, raising max HP', () => {
    const m = match();
    const w = m.world;
    const p = FISH.passivePerSecond;
    w.fish[0] = TOY_COST[0] - p - 1;
    w.fish[3] = TOY_COST[0] + TOY_COST[1] - p;
    w.fish[1] = TOY_COST[0] - p;
    const hp0 = w.maxHp[0];
    const hp3 = w.maxHp[3];
    m.events = [];
    fishTick(m);
    expect([w.toy[0], w.toy[1], w.toy[3]]).toEqual([0, 1, 2]);
    expect([w.fish[1], w.fish[3]]).toEqual([0, 0]);
    expect(m.events.filter((e) => e.type === 'buy').map((e) => (e.type === 'buy' ? [e.id, e.tier] : []))).toEqual([
      [1, 1],
      [3, 1],
      [3, 2],
    ]);
    expect(w.maxHp[0]).toBe(hp0);
    // Lambo (tank): the HP levels of tiers 1 and 2.
    const per = heroHp(HEROES[HERO_IDS[w.sub[3]]].base.hpPerLevel);
    expect(w.maxHp[3] - hp3).toBe((TOY_TIER.tank[0].hpLevels + TOY_TIER.tank[1].hpLevels) * per);
    expect(m.stats[3].toys).toBe(2);
    expect(m.stats[3].toy1At).toBe(w.globals[G.Tick]);
    expect(m.stats[0].toy1At).toBe(-1);
  });

  it('a hero that buys while dead keeps 0 HP and respawns at the new max HP', () => {
    const m = match();
    const w = m.world;
    w.alive[0] = 0;
    w.hp[0] = 0;
    w.fish[0] = TOY_COST[0];
    const before = w.maxHp[0];
    fishTick(m);
    expect(w.toy[0]).toBe(1);
    expect(w.hp[0]).toBe(0);
    expect(w.maxHp[0]).toBeGreaterThan(before);
    placeAtFountain(w, 0);
    expect(w.hp[0]).toBe(w.maxHp[0]);
  });

  it('Toys add damage to heroes and minions, never to towers', () => {
    const hit = (toy: number, dst: (m: MatchHandle) => number): number => {
      const m = match();
      m.world.toy[2] = toy; // Clem, a fighter
      const id = dst(m);
      return dealDamage(m, 2, 0, Kind.Hero, id, 200, 'basic');
    };
    expect(hit(4, () => towerId(1, 0))).toBe(hit(0, () => towerId(1, 0)));
    const minion = (m: MatchHandle): number => putMinion(m, 1, MID.x, MID.y);
    expect(hit(4, minion)).toBeGreaterThan(hit(0, minion));
    const hero = (m: MatchHandle): number => {
      place(m, 4, MID.x, MID.y, 0);
      return 4;
    };
    expect(hit(1, hero)).toBeGreaterThan(hit(0, hero));
  });

  it('Toys add attack speed and move speed (slows still apply)', () => {
    const m = match();
    const w = m.world;
    const every = attackEvery(w, 1);
    const speed = moveSpeed(w, 1);
    w.toy[1] = 4; // Sage, a marksman: attack speed and move speed
    expect(attackEvery(w, 1)).toBeLessThan(every);
    expect(moveSpeed(w, 1)).toBe(applyBp(speed, BP_ONE + TOY_SUM.marksman[4].speedBp));
    w.slowBp[1] = 3000;
    expect(moveSpeed(w, 1)).toBe(applyBp(speed, BP_ONE - 3000 + TOY_SUM.marksman[4].speedBp));
  });

  it('TOY_SUM is the running total of TOY_TIER; TOY_POWER_TIERS counts the tiers without HP', () => {
    for (const role of Object.keys(TOY_TIER) as HeroRole[]) {
      const sum = { dmgBp: 0, hpLevels: 0, asBp: 0, speedBp: 0 };
      let power = 0;
      expect(TOY_SUM[role][0]).toEqual(sum);
      for (let t = 0; t < TOY_TIERS; t++) {
        const r = TOY_TIER[role][t];
        sum.dmgBp += r.dmgBp;
        sum.hpLevels += r.hpLevels;
        sum.asBp += r.asBp;
        sum.speedBp += r.speedBp;
        if (r.hpLevels === 0) power++;
        expect(TOY_SUM[role][t + 1], `${role} ${t + 1}`).toEqual(sum);
        expect(TOY_POWER_TIERS[role][t + 1]).toBe(power);
      }
    }
  });

  it('per-role power at level 6 (effective HP × damage a second × speed): each tier +5% to +15%, the full set within ±10% across roles', () => {
    const roles = new Map<HeroRole, number[]>();
    for (const hero of HERO_IDS) {
      const role = HEROES[hero].role;
      if (roles.has(role)) continue;
      const row: number[] = [];
      for (let toy = 0; toy <= TOY_TIERS; toy++) {
        const { picks, tricks } = fillPicks(1, hero, 'pounce');
        const m = createMatch({ seed: 1, picks, tricks, difficulty: 'normal' });
        setLevel(m, 0, 6);
        const w = m.world;
        w.fish[0] = TOY_COST.slice(0, toy).reduce((x, y) => x + y, 0) - FISH.passivePerSecond;
        fishTick(m);
        expect(w.toy[0]).toBe(toy);
        const s = TOY_SUM[role][toy];
        const effHp = (w.maxHp[0] * (100 + w.armour[0])) / 100;
        const dps = (attackDamage(w, 0) * (BP_ONE + s.dmgBp)) / BP_ONE / attackEvery(w, 0);
        row.push(effHp * dps * (1 + s.speedBp / BP_ONE));
      }
      roles.set(role, row);
    }
    const full: number[] = [];
    for (const [role, row] of roles) {
      for (let t = 1; t <= TOY_TIERS; t++) {
        const gain = row[t] / row[t - 1] - 1;
        expect(gain, `${role} tier ${t}`).toBeGreaterThanOrEqual(0.05);
        expect(gain, `${role} tier ${t}`).toBeLessThanOrEqual(0.15);
      }
      full.push(row[TOY_TIERS] / row[0]);
    }
    const avg = full.reduce((a, b) => a + b, 0) / full.length;
    for (const f of full) expect(Math.abs(f / avg - 1)).toBeLessThanOrEqual(0.1);
  });

  it('Rookie: the human\'s enemies keep enemyFishBp of their Fish (exactly, over many small grants); that team gets no comeback Fish', () => {
    const m = quietMatch(1, false, 'rookie');
    const w = m.world;
    const bp = DIFFICULTY_RULES.rookie.enemyFishBp;
    expect(bp).toBeLessThan(BP_ONE);
    for (let i = 0; i < 100; i++) grantFish(m, 3, 1, null);
    expect(w.fishRaw[3]).toBe(100);
    expect(w.fish[3]).toBe(applyBp(100, bp));
    grantFish(m, 0, 100, 'kill');
    expect(w.fish[0]).toBe(100);
    // The enemy team is behind on raw Fish, but it is the handicapped team: only the passive Fish.
    w.fishRaw[0] = 5000;
    const before = [w.fishTotal[3], w.fishTotal[4], w.fishTotal[5]];
    w.globals[G.Tick] = DIFFICULTY_RULES.rookie.catchUpFrom;
    fishTick(m);
    const got = [w.fishTotal[3] - before[0], w.fishTotal[4] - before[1], w.fishTotal[5] - before[2]];
    expect(Math.max(...got)).toBeLessThanOrEqual(FISH.passivePerSecond);
    // The human's team behind gets comeback Fish on its lowest hero.
    const m2 = quietMatch(1, false, 'normal');
    m2.world.fishRaw[3] = 5000;
    m2.world.globals[G.Tick] = DIFFICULTY_RULES.normal.catchUpFrom;
    m2.world.fishTotal[0] = 10;
    m2.world.fishTotal[1] = 5;
    m2.world.fishTotal[2] = 20;
    fishTick(m2);
    expect(m2.world.fishTotal[1]).toBe(5 + FISH.passivePerSecond + FISH.comebackPerSecond);
    expect(m2.world.fishTotal[0]).toBe(10 + FISH.passivePerSecond);
  });

  it('the five new arrays are hashed', () => {
    for (const key of ['fish', 'fishTotal', 'fishRaw', 'toy', 'deathStreak'] as const) {
      const m = match();
      const h = hashWorld(m.world);
      m.world[key][2]++;
      expect(hashWorld(m.world), key).not.toBe(h);
    }
  });

  it('snapshots carry Toys for both teams and Fish for the own team only', async () => {
    const { snapshot } = await import('../../src/sim/index');
    const m = match();
    m.world.fish[0] = 321;
    m.world.toy[3] = 2;
    const own = snapshot(m, 0).entities;
    expect(own.find((e) => e.id === 0)).toMatchObject({ fish: 321, toy: 0 });
    expect(own.find((e) => e.id === 3)?.toy).toBe(2);
    expect(own.find((e) => e.id === 3)?.fish).toBeUndefined();
  });
});

describe('sim v12 XP (S2), respawn and clock (S3), bots (S4)', () => {
  it('XP curve and shared XP', () => {
    const last = XP.toLevel[XP.maxLevel - 1];
    expect(levelForXp(last)).toBe(10);
    expect(levelForXp(last - 1)).toBe(9);
    expect(shareOf(30, 1)).toBe(30);
    expect(shareOf(30, 2)).toBe(applyBp(30, XP.shareBp[1]));
    expect(shareOf(30, 3)).toBe(applyBp(30, XP.shareBp[2]));
    // Shared XP never pays less in total than an equal split.
    for (let n = 1; n <= 3; n++) expect(shareOf(300, n) * n).toBeGreaterThanOrEqual(300);
  });

  it('catch-up starts at catchUpFrom: Normal 0 at 5399, active at 5400; Rookie from tick 0', () => {
    const at = (difficulty: 'normal' | 'rookie', tick: number): number => {
      const m = quietMatch(7, false, difficulty);
      for (let h = 3; h < 6; h++) m.world.level[h] = 5;
      m.world.globals[G.Tick] = tick;
      return catchUpBp(m, 0);
    };
    expect(DIFFICULTY_RULES.normal.catchUpFrom).toBe(5400);
    expect(at('normal', 5399)).toBe(0);
    expect(at('normal', 5400)).toBeGreaterThan(0);
    expect(at('rookie', 0)).toBeGreaterThan(0);
  });

  it('respawn: level 10 → 12 s, 15 s after Sunset, and never above RESPAWN.hardCap with a 10-takedown gap', () => {
    expect(respawnTicks(10, 4000, 12150)).toBe(360);
    expect(respawnTicks(10, 12150, 12150)).toBe(450);
    const m = quietMatch(2, false, 'normal');
    const w = m.world;
    w.globals[G.Tick] = TIMELINE_BY.normal.sunset + 30;
    w.globals[G.Kills1] = 10;
    setLevel(m, 0, 10);
    w.hp[0] = 0;
    resolveDeaths(m);
    expect(w.timer[0]).toBe(RESPAWN.hardCap);
  });

  it('bots count Toy tiers without HP in the fight check (BOT_AI.powerPerToy)', () => {
    const m = match();
    const w = m.world;
    const base = powerOf(w, 1, BOT_AI.powerPerLevel);
    w.toy[1] = 2; // Sage, a marksman: two tiers without HP
    expect(powerOf(w, 1, BOT_AI.powerPerLevel)).toBe(base + 2 * BOT_AI.powerPerToy);
    // A fight 1% short of fightPowerBp turns into a fight with toy 2 (and the mirrored side backs off).
    const theirs = 1000;
    const p = 7000;
    const ours = Math.trunc((theirs * p) / BP_ONE) - Math.trunc((theirs * p) / BP_ONE / 100);
    expect(ours * BP_ONE >= theirs * p).toBe(false);
    expect((ours + 2 * BOT_AI.powerPerToy) * BP_ONE >= theirs * p).toBe(true);
    expect(ours * BP_ONE >= (theirs + 2 * BOT_AI.powerPerToy) * p).toBe(false);
  });

  it('Normal Sunset and Sudden Death moved by 45 s, Easy has its own row, Rookie unchanged', () => {
    expect(TIMELINE_BY.normal).toEqual({ sunset: 12150, suddenDeath: 15300 });
    expect(TIMELINE_BY.hard).toEqual(TIMELINE_BY.normal);
    expect(TIMELINE_BY.easy).toEqual({ sunset: 10350, suddenDeath: 13950 });
    expect(TIMELINE_BY.rookie).toEqual({ sunset: 7200, suddenDeath: 11700 });
    expect(MINIONS.melee.xp).toBe(30);
  });
});

describe('sim v12 input (S5)', () => {
  const move: Command = { op: Op.Move, x: 40000, y: 20000 };
  const move2: Command = { op: Op.Move, x: 42000, y: 22000 };
  const castQ: Command = { op: Op.Cast, slot: 0, x: 50000, y: 30000, id: 255 };
  const castW: Command = { op: Op.Cast, slot: 1, x: 50000, y: 30000, id: 255 };

  it('a cast wins over a move of the same tick, in either order; the move waits for the gap', () => {
    for (const cmds of [
      [castQ, move],
      [move, castQ],
    ]) {
      const g = createGate();
      expect(gateCommand(g, 10, cmds)).toEqual(castQ);
      expect(g.pending).toEqual(move);
      expect(gateCommand(g, 11, [])).toEqual(move);
      expect(g.pending).toBeNull();
    }
  });

  it('a waiting move survives a later cast (a newer move replaces it) and applies after it', () => {
    const g = createGate();
    expect(gateCommand(g, 10, [move])).toEqual(move);
    expect(gateCommand(g, 11, [move2])).toBeNull();
    expect(g.pending).toEqual(move2);
    expect(gateCommand(g, 12, [castQ])).toEqual(castQ);
    expect(g.pending).toEqual(move2);
    expect(gateCommand(g, 13, [castW])).toEqual(castW);
    expect(gateCommand(g, 10 + MOVE_MIN_GAP, [])).toEqual(move2);
    // Stop and Nap still drop a waiting move.
    const g2 = createGate();
    gateCommand(g2, 10, [move]);
    gateCommand(g2, 11, [move2]);
    expect(gateCommand(g2, 12, [{ op: Op.Stop }])).toEqual({ op: Op.Stop });
    expect(g2.pending).toBeNull();
  });

  it('the applied log fed back through the gate gives the same stream', () => {
    const g = createGate();
    const applied: { tick: number; cmd: Command }[] = [];
    const script: Command[][] = [[move], [castQ, move2], [move], [move2, castW], [], [move], [{ op: Op.Stop }], [], [move2], [castQ], [], []];
    script.forEach((cmds, i) => {
      const c = gateCommand(g, 100 + i, cmds);
      if (c) applied.push({ tick: 100 + i, cmd: c });
    });
    const g2 = createGate();
    const again: { tick: number; cmd: Command }[] = [];
    for (let t = 100; t < 100 + script.length; t++) {
      const c = gateCommand(g2, t, applied.filter((a) => a.tick === t).map((a) => a.cmd));
      if (c) again.push({ tick: t, cmd: c });
    }
    expect(again).toEqual(applied);
  });

  it('S5b: a hero moves again within 2 ticks after its cast ends', () => {
    const m = match();
    const w = m.world;
    place(m, 1, MID.x, MID.y, 0);
    applyOrder(m, 1, { op: Op.Move, x: MID.x + 20000, y: MID.y });
    step(m);
    applyOrder(m, 1, castQ.op === Op.Cast ? { ...castQ, x: MID.x + 6000, y: MID.y } : castQ);
    let ended = -1;
    for (let t = 0; t < 60 && ended < 0; t++) {
      step(m);
      if (w.castPhase[1] === 0) ended = t;
    }
    expect(ended).toBeGreaterThanOrEqual(0);
    applyOrder(m, 1, { op: Op.Move, x: MID.x + 20000, y: MID.y });
    const x0 = w.x[1];
    step(m);
    step(m);
    expect(w.x[1]).toBeGreaterThan(x0);
  });
});

describe('sim v12 RANGE sanity', () => {
  it('heroes keep ids 0..5', () => {
    expect(RANGE.minions - RANGE.heroes).toBe(6);
  });
});
