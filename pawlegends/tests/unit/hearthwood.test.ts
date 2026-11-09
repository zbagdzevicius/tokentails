/**
 * Sim v19: 5v5 Classic on Hearthwood Divide (docs/plans/moba/MAP-5V5.md §7 gates G2, G3, G4). The map is a 180° point
 * reflection (and symmetric across its main diagonal), every lane and camp is fair to both teams, a 5v5 match runs to
 * its end and replays bit for bit, and a Crossing match beside it is untouched by the map switching.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { MAP_IDS, slotCountOf, teamOfSlot, teamSizeOf, type HeroId } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, hash, mapInfo, playerBotCommands, replayRecord, result, rolesOf, snapshot, step, tickOf } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { bindMap } from '../../src/sim/map/runtime';
import { createGrid } from '../../src/sim/map/grid';
import { findPath } from '../../src/sim/nav/astar';
import { isqrt } from '../../src/sim/fixed';
import { GRIZZLECHOP_PIT } from '../../src/data/maps/hearthwood';

const W = 128000;
const info = mapInfo('hearthwood');

afterAll(() => bindMap(0));

describe('Hearthwood Divide: the map (G3)', () => {
  it('is 128 × 128 m, 5 a side, point-symmetric, with three lanes, 11 towers a team, 12 camps and two pits', () => {
    expect(MAP_IDS).toEqual(['crossing', 'hearthwood']);
    expect([info.width, info.height, info.nx, info.ny, info.teamSize, info.symmetry]).toEqual([W, W, 128, 128, 5, 'point']);
    expect([teamSizeOf('hearthwood'), slotCountOf('hearthwood'), teamOfSlot(4, 'hearthwood'), teamOfSlot(5, 'hearthwood'), teamOfSlot(3, 'crossing')]).toEqual([5, 10, 0, 1, 1]);
    expect(info.lanes.map((l) => [l.id, l.name, l.role])).toEqual([
      ['fence', 'Fenceline', 'solo'],
      ['yarn', 'Yarn Road', 'mid'],
      ['gutter', 'Gutterway', 'fish'],
    ]);
    expect(info.towers).toHaveLength(22);
    expect(info.camps).toHaveLength(12);
    expect(info.objectives.map((o) => o.kind).sort()).toEqual(['grizzlechop', 'pudding']);
    expect(info.camera.yawDeg).toBe(0);
    expect(mapInfo('crossing').camera.yawDeg).toBe(-38);
    expect(info.limits).toEqual({ maxTicks: 28800, maxInputBytes: 44700, maxInputChars: 59600 });
  });

  it('every nav cell equals its point reflection and its diagonal swap', () => {
    const p = info.playable;
    let open = 0;
    for (let j = 0; j < 128; j++) {
      for (let i = 0; i < 128; i++) {
        const c = p[j * 128 + i];
        open += c;
        expect(c, `cell ${i},${j} vs its reflection`).toBe(p[(127 - j) * 128 + (127 - i)]);
        expect(c, `cell ${i},${j} vs its swap`).toBe(p[i * 128 + j]);
      }
    }
    // Mostly open jungle: the rim and the rocks are walls.
    expect(open).toBeGreaterThan(12000);
  });

  it('the river objectives sit on the river axis, each the other one reflected', () => {
    const g = info.objectives.find((o) => o.kind === 'grizzlechop')!;
    const pd = info.objectives.find((o) => o.kind === 'pudding')!;
    expect(g.x + g.y).toBe(W);
    expect([pd.x, pd.y]).toEqual([W - g.x, W - g.y]);
    expect([g.x, g.y]).toEqual([GRIZZLECHOP_PIT.x, GRIZZLECHOP_PIT.y]);
  });

  it("team 1's towers, cores, fountains and bushes are team 0's reflected, and the river mirror maps every tower to its lane and tier twin", () => {
    const o = { x: 0, y: 0 };
    const t0 = info.towers.filter((t) => t.team === 0);
    const t1 = info.towers.filter((t) => t.team === 1);
    // The reflection of team 0's set is team 1's set.
    const key = (x: number, y: number) => `${x},${y}`;
    const set1 = new Set(t1.map((t) => key(t.x, t.y)));
    for (const t of t0) {
      info.reflect(t.x, t.y, o);
      expect(set1.has(key(o.x, o.y))).toBe(true);
    }
    // The river mirror (x, y) → (W − y, W − x) maps team 0's tower k onto team 1's tower k (same lane, same tier).
    for (let k = 0; k < t0.length; k++) {
      expect([W - t0[k].y, W - t0[k].x]).toEqual([t1[k].x, t1[k].y]);
      expect([t1[k].lane, t1[k].tier]).toEqual([t0[k].lane, t0[k].tier]);
    }
    // Physical lanes: both teams' Fenceline towers stand along the top-left edges, Gutterway along the bottom-right.
    for (const t of info.towers) {
      if (t.lane === 'fence') expect(t.x <= 8000 || t.y >= 120000).toBe(true);
      if (t.lane === 'gutter') expect(t.y <= 8000 || t.x >= 120000).toBe(true);
      if (t.lane === 'yarn') expect(t.x).toBe(t.y);
    }
    info.reflect(info.cores[0].x, info.cores[0].y, o);
    expect([o.x, o.y]).toEqual([info.cores[1].x, info.cores[1].y]);
    info.reflect(info.fountains[0].x, info.fountains[0].y, o);
    expect([o.x, o.y]).toEqual([info.fountains[1].x, info.fountains[1].y]);
    // Spawns and camps mirror across the river (x, y) → (W − y, W − x), kind for kind (what the physical lanes do too).
    for (let k = 0; k < 5; k++) expect([W - info.spawns[k].y, W - info.spawns[k].x]).toEqual([info.spawns[5 + k].x, info.spawns[5 + k].y]);
    const camps = new Set(info.camps.map((c) => `${c.kind}:${c.x},${c.y}`));
    for (const c of info.camps) expect(camps.has(`${c.kind}:${W - c.y},${W - c.x}`)).toBe(true);
    // Each team has one Prickle Hollow and one Crow Roost.
    for (const side of [0, 1]) {
      const own = info.camps.filter((c) => (side === 0 ? c.x + c.y < W : c.x + c.y > W));
      expect(own.map((c) => c.kind).sort()).toEqual(['crow', 'prickle', 'rat', 'rat', 'toad', 'toad']);
    }
    const half = info.bushes.length / 2;
    for (let k = 0; k < half; k++) {
      info.reflect(info.bushes[k].x, info.bushes[k].y, o);
      expect([o.x, o.y]).toEqual([info.bushes[half + k].x, info.bushes[half + k].y]);
    }
  });

  it("lane paths: team 1's path of a lane is team 0's path of its partner reflected; Gutterway runs through the bottom-right corner", () => {
    const g0 = info.lanes[2].path[0];
    const pts: number[][] = [];
    for (let k = 0; k < g0[0].length; k++) pts.push([g0[0][k], g0[1][k]]);
    expect(pts).toEqual([
      [16000, 16000],
      [26000, 8000],
      [104000, 8000],
      [116000, 12000],
      [120000, 24000],
      [120000, 102000],
      [112000, 112000],
    ]);
    const partner = [2, 1, 0];
    for (let l = 0; l < 3; l++) {
      const a = info.lanes[l].path[1];
      const b = info.lanes[partner[l]].path[0];
      expect(Array.from(a[0])).toEqual(Array.from(b[0]).map((x) => W - x));
      expect(Array.from(a[1])).toEqual(Array.from(b[1]).map((y) => W - y));
      // Physical lane: team 1 walks team 0's path backwards.
      expect(Array.from(a[0])).toEqual(Array.from(info.lanes[l].path[0][0]).reverse());
    }
  });

  it('no rock stands on a lane: every point within 2 m of a lane centre line is walkable', () => {
    for (const lane of info.lanes) {
      const [xs, ys] = lane.path[0];
      for (let k = 0; k + 1 < xs.length; k++) {
        const dx = xs[k + 1] - xs[k];
        const dy = ys[k + 1] - ys[k];
        const len = isqrt(dx * dx + dy * dy);
        for (let s = 0; s <= len; s += 500) {
          for (const off of [-2000, 0, 2000]) {
            const x = xs[k] + Math.trunc((dx * s) / len) + Math.trunc((-dy * off) / len);
            const y = ys[k] + Math.trunc((dy * s) / len) + Math.trunc((dx * off) / len);
            const c = Math.trunc(y / 1000) * 128 + Math.trunc(x / 1000);
            expect(info.playable[c], `${lane.id} at ${x},${y}`).toBe(1);
          }
        }
      }
    }
  });
});

/** Octile grid distances (10 straight, 14 diagonal, no corner cutting) from cell `start` over `open` cells. */
function gridDistances(open: Uint8Array, start: number): Int32Array {
  const n = 128;
  const dist = new Int32Array(n * n).fill(-1);
  // Dial's buckets: costs are small integers.
  const buckets: number[][] = [[start]];
  dist[start] = 0;
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (let q = 0; q < b.length; q++) {
      const c = b[q];
      if (dist[c] !== d) continue;
      const i = c % n;
      const j = (c - i) / n;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const k = nj * n + ni;
          if (!open[k]) continue;
          if (di !== 0 && dj !== 0 && (!open[j * n + ni] || !open[nj * n + i])) continue;
          const nd = d + (di !== 0 && dj !== 0 ? 14 : 10);
          if (dist[k] >= 0 && dist[k] <= nd) continue;
          dist[k] = nd;
          (buckets[nd] ??= []).push(k);
        }
      }
    }
  }
  return dist;
}

