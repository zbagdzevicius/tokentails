/**
 * Sim v16 S-PvP side symmetry (docs/plans/moba/V16.md §3.1.8): the map is authored for team 0 and mirrored for team 1,
 * so walls, the plaza, towers, cores, fountains, spawns, lanes and bushes are symmetric by construction. PvP fairness
 * rests on it; this pins it.
 */
import { describe, expect, it } from 'vitest';
import { MAP, mirrorX } from '../../src/data/map';
import { createMatch, fillPicks } from '../../src/sim/index';
import { createGrid, NX, NY } from '../../src/sim/map/grid';
import { bushAt } from '../../src/sim/map/brush';
import { LANE_PATHS } from '../../src/sim/map/lanes';
import { RANGE } from '../../src/sim/world';

describe('map-mirror (PvP side symmetry)', () => {
  it('the nav walls (forest, rim, rocks) mirror left-right cell for cell', () => {
    const g = createGrid();
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) expect(g.walls[j * NX + i]).toBe(g.walls[j * NX + (NX - 1 - i)]);
  });

  it('towers, cores, fountains and hero spawns of team 1 mirror team 0', () => {
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    const m = createMatch({ seed: 1, picks, tricks, difficulty: 'hard' });
    const w = m.world;
    for (let k = 0; k < 4; k++) {
      const a = RANGE.towers + k;
      const b = RANGE.towers + 4 + k;
      expect([w.x[b], w.y[b], w.hp[b], w.lane[b], w.sub[b]]).toEqual([mirrorX(w.x[a]), w.y[a], w.hp[a], w.lane[a], w.sub[a]]);
    }
    expect([w.x[RANGE.cores + 1], w.y[RANGE.cores + 1], w.hp[RANGE.cores + 1]]).toEqual([mirrorX(w.x[RANGE.cores]), w.y[RANGE.cores], w.hp[RANGE.cores]]);
    expect([w.x[RANGE.fountains + 1], w.y[RANGE.fountains + 1]]).toEqual([mirrorX(w.x[RANGE.fountains]), w.y[RANGE.fountains]]);
    for (let s = 0; s < 3; s++) expect([w.x[s + 3], w.y[s + 3]]).toEqual([mirrorX(w.x[s]), w.y[s]]);
  });

  it('lane paths of team 1 are team 0’s mirrored', () => {
    for (let lane = 0; lane < 2; lane++) {
      const a = LANE_PATHS[0][lane];
      const b = LANE_PATHS[1][lane];
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) expect([b.x[i], b.y[i]]).toEqual([mirrorX(a.x[i]), a.y[i]]);
    }
  });

  it('bushes mirror: a point is in a bush exactly when its mirror is', () => {
    for (let y = 500; y < MAP.height; y += 500) {
      for (let x = 500; x < MAP.width; x += 500) expect([x, y, bushAt(x, y) >= 0]).toEqual([x, y, bushAt(mirrorX(x), y) >= 0]);
    }
  });
});
