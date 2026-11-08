/** Sim v16 MAP-GAPS B nav fixes (docs/plans/moba/MAP-GAPS.md B, V16.md §3.2). */
import { describe, expect, it } from 'vitest';
import { Op } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, hash, playerBotCommands, result, step, tickOf } from '../../src/sim/index';
import { FOUNTAIN, MAP, RADIUS, mirrorX } from '../../src/data/map';
import { findPath } from '../../src/sim/nav/astar';
import { dist2 } from '../../src/sim/fixed';
import { TIMELINE } from '../../src/data/timeline';
import { clipTravel, startForced } from '../../src/sim/effects/dash';
import { clampTethers, startArena } from '../../src/sim/effects/tether';
import { FM, G, Order, RANGE } from '../../src/sim/world';
import { onPuddingDown } from '../../src/sim/units/pudding';
import { PUD_STATE } from '../../src/data/pudding';
import { cellOf, createGrid, escapeCell, NX, NY, walkable } from '../../src/sim/map/grid';
import { Rng } from '../../src/sim/rng';
import { applyOrder } from '../../src/sim/units/hero';
import { heroMatch, place } from './heroes/kit-helpers';

const onWalkable = (m: ReturnType<typeof heroMatch>, id: number): boolean => walkable(m.grid, cellOf(m.world.x[id], m.world.y[id]));

/** BFS steps from (x, y)'s cell to the nearest walkable cell (0 on a walkable cell). */
function depth(x: number, y: number): number {
  const g = createGrid();
  const c = cellOf(x, y);
  if (walkable(g, c)) return 0;
  const e = escapeCell(g, c);
  return Math.abs((e % NX) - (c % NX)) + Math.abs(Math.floor(e / NX) - Math.floor(c / NX));
}

describe('B1 forest soft-lock', { timeout: 120_000 }, () => {
  it('a hero deep in the forest at (8000, 51000) given a Move reaches the playfield within 5 s', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    place(m, 0, 8000, 51000);
    expect(onWalkable(m, 0)).toBe(false);
    applyOrder(m, 0, { op: Op.Move, x: 30000, y: 30000 });
    let t = 0;
    while (t < 150 && !onWalkable(m, 0)) {
      step(m);
      t++;
    }
    expect(onWalkable(m, 0)).toBe(true);
  });

  it('a hero placed in the far corner (2000, 56000) moves when given a Move', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    place(m, 0, 2000, 56000);
    applyOrder(m, 0, { op: Op.Move, x: 30000, y: 30000 });
    for (let t = 0; t < 30; t++) step(m);
    expect([m.world.x[0], m.world.y[0]]).not.toEqual([2000, 56000]);
  });

  it('escapeCell finds a walkable cell from anywhere on the grid', () => {
    const g = createGrid();
    for (let c = 0; c < NX * NY; c += 37) expect(walkable(g, escapeCell(g, c))).toBe(true);
  });

  it('500 seeded dashes from inside walls never end deeper: depth(end) <= depth(start)', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    const g = m.grid;
    const r = new Rng(1601);
    const out = new Int32Array(2);
    let n = 0;
    while (n < 500) {
      const x = r.range(1000, 99000);
      const y = r.range(1000, 59000);
      if (walkable(g, cellOf(x, y))) continue;
      place(m, 0, x, y);
      clipTravel(m, 0, r.range(0, 100000), r.range(0, 60000), out);
      expect(depth(out[0], out[1])).toBeLessThanOrEqual(depth(x, y));
      if (!(out[0] === x && out[1] === y)) expect(walkable(g, cellOf(out[0], out[1]))).toBe(true);
      n++;
    }
  });
});

describe('B3 order kept after a dash or knockback', { timeout: 120_000 }, () => {
  it('a Move given during a knockback keeps its goal after landing and walks on walkable cells home', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    const w = m.world;
    place(m, 1, 37100, 38900);
    startForced(w, 1, 35100, 38900, 6, FM.Knock);
    step(m);
    applyOrder(m, 1, { op: Op.Move, x: 3000, y: 30000 });
    for (let t = 0; t < 8; t++) step(m);
    expect(w.fmKind[1]).toBe(FM.None);
    expect([w.moveX[1], w.moveY[1]]).toEqual([3000, 30000]);
    expect(w.order[1]).toBe(Order.Move);
    let blocked = 0;
    for (let t = 0; t < 1500 && w.order[1] === Order.Move; t++) {
      step(m);
      if (!walkable(m.grid, cellOf(w.x[1], w.y[1]))) blocked++;
    }
    expect(blocked).toBe(0);
    expect(Math.abs(w.x[1] - 3000) + Math.abs(w.y[1] - 30000)).toBeLessThan(3000);
  });

  it('a Stop (no walk order) still lands with the goal at the landing point', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    const w = m.world;
    place(m, 1, 50000, 30000);
    startForced(w, 1, 48000, 30000, 4, FM.Knock);
    for (let t = 0; t < 5; t++) step(m);
    expect([w.moveX[1], w.moveY[1]]).toEqual([w.x[1], w.y[1]]);
  });
});

