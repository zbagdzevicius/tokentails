/**
 * MAP-GAPS A1 (render only): the 8 jungle walls are drawn exactly where the nav grid blocks them, the painted
 * footpaths never run under a rock, and the camp pebbles stay low and off the paths.
 */
import { describe, expect, it } from 'vitest';
import { MAP, RAT_CAMP } from '../../src/data/map';
import { NX, NY, createGrid, onPlayfield } from '../../src/sim/map/grid';
import { campPebbles, footpaths, wallClusters, wallRocks } from '../../src/render/views/mapView';

const grid = createGrid();
const blockedOnPlayfield: number[] = [];
for (let c = 0; c < NX * NY; c++) {
  const x = (c % NX) * MAP.navCell + 500;
  const y = Math.floor(c / NX) * MAP.navCell + 500;
  if (grid.walls[c] && onPlayfield(x, y)) blockedOnPlayfield.push(c);
}

describe('MAP-GAPS A1 jungle walls', () => {
  it('finds the 4 WALLS rects and their mirrors as 8 clusters', () => {
    expect(wallClusters()).toHaveLength(8);
    const all = wallClusters().flatMap((c) => c.cells).sort((a, b) => a - b);
    expect(all).toEqual(blockedOnPlayfield);
  });

  it('covers every blocked playfield cell with a rock footprint', () => {
    const rocks = wallRocks();
    for (const c of blockedOnPlayfield) {
      const x = (c % NX) + 0.5;
      const y = Math.floor(c / NX) + 0.5;
      expect(rocks.some((k) => Math.hypot(k.x - x, k.y - y) <= k.r)).toBe(true);
    }
    for (const k of rocks) {
      expect(k.h).toBeGreaterThanOrEqual(0.8);
      expect(k.h).toBeLessThanOrEqual(1.6);
    }
  });

  it('keeps every footpath sample off the blocked cells', () => {
    for (const pl of footpaths()) {
      for (let i = 0; i + 1 < pl.length; i++) {
        const [ax, ay] = pl[i];
        const [bx, by] = pl[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25);
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const y = ay + ((by - ay) * k) / n;
          expect(grid.walls[Math.floor(y) * NX + Math.floor(x)], `${x.toFixed(2)},${y.toFixed(2)}`).toBe(0);
        }
      }
    }
  });

  it('places low camp pebbles outside the clearing (the old loop placed none)', () => {
    const p = campPebbles();
    expect(p.length).toBeGreaterThan(10);
    for (const k of p) {
      expect(k.h).toBeLessThan(0.25);
      const cx = k.x < MAP.width / 2000 ? RAT_CAMP.x / 1000 : (MAP.width - RAT_CAMP.x) / 1000;
      expect(Math.hypot(k.x - cx, k.y - RAT_CAMP.y / 1000)).toBeGreaterThan(5.5);
    }
  });
});
