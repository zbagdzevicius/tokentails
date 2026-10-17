/** Rat camps and Pudding (POC.md §5, §7.3): spawns, leash, XP, the scared hop, the calm race and the escort. */
import { describe, expect, it } from 'vitest';
import { RAT_CAMP_STATS } from '../../src/data/camps';
import { RAT_CAMP, RADIUS, mirrorX } from '../../src/data/map';
import { PUDDING, PUD_STATE } from '../../src/data/pudding';
import { TIMELINE } from '../../src/data/timeline';
import { Op } from '../../src/sim/api';
import { dealDamage, resolveDeaths } from '../../src/sim/combat/damage';
import { snapshot, step, type MatchHandle } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { G, Kind, RANGE, TEAM_NEUTRAL } from '../../src/sim/world';
import { heroMatch, hold, place, steps } from './heroes/kit-helpers';
import { putMinion, towerId } from './sim-helpers';

const RAT0 = RANGE.camps;
const PUD = RANGE.pudding;

function at(m: MatchHandle, tick: number): void {
  m.world.globals[G.Tick] = tick;
}

function match(): MatchHandle {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
  // Park every hero far from the camps and the river, frozen.
  for (let id = 0; id < 6; id++) place(m, id, id < 3 ? 6000 : 94000, 20000 + id * 3000);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
}

describe('rat camps (§5)', () => {
  it('two rats per side appear at 1:00 at (30, 30) and its mirror, neutral, 450 HP', () => {
    const m = match();
    at(m, TIMELINE.campsUp - 1);
    step(m);
    expect(m.world.alive[RAT0]).toBe(0);
    step(m);
    for (let k = 0; k < 4; k++) {
      const id = RAT0 + k;
      expect(m.world.alive[id]).toBe(1);
      expect(m.world.kind[id]).toBe(Kind.Camp);
      expect(m.world.team[id]).toBe(TEAM_NEUTRAL);
      expect(m.world.hp[id]).toBe(RAT_CAMP_STATS.hp);
      expect(m.world.x[id]).toBe(k < 2 ? RAT_CAMP.x : mirrorX(RAT_CAMP.x));
    }
    expect(snapshot(m, 0).entities.filter((e) => e.kind === 'camp')).toHaveLength(4);
  });

  it('a hit rat and its camp mate chase the attacker and bite it (25)', () => {
    const m = match();
    at(m, TIMELINE.campsUp);
    step(m);
    const w = m.world;
    place(m, 0, RAT_CAMP.x - 3000, RAT_CAMP.y);
    dealDamage(m, 0, 0, Kind.Hero, RAT0, 10, 'basic');
    const hp0 = w.hp[0];
    steps(m, 90);
    expect(w.target[RAT0]).toBe(0);
    expect(w.target[RAT0 + 1]).toBe(0);
    expect(hp0 - w.hp[0]).toBeGreaterThanOrEqual(RAT_CAMP_STATS.dmg * 2);
  });

  it('past the 8 m leash a rat drops its target, walks home and heals to full', () => {
    const m = match();
    at(m, TIMELINE.campsUp);
    step(m);
    const w = m.world;
    place(m, 0, RAT_CAMP.x - 2000, RAT_CAMP.y);
    dealDamage(m, 0, 0, Kind.Hero, RAT0, 200, 'basic');
    step(m);
    // The hero walks away; the rat follows until the leash, then goes home.
    applyOrder(m, 0, { op: Op.Move, x: 6000, y: 30000 });
    steps(m, 300);
    expect(w.target[RAT0]).toBe(-1);
    expect(w.hp[RAT0]).toBe(RAT_CAMP_STATS.hp);
    expect(w.x[RAT0]).toBe(RAT_CAMP.x);
  });

  it('each rat gives 35 XP (70 for the camp) to the killer’s team within 10 m; the camp is back 60 s after it fell', () => {
    const m = match();
    at(m, TIMELINE.campsUp);
    step(m);
    const w = m.world;
    place(m, 0, RAT_CAMP.x - 3000, RAT_CAMP.y);
    place(m, 1, RAT_CAMP.x - 4000, RAT_CAMP.y);
    const xp0 = w.xp[0];
    for (const r of [RAT0, RAT0 + 1]) {
      w.hp[r] = 1;
      dealDamage(m, 0, 0, Kind.Hero, r, 100, 'basic');
    }
    resolveDeaths(m);
    // 35 a rat, split between the two heroes in range (integer share).
    const each = Math.trunc(RAT_CAMP_STATS.xpTotal / RAT_CAMP_STATS.rats / 2);
    expect(w.xp[0] - xp0).toBe(2 * each);
    expect(w.xp[1]).toBe(2 * each);
    const due = w.globals[G.CampAt0];
    expect(due).toBe(w.globals[G.Tick] + RAT_CAMP_STATS.respawn);
    at(m, due);
    step(m);
    expect(w.alive[RAT0]).toBe(1);
    expect(w.alive[RAT0 + 1]).toBe(1);
  });
});

