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

  it('cuts the plaza ring under the rim torus so it never paints over the basin water', async () => {
    const { FOUNTAIN } = await import('../../src/data/map');
    const { PLAZA_HOLE } = await import('../../src/render/views/mapView');
    const rimInner = FOUNTAIN.radius / 1000 - 0.28;
    const rimOuter = FOUNTAIN.radius / 1000 + 0.28;
    // the hole edge hides under the torus: water (r <= 3.85) shows inside it, the plaza outside it
    expect(PLAZA_HOLE).toBeGreaterThanOrEqual(rimInner);
    expect(PLAZA_HOLE).toBeLessThan(rimOuter);
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
    const { PLAYFIELD } = await import('../../src/data/map');
    const rim = PLAYFIELD.rim / 1000;
    for (const b of bridgeParts()) {
      // the deck covers the walkable lane band (±5.7 m, inside the rim) and stops at the rim, where the log jam lies
      const lo = b.deckY - b.width / 2;
      const hi = b.deckY + b.width / 2;
      expect(lo).toBeLessThanOrEqual(Math.max(b.y - 5.7, rim));
      expect(hi).toBeGreaterThanOrEqual(Math.min(b.y + 5.7, H - rim));
      expect(lo).toBeGreaterThanOrEqual(rim);
      expect(hi).toBeLessThanOrEqual(H - rim);
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

describe('MAP-GAPS A17 structure clearance from the sim radius', () => {
  it('draws a hero hugging a tower or core within 0.6 m of its sim point', async () => {
    const { RADIUS } = await import('../../src/data/map');
    const { structureClearRadius } = await import('../../src/render/views/towerView');
    const { clearOfObstacles } = await import('../../src/render/views/heroView');
    for (const kind of ['tower', 'core'] as const) {
      const r = structureClearRadius(kind);
      expect(r).toBeCloseTo((kind === 'core' ? RADIUS.core : RADIUS.tower) / 1000 + 0.6, 6);
      // a hero as close as the sim lets it stand: footprint plus its own radius
      const d = (kind === 'core' ? RADIUS.core : RADIUS.tower) / 1000 + RADIUS.hero / 1000;
      for (const a of [0, 1, 2.5, 4]) {
        const o = clearOfObstacles(Math.cos(a) * d, Math.sin(a) * d, [{ x: 0, z: 0, r }]);
        expect(Math.hypot(o.x, o.z)).toBeLessThanOrEqual(0.6 + 1e-9);
      }
    }
  });
});

describe('MAP-GAPS A22 a natural hedge', () => {
  it('jitters the hedge, leaves gaps and mixes in rocks and flowers', async () => {
    const { hedgeSpots } = await import('../../src/render/views/mapView');
    const h = hedgeSpots();
    const main = h.filter((s) => s.r >= 0.2);
    const slots = 2 * (Math.floor(W / 1.6) + 1) + 2 * (Math.floor(H / 1.6) + 1);
    // gaps (~15%) plus the river and fountain cuts
    expect(main.length / slots).toBeLessThan(0.9);
    expect(main.length / slots).toBeGreaterThan(0.65);
    expect(h.some((s) => s.kind === 'rock')).toBe(true);
    expect(h.some((s) => s.kind === 'flower' && s.r < 0.2)).toBe(true);
    // off the straight line
    const south = main.filter((s) => s.y < 0.5 && s.x > 5 && s.x < 40);
    expect(new Set(south.map((s) => s.y.toFixed(2))).size).toBeGreaterThan(5);
    for (const s of south) expect(Math.abs(s.y + 0.8)).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('MAP-GAPS A23 shadow budget at max zoom', () => {
  it('sizes the shadow map per tier and widens the box past zoom 1.5 on Medium and High', async () => {
    const { tierSettings } = await import('../../src/render/quality');
    const { SHADOW_BOX, shadowHalfFor, shadowMaxFor } = await import('../../src/render/renderer');
    expect(tierSettings('high').shadowMap).toBe(2048);
    expect(tierSettings('med').shadowMap).toBe(1024);
    expect(tierSettings('low').shadowMap).toBe(1024);
    expect(shadowMaxFor(1.9, 'high')).toBe(54);
    expect(shadowMaxFor(1.9, 'med')).toBe(54);
    expect(shadowMaxFor(1.9, 'low')).toBe(SHADOW_BOX.max);
    expect(shadowMaxFor(1.03, 'high')).toBe(SHADOW_BOX.max);
    // the farthest visible ground corner at zoom 1.9 on 1440x900 is ~50 m from the box centre: inside the wide box
    expect(shadowHalfFor(50, shadowMaxFor(1.9, 'high'))).toBeGreaterThanOrEqual(50 + SHADOW_BOX.margin - SHADOW_BOX.step);
    expect(shadowHalfFor(50)).toBe(SHADOW_BOX.max);
  });
});

describe('MAP-GAPS A25 bodies drawn clear of static walls (cosmetic)', () => {
  it('pushes a body grazing a rock out of it, and leaves a body on open ground alone', async () => {
    const { layoutBodies, wallObstacles } = await import('../../src/render/views/heroView');
    // the jungle rock at x 16–18 m, y 26–34 m: a body 0.2 m inside its west face
    const inRock = { x: 16.2, z: -30 };
    const out = layoutBodies([inRock], wallObstacles([inRock]));
    expect(inRock.x + out[0].x).toBeLessThan(16);
    // open jungle at (30, 25): nothing to push
    const open = { x: 30.5, z: -25.5 };
    const o2 = layoutBodies([open], wallObstacles([open]));
    expect(Math.hypot(o2[0].x, o2[0].z)).toBe(0);
    // on the walkable cell next to the rock (centre 15.5): not pushed
    const next = { x: 15.5, z: -30.5 };
    const o3 = layoutBodies([next], wallObstacles([next]));
    expect(Math.hypot(o3[0].x, o3[0].z)).toBeLessThan(1e-9);
  });
});