describe('B2 gate clamp', { timeout: 300_000 }, () => {
  const fresh = (seed = 3) => {
    const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
    return createMatch({ seed, picks, tricks, difficulty: 'normal' });
  };

  it('Move (37000, 51000) at t0: the hero is never on a blocked cell during ticks 0 to 200', () => {
    const m = fresh();
    step(m, [{ op: Op.Move, x: 37000, y: 51000 }]);
    for (let t = 1; t <= 200; t++) {
      expect(walkable(m.grid, cellOf(m.world.x[0], m.world.y[0]))).toBe(true);
      step(m);
    }
  });

  it('a pounce at t30 does not cross MAP.barrierX', () => {
    const m = fresh();
    for (let t = 0; t < 30; t++) step(m);
    step(m, [{ op: Op.Trick, x: 20000, y: 30000 }]);
    for (let t = 0; t < 40; t++) {
      if (tickOf(m) < TIMELINE.barrierDrop) expect(m.world.x[0]).toBeLessThanOrEqual(MAP.barrierX);
      step(m);
    }
  });

  it('24 bot seeds: no hero in the forest (a static wall cell) or inside a tower before t200', () => {
    // A path corner grazing a structure's footprint cell is MAP-GAPS B7 (v17), so only walls and tower bodies count.
    let bad = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const m = fresh(seed);
      const w = m.world;
      const bot = createPlayerBot(m, 'normal');
      for (let t = 0; t < 200; t++) {
        step(m, playerBotCommands(m, bot));
        for (let id = 0; id < 6; id++) {
          if (m.grid.walls[cellOf(w.x[id], w.y[id])] !== 0) bad++;
          for (let k = RANGE.towers; k < RANGE.cores; k++) if (dist2(w.x[id], w.y[id], w.x[k], w.y[k]) < RADIUS.tower * RADIUS.tower) bad++;
        }
      }
    }
    expect(bad).toBe(0);
  });
});

describe('B4 a Move onto a structure completes', { timeout: 300_000 }, () => {
  for (const [name, x, y] of [
    ['own core', 10000, 30000],
    ['own inner tower', 20000, 48000],
  ] as const) {
    it(`Move to the ${name} (${x}, ${y}) clears within 2 s of arriving next to it`, () => {
      const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
      const w = m.world;
      place(m, 1, 30000, 30000);
      applyOrder(m, 1, { op: Op.Move, x, y });
      let t = 0;
      for (; t < 900 && w.order[1] === Order.Move; t++) step(m);
      expect(w.order[1]).toBe(Order.None);
      expect(Math.abs(w.x[1] - x) + Math.abs(w.y[1] - y)).toBeLessThan(5000);
      expect(w.pathDone[1]).toBe(1);
    });
  }

  it('pathDone is hashed', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    const before = hash(m);
    m.world.pathDone[2] = 1;
    expect(hash(m)).not.toBe(before);
  });

  it('bot matches: no hero stands Moving (not walking) for more than 90 ticks', () => {
    let worst = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
      const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
      const bot = createPlayerBot(m, 'normal');
      const still = new Int32Array(6);
      const px = new Int32Array(6);
      const py = new Int32Array(6);
      while (!result(m) && tickOf(m) < 9000) {
        step(m, playerBotCommands(m, bot));
        for (let id = 0; id < 6; id++) {
          const moving = m.world.order[id] === Order.Move && m.world.alive[id] === 1 && m.world.fmKind[id] === FM.None && m.world.rootT[id] === 0 && m.world.stunT[id] === 0;
          still[id] = moving && m.world.x[id] === px[id] && m.world.y[id] === py[id] ? still[id] + 1 : 0;
          worst = Math.max(worst, still[id]);
          px[id] = m.world.x[id];
          py[id] = m.world.y[id];
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(90);
  });
});

describe('B15 the enemy fountain is in each team’s nav layer', { timeout: 120_000 }, () => {
  const inFountain = (x: number, y: number, fx: number): boolean => dist2(x, y, fx, FOUNTAIN.y) <= (FOUNTAIN.radius + RADIUS.hero) ** 2;
  for (const [team, id, sx, ex] of [
    [0, 1, 90500, 96500],
    [1, 4, 9500, 3500],
  ] as const) {
    it(`team ${team}: a Move across the enemy fountain (${sx}, 24500) → (${ex}, 35500) routes round it and arrives`, () => {
      const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
      const w = m.world;
      const fx = team === 0 ? mirrorX(FOUNTAIN.x) : FOUNTAIN.x;
      place(m, id, sx, 24500);
      applyOrder(m, id, { op: Op.Move, x: ex, y: 35500 });
      let inside = 0;
      let t = 0;
      for (; t < 600 && w.order[id] === Order.Move; t++) {
        step(m);
        if (inFountain(w.x[id], w.y[id], fx)) inside++;
      }
      expect(inside).toBe(0);
      expect(w.order[id]).toBe(Order.None);
      expect(Math.abs(w.x[id] - ex) + Math.abs(w.y[id] - 35500)).toBeLessThan(1000);
    });
  }

  it('the layers mirror each other and a path without a team ignores them', () => {
    const g = createGrid();
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) expect(g.foe![0][j * NX + i]).toBe(g.foe![1][j * NX + (NX - 1 - i)]);
    const xs = new Int32Array(16);
    const ys = new Int32Array(16);
    expect(findPath(g, 90500, 24500, 96500, 35500, xs, ys, 0).count).toBe(1);
    expect(findPath(g, 90500, 24500, 96500, 35500, xs, ys, 0, 0).count).toBeGreaterThan(1);
  });
});