describe('Hearthwood Divide: fair paths (G4)', () => {
  it('on the nav grid, every cell is exactly as far from team 0 fountain as its reflection is from team 1 fountain', () => {
    const cell = (x: number, y: number) => Math.trunc(y / 1000) * 128 + Math.trunc(x / 1000);
    const f0 = info.fountains[0];
    const f1 = info.fountains[1];
    const d0 = gridDistances(info.playable, cell(f0.x, f0.y));
    const d1 = gridDistances(info.playable, cell(f1.x - 1, f1.y - 1));
    let reached = 0;
    for (let c = 0; c < d0.length; c++) {
      const i = c % 128;
      const j = (c - i) / 128;
      expect(d0[c]).toBe(d1[(127 - j) * 128 + (127 - i)]);
      if (d0[c] >= 0) reached++;
    }
    // Every camp and objective can be reached.
    for (const p of [...info.camps, ...info.objectives]) expect(d0[cell(p.x, p.y)], `${p.x},${p.y}`).toBeGreaterThan(0);
    expect(reached).toBeGreaterThan(12000);
  });

  it('from each fountain, A* reaches every camp, objective, tower and lane river point, equally far for both teams (±3 m)', () => {
    bindMap(1);
    const grid = createGrid();
    const ox = new Int32Array(16);
    const oy = new Int32Array(16);
    const lengthOf = (sx: number, sy: number, tx: number, ty: number): { len: number; complete: boolean } => {
      const r = findPath(grid, sx, sy, tx, ty, ox, oy, 0);
      let len = 0;
      let px = sx;
      let py = sy;
      for (let k = 0; k < r.count; k++) {
        len += isqrt((ox[k] - px) * (ox[k] - px) + (oy[k] - py) * (oy[k] - py));
        px = ox[k];
        py = oy[k];
      }
      return { len, complete: r.complete };
    };
    const f0 = info.fountains[0];
    const f1 = info.fountains[1];
    const targets: [number, number][] = [];
    for (const c of info.camps) targets.push([c.x, c.y]);
    for (const o of info.objectives) targets.push([o.x, o.y]);
    // Towers: a point beside each (its body blocks no static cell, but stay off the footprint anyway).
    for (const t of info.towers.filter((t) => t.team === 0)) targets.push([t.x + 2000, t.y + 2000]);
    targets.push([12000, 116000], [64000, 64000], [116000, 12000]);
    for (const [x, y] of targets) {
      const a = lengthOf(f0.x, f0.y, x, y);
      const b = lengthOf(f1.x, f1.y, W - x, W - y);
      expect(a.complete && b.complete, `${x},${y} reachable`).toBe(true);
      // A*'s string pulling breaks ties by cell index, so equal-cost routes can pull a little differently.
      expect(Math.abs(a.len - b.len), `${x},${y}: ${a.len} vs ${b.len}`).toBeLessThanOrEqual(3000);
    }
    bindMap(0);
  });
});