describe('Pudding (§5)', () => {
  const spawn = (): MatchHandle => {
    const m = match();
    at(m, TIMELINE.pudding);
    step(m);
    return m;
  };

  it('spawns at 5:00 at the river, neutral, with a 5,000 calm meter', () => {
    const m = match();
    at(m, TIMELINE.pudding - 1);
    step(m);
    expect(m.world.alive[PUD]).toBe(0);
    step(m);
    const w = m.world;
    expect(w.alive[PUD]).toBe(1);
    expect(w.team[PUD]).toBe(TEAM_NEUTRAL);
    expect([w.x[PUD], w.y[PUD]]).toEqual([50000, 30000]);
    expect(w.hp[PUD]).toBe(PUDDING.calm);
    expect(w.globals[G.PudState]).toBe(PUD_STATE.Wild);
  });

  it('every 4 s a scared hop: 0.8 s telegraph, then units within 4 m are knocked back 1.5 m', () => {
    const m = spawn();
    const w = m.world;
    place(m, 0, 50000 - 3000 - RADIUS.hero, 30000);
    let telegraph = -1;
    for (let i = 0; i < PUDDING.hopEvery + 2 && telegraph < 0; i++) {
      step(m);
      for (const e of snapshot(m, 0).events) if (e.type === 'pudding' && e.what === 'hop') telegraph = e.tick;
    }
    expect(telegraph).toBe(TIMELINE.pudding + PUDDING.hopEvery);
    const x0 = w.x[0];
    steps(m, PUDDING.hopTelegraph - 1);
    expect(w.x[0]).toBe(x0);
    steps(m, 1 + 6);
    expect(x0 - w.x[0]).toBe(PUDDING.hopKnockback);
  });

  it('the team that lands the calming hit gets him: he joins its next wave in the lane with the most enemy towers', () => {
    const m = spawn();
    const w = m.world;
    // Woof lost its Sunny outer: Puddle has more Woof towers left.
    w.alive[towerId(1, 0)] = 0;
    w.hp[PUD] = 10;
    dealDamage(m, 0, 0, Kind.Hero, PUD, 100, 'basic');
    resolveDeaths(m);
    expect(w.globals[G.PudState]).toBe(PUD_STATE.Waiting);
    expect(w.globals[G.PudTeam]).toBe(0);
    expect(w.alive[PUD]).toBe(0);
    // Next wave tick.
    const next = TIMELINE.firstWave + Math.ceil((w.globals[G.Tick] - TIMELINE.firstWave) / TIMELINE.waveEvery) * TIMELINE.waveEvery;
    at(m, next);
    step(m);
    expect(w.globals[G.PudState]).toBe(PUD_STATE.Escort);
    expect(w.alive[PUD]).toBe(1);
    expect(w.team[PUD]).toBe(0);
    expect(w.hp[PUD]).toBe(PUDDING.escortHp);
    expect(w.lane[PUD]).toBe(1);
    expect(snapshot(m, 1).entities.find((e) => e.id === PUD)?.team).toBe(0);
  });

  it('the escort breathes on an enemy tower in 7 m every 2 s and leaves when his wave is gone', () => {
    const m = spawn();
    const w = m.world;
    w.hp[PUD] = 1;
    dealDamage(m, 0, 0, Kind.Hero, PUD, 100, 'basic');
    resolveDeaths(m);
    const next = TIMELINE.firstWave + Math.ceil((w.globals[G.Tick] - TIMELINE.firstWave) / TIMELINE.waveEvery) * TIMELINE.waveEvery;
    at(m, next);
    step(m);
    // Stand him next to Woof's Sunny outer with one of his wave's minions alive far away.
    const t = towerId(1, 0);
    w.x[PUD] = w.x[t] - 6000;
    w.y[PUD] = w.y[t];
    for (let id = RANGE.minions; id < RANGE.towers; id++) w.alive[id] = 0;
    const keep = putMinion(m, 0, 20000, 30000);
    w.wave[keep] = w.globals[G.PudWave];
    hold(m, keep);
    const hp = w.hp[t];
    steps(m, PUDDING.escortBreathEvery * 2);
    expect(hp - w.hp[t]).toBe(2 * Math.trunc((PUDDING.escortBreathDamage * 100) / (100 + w.armour[t])));
    w.alive[keep] = 0;
    step(m);
    expect(w.alive[PUD]).toBe(0);
    expect(w.globals[G.PudState]).toBe(PUD_STATE.Away);
    expect(w.globals[G.PudAt]).toBe(w.globals[G.Tick] - 1 + PUDDING.respawn);
  });

  it('the escort leaves once the enemy dealt him 3,000 damage', () => {
    expect(PUDDING.escortHp).toBe(PUDDING.escortLeaveDamage);
    const m = spawn();
    const w = m.world;
    w.hp[PUD] = 1;
    dealDamage(m, 3, 1, Kind.Hero, PUD, 100, 'basic');
    resolveDeaths(m);
    expect(w.globals[G.PudTeam]).toBe(1);
    const next = TIMELINE.firstWave + Math.ceil((w.globals[G.Tick] - TIMELINE.firstWave) / TIMELINE.waveEvery) * TIMELINE.waveEvery;
    at(m, next);
    step(m);
    expect(w.team[PUD]).toBe(1);
    dealDamage(m, 0, 0, Kind.Hero, PUD, 2999, 'basic', { pure: true });
    resolveDeaths(m);
    expect(w.alive[PUD]).toBe(1);
    dealDamage(m, 0, 0, Kind.Hero, PUD, 1, 'basic', { pure: true });
    resolveDeaths(m);
    expect(w.alive[PUD]).toBe(0);
    expect(w.globals[G.PudState]).toBe(PUD_STATE.Away);
  });
});
