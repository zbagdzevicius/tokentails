/**
 * Sim v17 MAP-GAPS B5a (docs/plans/moba/V17.md §4): feared and charmed heroes slide along walls (nav/slide.ts) instead
 * of stopping dead; minions and rats are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, result, step } from '../../src/sim/index';
import { fear } from '../../src/sim/effects';
import { isqrt } from '../../src/sim/fixed';
import { cellOf, createGrid, walkable } from '../../src/sim/map/grid';
import { slideStep } from '../../src/sim/nav/slide';
import { FM } from '../../src/sim/world';
import { heroMatch, hold, place } from './heroes/kit-helpers';

describe('sim v17 B5a: feared heroes slide along walls', { timeout: 300_000 }, () => {
  it('slideStep: free step, x only, y only, or stay', () => {
    const g = createGrid();
    const out = new Int32Array(2);
    // The rock [24-30 x 37-41] (cells of 1 m): its south face is y = 37000.
    slideStep(g, 27500, 36800, 28000, 37200, out);
    expect([out[0], out[1]]).toEqual([28000, 36800]);
    slideStep(g, 27500, 36800, 27500, 37200, out);
    expect([out[0], out[1]]).toEqual([27500, 36800]);
    slideStep(g, 27500, 35000, 28000, 35400, out);
    expect([out[0], out[1]]).toEqual([28000, 35400]);
    expect(walkable(g, cellOf(27500, 38000))).toBe(false);
  });

  it('a hero feared into the rock face at an angle slides along it; one feared straight into it stays', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    const w = m.world;
    hold(m, 0, 1, 2, 3, 4, 5);
    place(m, 3, 27500, 36600);
    // From the south-west: it runs north-east into the south face.
    fear(w, 3, 15, 27500 - 3000, 36600 - 3000);
    for (let t = 0; t < 15; t++) step(m);
    expect(walkable(m.grid, cellOf(w.x[3], w.y[3]))).toBe(true);
    expect(isqrt((w.x[3] - 27500) ** 2 + (w.y[3] - 36600) ** 2)).toBeGreaterThanOrEqual(1000);
    expect(w.y[3]).toBeLessThan(37000);

    const n = heroMatch(['clem', 'sage', 'gabe', 'brutus', 'chili', 'rocket']);
    hold(n, 0, 1, 2, 3, 4, 5);
    place(n, 3, 27500, 36600);
    fear(n.world, 3, 15, 27500, 30000);
    for (let t = 0; t < 15; t++) step(n);
    expect(n.world.x[3]).toBe(27500);
    expect(n.world.y[3]).toBeGreaterThan(36600);
    expect(n.world.y[3]).toBeLessThan(37000);
  });

  it('bot matches: no feared or charmed hero ever ends a tick on a wall cell', () => {
    let bad = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { picks, tricks } = fillPicks(seed, 'cacklejaw', 'hiss');
      const m = createMatch({ seed, picks, tricks, difficulty: 'hard' });
      const w = m.world;
      const bot = createPlayerBot(m, 'normal');
      const fearedBefore = new Uint8Array(6);
      for (let t = 0; t < 6000 && !result(m); t++) {
        for (let id = 0; id < 6; id++) fearedBefore[id] = w.fearT[id] > 0 ? 1 : 0;
        step(m, playerBotCommands(m, bot));
        // Only the fear walk is B5a's: other wall contacts (MAP-GAPS B7) are out of this item's scope.
        // Sim v21: a hero in a Boing Bed flight is in the air over the wall (FM.Leap), not walking on it. A hero feared
        // during the tick took that tick's step by its own walk (seed 8, tick 4490 on v21: a corner cut, then the
        // fear), so only a hero already feared before the step counts.
        for (let id = 0; id < 6; id++) if (fearedBefore[id] === 1 && w.alive[id] === 1 && w.fearT[id] > 0 && w.fmKind[id] !== FM.Leap && m.grid.walls[cellOf(w.x[id], w.y[id])] !== 0) bad++;
      }
    }
    expect(bad).toBe(0);
  });
});
