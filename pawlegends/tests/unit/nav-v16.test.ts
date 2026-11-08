/** Sim v16 MAP-GAPS B nav fixes (docs/plans/moba/MAP-GAPS.md B, V16.md §3.2). */
import { describe, expect, it } from 'vitest';
import { Op } from '../../src/sim/api';
import { step } from '../../src/sim/index';
import { clipTravel, startForced } from '../../src/sim/effects/dash';
import { FM, Order } from '../../src/sim/world';
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
