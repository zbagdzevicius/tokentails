/**
 * Sim v26 (docs/plans/moba/V26-TOWERS.md; founder: "make towers more durable and hit harder, especially in early
 * game"): every new tower rule, one case each. The numbers come from data/towers.ts, data/bots.ts and
 * data/mutators.ts, so a tuning pass changes the data, not these cases.
 */
import { describe, expect, it } from 'vitest';
import { TOWER_SPOTS } from '../../src/data/map';
import { DIFFICULTY_RULES, PVP_RULES } from '../../src/data/bots';
import { MUTATOR_RULES } from '../../src/data/mutators';
import { TOWERS } from '../../src/data/towers';
import { structureShot } from '../../src/sim/combat/attack';
import { dealDamage, resolveDeaths } from '../../src/sim/combat/damage';
import { BP_ONE, applyBp } from '../../src/sim/fixed';
import { fortifyUntilOf } from '../../src/sim/mutator';
import { stepStructures } from '../../src/sim/units/tower';
import { G, Kind, RANGE } from '../../src/sim/world';
import { beamHeat, BEAM } from '../../src/render/fx/towerBeams';
import { coreId, putHero, putMinion, quietMatch, towerId } from './sim-helpers';

const OUTER = TOWER_SPOTS[0];
const normal = () => quietMatch(1, false, 'normal');

/** Kill hero slot 3 (team 1) with the kill count of team 0 past the core-chip cap, so the chip goes to a tower. */
function takedownPastCap(m: ReturnType<typeof normal>): void {
  const w = m.world;
  w.globals[G.Kills0] = 20;
  w.alive[3] = 1;
  w.hp[3] = 0;
  resolveDeaths(m);
}

const woofTowerLoss = (w: ReturnType<typeof normal>['world']): number => {
  let loss = 0;
  for (let id = RANGE.towers; id < RANGE.cores; id++) if (w.team[id] === 1) loss += w.maxHp[id] - w.hp[id];
  return loss;
};

describe('sim v26 towers: data', () => {
  it('the v26 numbers', () => {
    expect([TOWERS.heroDamage, TOWERS.heroMaxHpBp, TOWERS.rampBp, TOWERS.rampCapBp, TOWERS.fortifyBoltBp]).toEqual([130, 300, 3000, 9000, 12500]);
    expect([TOWERS.fortifyBp, TOWERS.fortifyMinionBp, TOWERS.chipFloorBp, TOWERS.lockOnTicks]).toEqual([5500, 7500, 1500, 30]);
    expect(TOWERS.fortifyUntil).toEqual([7200, 9900]);
    expect(TOWERS.minionDamage).toBe(110);
    expect(MUTATOR_RULES.blitz.fortifyUntil).toBe(1350);
    expect([DIFFICULTY_RULES.rookie.structureHpBp, DIFFICULTY_RULES.easy.structureHpBp, DIFFICULTY_RULES.normal.structureHpBp, DIFFICULTY_RULES.hard.structureHpBp]).toEqual([11000, 11500, 13500, 13500]);
    expect([DIFFICULTY_RULES.normal.takedownTowerChipBp, DIFFICULTY_RULES.hard.takedownTowerChipBp, PVP_RULES.takedownTowerChipBp]).toEqual([2000, 1500, 1500]);
    expect([DIFFICULTY_RULES.rookie.takedownTowerChipBp, DIFFICULTY_RULES.easy.takedownTowerChipBp]).toEqual([0, 0]);
  });
});

describe('sim v26 towers: bolts', () => {
  it('a bolt at a hero is 130 + 3% of its max HP with the ramp, ×1.25 while Fortified; cores keep 120, minions take 110', () => {
    const m = normal();
    const w = m.world;
    const t = towerId(0, 0);
    const hero = putHero(m, 3, OUTER.x + 2000, OUTER.y);
    const base = TOWERS.heroDamage + applyBp(w.maxHp[hero], TOWERS.heroMaxHpBp);
    for (const streak of [0, 1, 2, 3, 4, 9]) {
      w.streak[t] = streak;
      const ramped = applyBp(base, BP_ONE + Math.min(streak * TOWERS.rampBp, TOWERS.rampCapBp));
      w.globals[G.Tick] = 0;
      expect(structureShot(w, t, hero)).toBe(applyBp(ramped, TOWERS.fortifyBoltBp));
      w.globals[G.Tick] = fortifyUntilOf(w);
      expect(structureShot(w, t, hero)).toBe(ramped);
    }
    // a tankier hero takes a bigger bolt
    w.maxHp[hero] += 1000;
    w.streak[t] = 0;
    expect(structureShot(w, t, hero)).toBe(base + 30);
    const minion = putMinion(m, 1, OUTER.x + 1000, OUTER.y);
    w.globals[G.Tick] = 0;
    expect(structureShot(w, t, minion)).toBe(TOWERS.minionDamage);
    expect(structureShot(w, coreId(0), hero)).toBe(120);
  });

  it('the lock-on is 1.0 s: the first bolt at a hero leaves 30 ticks after it is marked', () => {
    const m = normal();
    const w = m.world;
    const t = towerId(0, 0);
    putHero(m, 3, OUTER.x + 2000, OUTER.y);
    let fired = -1;
    for (let i = 0; i < 60 && fired < 0; i++) {
      w.pAlive.fill(0);
      stepStructures(m);
      for (let p = 0; p < w.pAlive.length; p++) if (w.pAlive[p] === 1 && w.pOwner[p] === t) fired = i;
    }
    expect(fired).toBe(TOWERS.lockOnTicks);
  });
});