describe('B13 Pudding escort lane', () => {
  const calmed = (seed: number, hurt?: (m: ReturnType<typeof createMatch>) => void) => {
    const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
    const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
    const w = m.world;
    w.globals[G.PudState] = PUD_STATE.Wild;
    w.globals[G.PudLane] = 7;
    w.alive[RANGE.pudding] = 1;
    w.lastHitBy[RANGE.pudding] = 0;
    hurt?.(m);
    onPuddingDown(m);
    return w.globals;
  };

  it('is chosen on the calm tick', () => {
    const g = calmed(1);
    expect(g[G.PudState]).toBe(PUD_STATE.Waiting);
    expect([0, 1]).toContain(g[G.PudLane]);
  });

  it('with equal towers it varies across seeds (a fork of the seed, not always Sunny)', () => {
    const lanes = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) lanes.add(calmed(seed)[G.PudLane]);
    expect([...lanes].sort()).toEqual([0, 1]);
  });

  it('with an HP difference the lane whose outermost enemy tower has less HP is chosen', () => {
    for (let seed = 1; seed <= 8; seed++) {
      expect(calmed(seed, (m) => (m.world.hp[RANGE.towers + 4 + 2] -= 100))[G.PudLane]).toBe(1);
      expect(calmed(seed, (m) => (m.world.hp[RANGE.towers + 4 + 0] -= 100))[G.PudLane]).toBe(0);
    }
  });
});

describe('B6 Pack Hunt hops and tether clamps respect walls', { timeout: 120_000 }, () => {
  it('a hunt toward a victim behind the rock [24-30 x 37-41] stops at the rock face', () => {
    const m = heroMatch(['cacklejaw', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    const w = m.world;
    place(m, 0, 27000, 35500);
    place(m, 3, 27000, 43500);
    startForced(w, 0, w.x[3], w.y[3], 90, FM.Hunt);
    w.fmTarget[0] = 3;
    w.kHuntT[0] = 90;
    w.revealT[3] = 200;
    for (let t = 0; t < 60 && w.fmKind[0] === FM.Hunt; t++) {
      step(m);
      expect(walkable(m.grid, cellOf(w.x[0], w.y[0]))).toBe(true);
    }
    expect(w.fmKind[0]).toBe(FM.None);
    expect(w.y[0]).toBeLessThan(37000);
  });

  it('a tether clamp next to a core never lands on a blocked cell', () => {
    const m = heroMatch(['brutus', 'sage', 'gabe', 'clem', 'chili', 'rocket']);
    const w = m.world;
    place(m, 0, 13000, 30000);
    place(m, 3, 13500, 30000);
    const z = startArena(w, 0, 3, 4000, 300);
    expect(z).toBeGreaterThanOrEqual(0);
    w.x[3] = 6000;
    w.y[3] = 30000;
    clampTethers(m);
    expect(walkable(m.grid, cellOf(w.x[3], w.y[3]))).toBe(true);
    expect(dist2(w.x[3], w.y[3], 13000, 30000)).toBeLessThanOrEqual(4000 * 4000);
  });
});
