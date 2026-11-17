/**
 * Raised ground (render only, render/views/raisedGround.ts) on all six maps: every blocked nav cell is under a raised
 * cap (but the river and the fountain plazas, kept low), no walkable cell is raised but in a corner triangle where a
 * cliff turns, the block's
 * geometry stays small, and the Catnip Bushes stay lower than the block. Also the per-map daytime light presets
 * (render/daylight.ts): every map has one, within the readability bounds, and the shift follows the match clock.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { MAP_IDS } from '../../src/sim/api';
import { bindMap, mapIndex } from '../../src/sim/map/runtime';
import { NX, NY, createGrid } from '../../src/sim/map/grid';
import { mapInfo } from '../../src/sim/map/info';
import { FOUNTAIN, MAP } from '../../src/data/map';
import { BUSH_SQUASH, FOUNTAIN_LOW, RAISE_PAD, mapRaise } from '../../src/render/views/mapView';
import { hwRaise } from '../../src/render/views/hearthwoodView';
import { RAISE, buildRaise, groundAt, raisedAt, sampleRaised, type RaiseGrid } from '../../src/render/views/raisedGround';
import { BASE_DAY, DAYLIGHT, PLAY_SHARE, SUNSET_TICKS, dayLightAt, dayPreset, dayShift } from '../../src/render/daylight';

const COLORS = { cap: 0x88aa77, rim: 0xccddaa, side: 0x667744, foot: 0x444433 };

function gridFor(id: string): { g: RaiseGrid; walls: Uint8Array; nx: number; ny: number } {
  bindMap(mapIndex(id as (typeof MAP_IDS)[number]));
  const walls = createGrid().walls;
  const g = id === 'hearthwood' ? hwRaise(mapInfo('hearthwood')) : mapRaise();
  return { g, walls, nx: NX, ny: NY };
}

afterAll(() => bindMap(mapIndex('crossing')));

describe('raised ground covers exactly the blocked cells', () => {
  for (const id of MAP_IDS) {
    it(`${id}: blocked cells raised, walkable cells never`, () => {
      const { g, walls, nx, ny } = gridFor(id);
      let blocked = 0;
      const info = mapInfo(id as (typeof MAP_IDS)[number]);
      const rim = id === 'hearthwood' ? 2.5 : 2;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          if (walls[c] === 1) {
            if (!sampleRaised(g, i, j)) {
              // only rim cells in the river and the cells round a fountain stay low (no jungle wall, no pit wall)
              const x = i + 0.5;
              const y = j + 0.5;
              const nearFountain = info.fountains.some((f) => Math.hypot(x - f.x / 1000, y - f.y / 1000) < f.radius / 1000 + 2.4);
              const onRim = x <= rim || y <= rim || x >= nx - rim || y >= ny - rim;
              expect(nearFountain || onRim, `${id} low blocked cell ${i},${j}`).toBe(true);
              continue;
            }
            blocked++;
            expect(raisedAt(g, i + 0.5, j + 0.5), `${id} blocked cell ${i},${j}`).toBe(true);
          } else {
            // a walkable cell: its centre and its middle never raised; at most a corner triangle (1/8) where a cliff
            // turns, measured on a 9 × 9 grid of points
            expect(raisedAt(g, i + 0.5, j + 0.5), `${id} walkable cell ${i},${j}`).toBe(false);
            let hit = 0;
            for (let a = 0; a < 9; a++)
              for (let b = 0; b < 9; b++) {
                const u = 0.01 + (a / 8) * 0.98;
                const v = 0.01 + (b / 8) * 0.98;
                if (!raisedAt(g, i + u, j + v)) continue;
                hit++;
                // only in a corner: the L1 distance to the nearest corner is under half a cell
                expect(Math.min(u, 1 - u) + Math.min(v, 1 - v), `${id} walkable cell ${i},${j} at ${u.toFixed(2)},${v.toFixed(2)}`).toBeLessThan(0.5 + 1e-9);
              }
            expect(hit / 81, `${id} walkable cell ${i},${j}`).toBeLessThan(0.3);
          }
        }
      }
      expect(blocked).toBeGreaterThan(nx * 4);
      // past the map edge everything is raised (the river and the fountain plazas aside), out to the pad
      expect(raisedAt(g, -RAISE_PAD + 2, -RAISE_PAD + 2)).toBe(true);
      expect(raisedAt(g, nx + RAISE_PAD - 3, ny / 2 + 15)).toBe(true);
      expect(groundAt(g, -10, ny / 2 + 15)).toBe(RAISE.h);
    });
  }

  it('the river with its banks and the fountain plazas stay at ground level', () => {
    const { g } = gridFor('crossing');
    const rx = (MAP.riverX[0] + MAP.riverX[1]) / 2000;
    for (const y of [-12, -1, 0.5, 1.5, 59.5, 61, 72]) expect(raisedAt(g, rx, y), `river at y ${y}`).toBe(false);
    const fx = FOUNTAIN.x / 1000;
    const fy = FOUNTAIN.y / 1000;
    for (const [x, y] of [
      [fx - 3.9, fy],
      [fx - FOUNTAIN.radius / 1000 - 1.6, fy],
      [100 - fx + FOUNTAIN.radius / 1000 + 1.6, fy],
    ])
      expect(raisedAt(g, x, y), `fountain plaza at ${x},${y}`).toBe(false);
    expect(FOUNTAIN_LOW).toBeGreaterThan(FOUNTAIN.radius / 1000 + 1.6);
    const h = gridFor('hearthwood').g;
    // Hearthwood's river runs out past both far corners at ground level
    expect(raisedAt(h, -4, 128 + 4)).toBe(false);
    expect(raisedAt(h, 128 + 4, -4)).toBe(false);
  });

  for (const id of MAP_IDS) {
    it(`${id}: the block's geometry stays small (caps + sides)`, () => {
      const { g } = gridFor(id);
      const geo = buildRaise(g, COLORS);
      const tris = (geo.caps.getAttribute('position').count + geo.sides.getAttribute('position').count) / 3;
      expect(geo.segments).toBeGreaterThan(100);
      // a phone-sized budget: the forest's merged mesh alone is ~39k triangles
      expect(tris).toBeLessThan(id === 'hearthwood' ? 26_000 : 16_000);
      // the caps sit at RAISE.h, the sides span 0 … RAISE.h
      const cy = geo.caps.getAttribute('position');
      for (let k = 0; k < cy.count; k += 97) expect(cy.getY(k)).toBeCloseTo(RAISE.h, 5);
      const sy = geo.sides.getAttribute('position');
      for (let k = 0; k < sy.count; k += 89) expect([0, RAISE.h].some((v) => Math.abs(sy.getY(k) - v) < 1e-5)).toBe(true);
      geo.caps.dispose();
      geo.sides.dispose();
    });
  }

  it('a Catnip Bush stays lower than the block (its tallest leaf top)', () => {
    // mapView / hearthwoodView: leaf centre ≤ 0.30 m, radius ≤ 1.15 m squashed by BUSH_SQUASH
    expect(0.3 + 1.15 * BUSH_SQUASH).toBeLessThanOrEqual(RAISE.h + 0.05);
  });
});

describe('daytime light presets', () => {
  it('every map has its own preset within the readability bounds', () => {
    for (const id of MAP_IDS) {
      const p = DAYLIGHT[id];
      expect(p, id).toBeDefined();
      for (const k of [p.day, p.dusk]) {
        expect(k.sunI / BASE_DAY.sunI).toBeGreaterThan(0.85);
        expect(k.sunI / BASE_DAY.sunI).toBeLessThan(1.15);
        expect(k.hemiI / BASE_DAY.hemiI).toBeGreaterThan(0.85);
        expect(k.hemiI / BASE_DAY.hemiI).toBeLessThan(1.15);
        expect(k.elev).toBeGreaterThanOrEqual(30);
        expect(k.elev).toBeLessThanOrEqual(70);
        expect(Math.abs(k.turn)).toBeLessThanOrEqual(35);
        // the sky stays light (luma > 0.75, the low sun > 0.68): no map is dark enough to hide a telegraph
        const l = (h: number): number => (0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255)) / 255;
        expect(l(k.sky)).toBeGreaterThan(0.75);
        expect(l(k.sun)).toBeGreaterThan(0.68);
      }
    }
    // the maps differ (no two share their day key)
    const keys = new Set(MAP_IDS.map((id) => JSON.stringify(DAYLIGHT[id].day)));
    expect(keys.size).toBe(MAP_IDS.length);
    expect(dayPreset('nowhere').day).toBe(BASE_DAY);
  });

  it('the light holds through the gate, shifts in late play, and finishes over Sunset', () => {
    expect(dayShift({ tick: 50, phase: 'gate', nextPhaseIn: 40 })).toBe(0);
    expect(dayShift({ tick: 1000, phase: 'play', nextPhaseIn: 9000 })).toBe(0);
    let last = 0;
    for (let t = 0; t <= 10_000; t += 500) {
      const s = dayShift({ tick: t, phase: 'play', nextPhaseIn: 10_000 - t });
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(last).toBeCloseTo(PLAY_SHARE, 5);
    expect(dayShift({ tick: 10_000, phase: 'sunset', nextPhaseIn: 0 }, 10_000)).toBeCloseTo(PLAY_SHARE, 5);
    expect(dayShift({ tick: 10_000 + SUNSET_TICKS, phase: 'sunset', nextPhaseIn: 0 }, 10_000)).toBe(1);
    // seen only in Sunset (a rejoin): dusk
    expect(dayShift({ tick: 12_000, phase: 'sunset', nextPhaseIn: 0 })).toBe(1);
  });

  it('the blend lands on each key and the sun stays above the horizon', () => {
    for (const id of MAP_IDS) {
      const p = DAYLIGHT[id];
      const a = dayLightAt(p, 0);
      const b = dayLightAt(p, 1);
      expect(a.sunI).toBeCloseTo(p.day.sunI, 6);
      expect(b.hemiI).toBeCloseTo(p.dusk.hemiI, 6);
      for (const d of [a, b, dayLightAt(p, 0.5)]) {
        expect(Math.hypot(...d.dir)).toBeCloseTo(1, 6);
        expect(d.dir[1]).toBeGreaterThan(0.49);
      }
      expect(a.sun[0]).toBeCloseTo(((p.day.sun >> 16) & 255) / 255, 6);
    }
  });
});