describe('sim v26 towers: a tower commits to a hero it has shot', () => {
  it('keeps shooting an unforced hero it has already hit when a minion walks in; one still in its lock-on yields', () => {
    const m = normal();
    const w = m.world;
    const t = towerId(0, 0);
    const hero = putHero(m, 3, OUTER.x + 2000, OUTER.y);
    // still locking on: a minion takes over (as in v25)
    stepStructures(m);
    expect(w.target[t]).toBe(hero);
    const minion = putMinion(m, 1, OUTER.x + 3000, OUTER.y);
    stepStructures(m);
    expect(w.target[t]).toBe(minion);
    // the minion leaves; the tower locks on to the hero and fires
    w.alive[minion] = 0;
    for (let i = 0; i < TOWERS.lockOnTicks + 2; i++) stepStructures(m);
    expect(w.shotAt[t]).toBe(hero);
    expect(w.forced[t]).toBe(0);
    const minion2 = putMinion(m, 1, OUTER.x + 1000, OUTER.y);
    stepStructures(m);
    expect(w.target[t]).toBe(hero);
    // out of range: dropped for the minion
    w.x[hero] = OUTER.x + 20000;
    stepStructures(m);
    expect(w.target[t]).toBe(minion2);
  });
});

describe('sim v26 towers: Fortified', () => {
  it('minions and the Pudding deal 75% to a Fortified tower, heroes 55%', () => {
    const m = normal();
    const w = m.world;
    const t = towerId(1, 0);
    const minion = putMinion(m, 0, w.x[t] - 2000, w.y[t]);
    const hero = putHero(m, 0, w.x[t] - 2000, w.y[t]);
    const minionEarly = dealDamage(m, minion, 0, Kind.Minion, t, 1000, 'basic');
    const heroEarly = dealDamage(m, hero, 0, Kind.Hero, t, 1000, 'basic');
    const puddingEarly = dealDamage(m, RANGE.pudding, 0, Kind.Pudding, t, 1000, 'ability');
    w.globals[G.Tick] = fortifyUntilOf(w);
    const minionLate = dealDamage(m, minion, 0, Kind.Minion, t, 1000, 'basic');
    const heroLate = dealDamage(m, hero, 0, Kind.Hero, t, 1000, 'basic');
    const puddingLate = dealDamage(m, RANGE.pudding, 0, Kind.Pudding, t, 1000, 'ability');
    expect(minionEarly).toBe(applyBp(minionLate, TOWERS.fortifyMinionBp));
    expect(heroEarly).toBe(applyBp(heroLate, TOWERS.fortifyBp));
    expect(puddingEarly).toBe(applyBp(puddingLate, TOWERS.fortifyMinionBp));
  });

  it('the windows: Crossing 4:00, Hearthwood 5:30, Blitz 0:45', () => {
    const m = normal();
    expect(fortifyUntilOf(m.world)).toBe(7200);
    m.world.map = 1;
    expect(fortifyUntilOf(m.world)).toBe(9900);
    m.world.map = 0;
    m.world.mutator = 1;
    expect(fortifyUntilOf(m.world)).toBe(1350);
  });
});

describe('sim v26 towers: the takedown chip', () => {
  it('no tower chip while Fortified (the first takedowns still chip the core)', () => {
    const m = normal();
    const w = m.world;
    w.globals[G.Tick] = fortifyUntilOf(w) - 1;
    takedownPastCap(m);
    expect(woofTowerLoss(w)).toBe(0);
    w.globals[G.Tick] = fortifyUntilOf(w);
    takedownPastCap(m);
    expect(woofTowerLoss(w)).toBe(applyBp(w.maxHp[towerId(1, 0)], DIFFICULTY_RULES.normal.takedownTowerChipBp));
  });

  it('a chip stops at 15% of max HP, and towers at or below 15% take none', () => {
    const m = normal();
    const w = m.world;
    w.globals[G.Tick] = fortifyUntilOf(w);
    const outers = [towerId(1, 0), towerId(1, 2)];
    const floor = (id: number) => applyBp(w.maxHp[id], TOWERS.chipFloorBp);
    // the weakest outer is just above the floor: the chip takes it to the floor, not below
    w.hp[outers[0]] = floor(outers[0]) + 50;
    takedownPastCap(m);
    expect(w.hp[outers[0]]).toBe(floor(outers[0]));
    expect(w.alive[outers[0]]).toBe(1);
    // now it is at the floor: the next chip goes to the other outer
    const before = w.hp[outers[1]];
    takedownPastCap(m);
    expect(w.hp[outers[0]]).toBe(floor(outers[0]));
    expect(w.hp[outers[1]]).toBe(before - applyBp(w.maxHp[outers[1]], DIFFICULTY_RULES.normal.takedownTowerChipBp));
    // every hittable tower at the floor: no chip at all (the inners are still invulnerable)
    w.hp[outers[1]] = floor(outers[1]);
    const hp = outers.map((id) => w.hp[id]);
    const core = w.hp[coreId(1)];
    takedownPastCap(m);
    expect(outers.map((id) => w.hp[id])).toEqual(hp);
    expect(w.hp[coreId(1)]).toBe(core);
  });
});

describe('sim v26 towers: render', () => {
  it('warming-up beams: the first shot is cold, then one step a shot up to the cap', () => {
    expect([0, 1, 2, 3, 4, 9].map(beamHeat)).toEqual([0, 1, 2, 3, 3, 3]);
    expect(BEAM.heatMax).toBe(3);
  });
});
