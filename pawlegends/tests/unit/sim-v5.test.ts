/**
 * Sim v5 (playtest round 0): the playfield boundary, the carry-ally leash, Rookie's core floor, Sunset core damage
 * that scales with how open the core is, the last-hit XP bonus, and species teams.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES } from '../../src/data/bots';
import { FOUNTAIN, HERO_SPAWNS, LANE_WAYPOINTS, MAP, NAV, PUDDING_SPOT, RAT_CAMP, TOWER_SPOTS } from '../../src/data/map';
import { SUNSET } from '../../src/data/timeline';
import { MINIONS } from '../../src/data/minions';
import { XP } from '../../src/data/xp';
import { reachableGoal } from '../../src/input/orders';
import { Op } from '../../src/sim/api';
import { dealDamage, resolveDeaths } from '../../src/sim/combat/damage';
import { applyBp } from '../../src/sim/fixed';
import { step } from '../../src/sim/index';
import { NX, NY, cellOf, centreX, centreY, createGrid, onPlayfield, snapCell, walkable } from '../../src/sim/map/grid';
import { findPath } from '../../src/sim/nav/astar';
import { applyOrder } from '../../src/sim/units/hero';
import { G, Kind } from '../../src/sim/world';
import { coreId, putHero, putMinion, quietMatch, towerId } from './sim-helpers';

describe('sim v5 playfield', () => {
  const g = createGrid();
  it('blocks the outer rim and the corners outside the lane loop; spawns, lanes and objectives stay walkable', () => {
    for (let i = 0; i < NX; i++) {
      expect(g.walls[cellOf(i * 1000 + 500, 500)]).toBe(1);
      expect(g.walls[cellOf(i * 1000 + 500, MAP.height - 500)]).toBe(1);
    }
    for (let j = 0; j < NY; j++) {
      expect(g.walls[cellOf(500, j * 1000 + 500)]).toBe(1);
      expect(g.walls[cellOf(MAP.width - 500, j * 1000 + 500)]).toBe(1);
    }
    for (const [x, y] of [[3000, 3000], [97000, 3000], [3000, 57000], [97000, 57000], [99250, 23250], [50000, 1000]]) expect(onPlayfield(x, y)).toBe(false);
    const open = [
      ...HERO_SPAWNS.map((s) => [s.x, s.y]),
      [FOUNTAIN.x + 2000, FOUNTAIN.y],
      [RAT_CAMP.x, RAT_CAMP.y],
      [PUDDING_SPOT.x, PUDDING_SPOT.y],
      ...TOWER_SPOTS.map((t) => [t.x, t.y]),
      ...LANE_WAYPOINTS.sunny,
      ...LANE_WAYPOINTS.puddle,
    ];
    for (const [x, y] of open) {
      expect(onPlayfield(x, y)).toBe(true);
      expect(onPlayfield(MAP.width - x, y)).toBe(true);
    }
  });

  it('a move toward any border cell ends on walkable ground (input side) and A* never ends in the forest', () => {
    const xs = new Int32Array(NAV.maxPathPoints);
    const ys = new Int32Array(NAV.maxPathPoints);
    const from = HERO_SPAWNS[1];
    for (let c = 0; c < NX * NY; c++) {
      const i = c % NX;
      const j = (c / NX) | 0;
      if (i !== 0 && j !== 0 && i !== NX - 1 && j !== NY - 1 && i % 7 !== 0) continue;
      const goal = reachableGoal(from.x, from.y, centreX(c), centreY(c));
      const snapped = snapCell(g, cellOf(goal.x, goal.y));
      expect(snapped).toBeGreaterThanOrEqual(0);
      const r = findPath(g, from.x, from.y, goal.x, goal.y, xs, ys, 0);
      expect(r.count).toBeGreaterThan(0);
      expect(walkable(g, cellOf(xs[r.count - 1], ys[r.count - 1]))).toBe(true);
    }
  });
});

describe('sim v5 carry leash', () => {
  it('Rookie and Easy allies stop following a human parked off the lanes', () => {
    for (const difficulty of ['rookie', 'easy'] as const) {
      const m = quietMatch(4, true, difficulty);
      const w = m.world;
      let near = 0;
      let n = 0;
      while (w.globals[G.Tick] < 2700) {
        if (w.globals[G.Tick] === 300) applyOrder(m, 0, { op: Op.Move, x: 40000, y: 40000 });
        step(m);
        if (w.globals[G.Tick] > 1500 && w.alive[0] === 1) {
          n++;
          let k = 0;
          for (const a of [1, 2]) if (w.alive[a] === 1 && (w.x[a] - w.x[0]) ** 2 + (w.y[a] - w.y[0]) ** 2 <= 7000 * 7000) k++;
          if (k === 2) near++;
        }
      }
      expect(n).toBeGreaterThan(0);
      expect(near / n).toBeLessThan(0.1);
    }
  });
});

describe('sim v5 Rookie core floor and Sunset', () => {
  it("Rookie: the human's core keeps 15% before 6:00, then can fall", () => {
    const m = quietMatch(1, false, 'rookie');
    const w = m.world;
    const core = coreId(0);
    expect(DIFFICULTY_RULES.rookie.humanCoreOpenAt).toBe(10800);
    w.globals[G.Tick] = 5000;
    dealDamage(m, -1, 1, Kind.None, core, w.maxHp[core] * 2, 'zone', { pure: true, pierce: true });
    expect(w.hp[core]).toBe(applyBp(w.maxHp[core], DIFFICULTY_RULES.rookie.humanCoreFloorBp));
    w.globals[G.Tick] = 10800;
    dealDamage(m, -1, 1, Kind.None, core, w.maxHp[core] * 2, 'zone', { pure: true, pierce: true });
    expect(w.hp[core]).toBeLessThanOrEqual(0);
  });

  it('Sunset takedowns: 5% to a closed core, 15% once an inner tower of that side is down', () => {
    const m = quietMatch(1, false, 'easy');
    const w = m.world;
    const core = coreId(1);
    w.globals[G.Tick] = w.globals[G.Sunset] + 30;
    const full = w.hp[core];
    w.hp[3] = 0;
    resolveDeaths(m);
    expect(full - w.hp[core]).toBe(applyBp(w.maxHp[core], SUNSET.closedCoreBp));
    const inner = towerId(1, 1);
    w.hp[inner] = 0;
    resolveDeaths(m);
    const before = w.hp[core];
    w.hp[4] = 0;
    resolveDeaths(m);
    expect(before - w.hp[core]).toBe(applyBp(w.maxHp[core], SUNSET.takedownCoreBp));
  });
});

describe('sim v5 last-hit XP', () => {
  it('the hero who last-hits a minion gets XP.lastHitBp of its XP on top of its share', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    putHero(m, 0, 40000, 30000);
    putHero(m, 1, 41000, 30000);
    const id = putMinion(m, 1, 40500, 30000);
    const xp0 = w.xp[0];
    const xp1 = w.xp[1];
    dealDamage(m, 0, 0, Kind.Hero, id, 100000, 'basic', { pure: true });
    resolveDeaths(m);
    const gained0 = w.xp[0] - xp0;
    const gained1 = w.xp[1] - xp1;
    expect(gained0 - gained1).toBe(applyBp(MINIONS.melee.xp, XP.lastHitBp));
  });
});
