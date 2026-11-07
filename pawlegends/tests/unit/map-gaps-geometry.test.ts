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
