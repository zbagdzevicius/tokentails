/**
 * MAP-GAPS A12-A17, A22, A23, A25 (render only): the dressed ground, fountains, river edges, bridges, structure
 * clearance and the shadow box.
 */
import { describe, expect, it } from 'vitest';
import { MAP } from '../../src/data/map';
import { OUTER_DRESS, outerTrees, outsideBy } from '../../src/render/views/mapView';

const W = MAP.width / 1000;
const H = MAP.height / 1000;

describe('MAP-GAPS A12 outer forest to the camera reach', () => {
  const trees = outerTrees();
  it('stays off the near band and inside the dressed band', () => {
    for (const t of trees) {
      expect(outsideBy(t.x, t.y)).toBeGreaterThanOrEqual(t.y < 0 ? OUTER_DRESS.nearSouth : OUTER_DRESS.near);
      expect(t.x).toBeGreaterThanOrEqual(-OUTER_DRESS.west - 1.2);
      expect(t.x).toBeLessThanOrEqual(W + OUTER_DRESS.east + 1.2);
      expect(t.y).toBeGreaterThanOrEqual(-OUTER_DRESS.south - 1.2);
      expect(t.y).toBeLessThanOrEqual(H + OUTER_DRESS.north + 1.2);
    }
  });
  it('dresses all four sides and the four corner squares, out to the edge', () => {
    const boxes: [number, number, number, number][] = [
      [-OUTER_DRESS.west, -OUTER_DRESS.south, -20, -20], // SW corner
      [W + 20, -OUTER_DRESS.south, W + OUTER_DRESS.east, -20], // SE
      [-OUTER_DRESS.west, H + 20, -20, H + OUTER_DRESS.north], // NW
      [W + 20, H + 20, W + OUTER_DRESS.east, H + OUTER_DRESS.north], // NE
      [-OUTER_DRESS.west, 10, -30, 50], // W far
      [W + 30, 10, W + OUTER_DRESS.east, 50], // E far
      [10, H + 25, 40, H + OUTER_DRESS.north], // N far
      [10, -OUTER_DRESS.south, 40, -18], // S far
    ];
    for (const [x0, y0, x1, y1] of boxes) {
      const n = trees.filter((t) => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1).length;
      const area = (x1 - x0) * (y1 - y0);
      expect(n, `${x0},${y0}`).toBeGreaterThan(area / 40);
    }
  });
  it('keeps about half for the Low tier', () => {
    const low = trees.filter((t) => t.low).length;
    expect(low / trees.length).toBeGreaterThan(0.4);
    expect(low / trees.length).toBeLessThan(0.6);
  });
});

describe('MAP-GAPS A13 fountains clear of the hedge', () => {
  it('keeps every hedge sphere off the fountain rim torus, and walls the basin behind instead', async () => {
    const { FOUNTAIN } = await import('../../src/data/map');
    const { hedgeSpots, fountainWall, FOUNTAIN_CLEAR } = await import('../../src/render/views/mapView');
    const rimOuter = FOUNTAIN.radius / 1000 + 0.28;
    for (const fx of [FOUNTAIN.x / 1000, W - FOUNTAIN.x / 1000]) {
      for (const h of hedgeSpots()) expect(Math.hypot(h.x - fx, h.y - FOUNTAIN.y / 1000) - h.r).toBeGreaterThan(rimOuter);
      const wall = fountainWall().filter((s) => Math.abs(s.x - fx) < 10);
      expect(wall.length).toBeGreaterThan(10);
      for (const s of wall) expect(Math.hypot(s.x - fx, s.y - FOUNTAIN.y / 1000) - s.r).toBeGreaterThan(rimOuter);
    }
    expect(FOUNTAIN_CLEAR).toBeGreaterThan(rimOuter);
  });
});

describe('MAP-GAPS A15 river past the map edge', () => {
  it('marks the boundary across the river at each rim crossing, and the forest closes over it further out', async () => {
    const { PLAYFIELD } = await import('../../src/data/map');
    const { riverMarkers, RIVER_RUN } = await import('../../src/render/views/mapView');
    const ys = riverMarkers().map((m) => m.y).sort((a, b) => a - b);
    expect(ys).toEqual([PLAYFIELD.rim / 1000, H - PLAYFIELD.rim / 1000]);
    const r0 = MAP.riverX[0] / 1000;
    const r1 = MAP.riverX[1] / 1000;
    const over = outerTrees().filter((t) => t.x > r0 && t.x < r1);
    expect(over.some((t) => t.y > H + 10)).toBe(true);
    expect(over.some((t) => t.y < -10)).toBe(true);
    for (const t of over) expect(outsideBy(t.x, t.y)).toBeGreaterThanOrEqual(RIVER_RUN * 0.75);
  });
});

describe('MAP-GAPS A16 bridges and minion push-out', () => {
  it('decks the whole walkable lane band, flush with the water, with nothing standing in the river', async () => {
    const { bridgeParts, BRIDGE_HALF } = await import('../../src/render/views/mapView');
    const { NX, createGrid } = await import('../../src/sim/map/grid');
    const g = createGrid();
    const r0 = MAP.riverX[0] / 1000;
    const r1 = MAP.riverX[1] / 1000;
    for (const b of bridgeParts()) {
      expect(b.width).toBeGreaterThanOrEqual(11.4);
      expect(b.top).toBeLessThanOrEqual(0.015);
      expect(BRIDGE_HALF).toBeGreaterThanOrEqual(5.7);
      for (const p of b.posts) {
        expect(p.x < r0 - 1 || p.x > r1 + 1).toBe(true);
        // no post on a walkable cell of the lane band
        const c = Math.floor(p.y) * NX + Math.floor(p.x);
        if (Math.abs(p.y - b.y) <= 5.5) expect(g.walls[c]).toBe(1);
      }
    }
  });
  it('pushes a minion near a tower centre out the same way for a ±1 mm offset', async () => {
    const { pushOutDir } = await import('../../src/render/views/minionInstances');
    for (const [bx, bz] of [
      [34, -51],
      [20, -48],
      [34, -9],
      [66, -51],
    ]) {
      for (const [ox, oz] of [
        [0.001, 0],
        [-0.001, 0],
        [0, 0.001],
        [0, -0.001],
        [0, 0],
      ]) {
        const a = pushOutDir(bx + ox, bz + oz, bx, bz, 1.2);
        const ref = pushOutDir(bx, bz, bx, bz, 1.2);
        expect(a.x * ref.x + a.z * ref.z).toBeGreaterThan(0.99);
        // toward the lane's outside: away from the map middle
        expect((bx - 50) * a.x + (bz + 30) * a.z).toBeGreaterThan(0);
      }
    }
    // far from the centre it is the plain radial push
    const r = pushOutDir(36, -51, 34, -51, 1.2);
    expect(r.x).toBeCloseTo(1, 5);
  });
});