describe('Hearthwood Divide: 5v5 matches (G2)', () => {
  it('assigns five distinct roles a team, from the picks alone', () => {
    const { picks } = fillPicks(7, 'clem', 'pounce', 'hearthwood');
    expect(picks).toHaveLength(10);
    const roles = rolesOf({ picks, map: 'hearthwood' });
    expect(new Set(roles.slice(0, 5)).size).toBe(5);
    expect(new Set(roles.slice(5)).size).toBe(5);
    expect(rolesOf({ picks: picks.slice(0, 6) })).toEqual([]);
  });

  it('a whole solo 5v5 match ends by itself, its record names the map and verifies on the server entry', { timeout: 120000 }, () => {
    const seed = 4040;
    const { picks, tricks } = fillPicks(seed, 'sage', 'pounce', 'hearthwood');
    const m = createMatch({ seed, picks, tricks, difficulty: 'normal', map: 'hearthwood' });
    const bot = createPlayerBot(m, 'normal');
    let towers = 0;
    let grizz = 0;
    while (!result(m)) {
      step(m, playerBotCommands(m, bot));
      for (const e of m.events) {
        if (e.type === 'tower') towers++;
        if (e.type === 'objective' && e.kind === 'grizzlechop') grizz++;
      }
    }
    const r = result(m)!;
    expect(r.ticks).toBeLessThanOrEqual(28800);
    expect(r.ticks).toBeGreaterThan(9000);
    expect(towers).toBeGreaterThan(2);
    expect(grizz).toBeGreaterThan(0);
    const rec = replayRecord(m)!;
    expect(rec.map).toBe('hearthwood');
    expect(rec.simVersion).toBe(19);
    expect(verifyReplay(rec)).toMatchObject({ ok: true, finalHash: rec.finalHash });
    expect(verifyReplay({ ...rec, map: undefined }).ok).toBe(false);
    expect(verifyReplay({ ...rec, map: 'atlantis' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
  });

  it('a Crossing match stepped tick by tick beside a Hearthwood match hashes as it does alone', { timeout: 60000 }, () => {
    const play = (withOther: boolean): number[] => {
      const { picks, tricks } = fillPicks(99, 'clem', 'pounce');
      const a = createMatch({ seed: 99, picks, tricks, difficulty: 'normal' });
      const h = fillPicks(98, 'bravo', 'pounce', 'hearthwood');
      const b = withOther ? createMatch({ seed: 98, picks: h.picks, tricks: h.tricks, difficulty: 'normal', map: 'hearthwood' }) : null;
      const out: number[] = [];
      for (let t = 0; t < 4000; t++) {
        step(a);
        if (b) {
          step(b);
          snapshot(b, 1);
        }
        if (t % 500 === 0) out.push(hash(a));
      }
      return out;
    };
    expect(play(true)).toEqual(play(false));
  });

  it('the snapshot carries the map, the river objectives and the camp timers; slots 0..9 are heroes', () => {
    const { picks, tricks } = fillPicks(5, 'bravo', 'hiss', 'hearthwood');
    const m = createMatch({ seed: 5, picks, tricks, difficulty: 'easy', map: 'hearthwood' });
    while (tickOf(m) < 3700) step(m);
    const s = snapshot(m, 0);
    expect(s.map).toBe('hearthwood');
    expect(s.objectives?.map((o) => o.kind)).toEqual(['grizzlechop', 'pudding']);
    expect(s.objectives?.[0].state).toBe('up');
    expect(s.camps).toHaveLength(12);
    expect(s.entities.filter((e) => e.kind === 'hero').map((e) => e.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.entities.some((e) => e.kind === 'boss')).toBe(true);
    expect(s.entities.filter((e) => e.kind === 'tower').map((e) => e.variant)).toContain('hearth');
    // Crossing snapshots carry none of it.
    const c = fillPicks(5, 'bravo', 'hiss');
    const cm = createMatch({ seed: 5, picks: c.picks, tricks: c.tricks, difficulty: 'easy' });
    step(cm);
    const cs = snapshot(cm, 0);
    expect(cs.map).toBeUndefined();
    expect(cs.objectives).toBeUndefined();
  });

  it('refuses a config whose picks do not fit the map', () => {
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    expect(() => createMatch({ seed: 1, picks, tricks, difficulty: 'easy', map: 'hearthwood' })).toThrow(/10 slots/);
    const h = fillPicks(1, 'clem', 'pounce', 'hearthwood');
    expect(() => createMatch({ seed: 1, picks: h.picks as HeroId[], tricks: h.tricks, difficulty: 'easy' })).toThrow(/6 slots/);
  });
});
