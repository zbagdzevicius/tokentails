import { describe, expect, it } from 'vitest';
import { NAV, WALLS } from '../../src/data/map';
import { NX, NY, cellOf, coverDisc, createGrid, lineClear, snapCell } from '../../src/sim/map/grid';
import { LANE_PATHS } from '../../src/sim/map/lanes';
import { findPath } from '../../src/sim/nav/astar';

const run = (sx: number, sy: number, tx: number, ty: number, grid = createGrid()) => {
  const xs = new Int32Array(NAV.maxPathPoints);
  const ys = new Int32Array(NAV.maxPathPoints);
  const r = findPath(grid, sx, sy, tx, ty, xs, ys, 0);
  return { ...r, pts: Array.from({ length: r.count }, (_, i) => [xs[i], ys[i]]) };
};

describe('nav grid + integer A* (§5)', () => {
  it('is 100 × 60 one-metre cells with mirrored walls', () => {
    expect(NX).toBe(100);
    expect(NY).toBe(60);
    const g = createGrid();
    const [x0, y0] = WALLS[0];
    expect(g.walls[cellOf(x0 + 1000, y0 + 1000)]).toBe(1);
    expect(g.walls[cellOf(100000 - x0 - 1000, y0 + 1000)]).toBe(1);
  });
  it('no lane point and no lane segment crosses a wall', () => {
    const g = createGrid();
    for (const team of LANE_PATHS) {
      for (const p of team) {
        for (let i = 0; i + 1 < p.length; i++) expect(lineClear(g, p.x[i], p.y[i], p.x[i + 1], p.y[i + 1])).toBe(true);
      }
    }
  });
  it('a clear line is one point; a wall in the way gives a detour that never crosses a blocked cell', () => {
    const g = createGrid();
    expect(run(30000, 45000, 45000, 50000).pts).toEqual([[45000, 50000]]);
    // Through the rock at x 24..30, y 37..41.
    const r = run(27000, 34000, 27000, 44000, g);
    expect(r.complete).toBe(true);
    expect(r.count).toBeGreaterThan(1);
    let [px, py] = [27000, 34000];
    for (const [x, y] of r.pts) {
      expect(lineClear(g, px, py, x, y)).toBe(true);
      [px, py] = [x, y];
    }
    expect([px, py]).toEqual([27000, 44000]);
  });
  it('a blocked goal snaps to the nearest walkable cell (not complete)', () => {
    const g = createGrid();
    const r = run(20000, 30000, 27000, 39000, g); // inside the rock
    expect(r.complete).toBe(false);
    const [x, y] = r.pts[r.count - 1];
    expect(g.blocked[cellOf(x, y)]).toBe(0);
    expect(snapCell(g, cellOf(27000, 39000))).toBeGreaterThanOrEqual(0);
  });
  it('is deterministic, and structures block until removed', () => {
    const g = createGrid();
    const a = run(1000, 1000, 99000, 59000, g);
    const b = run(1000, 1000, 99000, 59000, g);
    expect(a).toEqual(b);
    coverDisc(g, 50000, 30000, 3000, 1);
    expect(g.blocked[cellOf(50000, 30000)]).toBe(1);
    coverDisc(g, 50000, 30000, 3000, -1);
    expect(g.blocked[cellOf(50000, 30000)]).toBe(0);
  });
});
