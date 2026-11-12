/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md): Hearthwood rebuilt to the standard MOBA layout. The carved jungle
 * bake (gate G4: symmetry, wall thickness, reachability, fair objective paths, A* over random pairs), the camps of the
 * four quadrants, brush, Boing Beds, Sugar Rush, the published map info, and the version.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createMatch, fillPicks, mapInfo, step, type MatchHandle } from '../../src/sim/index';
import { bindMap } from '../../src/sim/map/runtime';
import { createGrid } from '../../src/sim/map/grid';
import { findPath } from '../../src/sim/nav/astar';
import { isqrt } from '../../src/sim/fixed';
import { HEARTHWOOD_CANNON, HEARTHWOOD_YARN } from '../../src/data/fun';
import { CAMP_KIND, CAMP_KINDS } from '../../src/data/camps';
import { SUGAR_RUSH } from '../../src/data/pudding';
import { MAX_ENTITIES } from '../../src/data/map';
import { JUNGLE_NODES } from '../../src/sim/bots/jungle';
import { dealDamage } from '../../src/sim/combat/damage';
import { onPuddingDown } from '../../src/sim/units/pudding';
import { Buff, G, Kind, MG, RANGE } from '../../src/sim/world';
import { SIM_VERSION } from '../../src/sim/version';
import { putMinion } from './sim-helpers';

const W = 128000;
const info = mapInfo('hearthwood');
const P = info.playable;
const open = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < 128 && j < 128 && P[j * 128 + i] === 1;
const cellOpen = (x: number, y: number): boolean => open(Math.trunc(x / 1000), Math.trunc(y / 1000));
/** Within 9 m of a pit centre: the pit rings are rocks (WALLS), not forest. */
const nearPit = (i: number, j: number): boolean =>
  info.objectives.some((o) => (i * 1000 + 500 - o.x) ** 2 + (j * 1000 + 500 - o.y) ** 2 <= 11500 * 11500);

afterAll(() => bindMap(0));

describe('sim v22 version', () => {
  it('SIM_VERSION is 22 or later (v23 kept the map); Hearthwood holds 160 entity ids', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(22);
    expect(MAX_ENTITIES).toBe(160);
    expect(CAMP_KINDS[CAMP_KIND.beetle].name).toBe('beetle');
    expect(CAMP_KIND.beetle).toBe(5);
  });

  it('Crossing has no carved jungle, beds rows keep their v21 values, and no Sugar Rush timer', () => {
    const c = mapInfo('crossing');
    expect([c.clearings.length, c.corridors.length, c.pits.length, c.jungleNodes.length]).toEqual([0, 0, 0, 0]);
    expect(c.objectiveTimers.sugarRush).toBe(-1);
    expect(c.beds.length).toBe(6);
  });
});

describe('the carved jungle (G4 bake)', () => {
  it('is a forest about 69% walkable, the same under the point reflection, the swap and the river mirror', () => {
    let n = 0;
    for (let j = 0; j < 128; j++) {
      for (let i = 0; i < 128; i++) {
        const c = P[j * 128 + i];
        n += c;
        if (c !== P[(127 - j) * 128 + (127 - i)] || c !== P[i * 128 + j] || c !== P[(127 - i) * 128 + (127 - j)]) throw new Error(`cell ${i},${j} breaks the symmetry`);
      }
    }
    expect(n / 16384).toBeGreaterThan(0.66);
    expect(n / 16384).toBeLessThan(0.73);
  });

  it('every forest wall is at least 3 cells thick (rows and columns; the pit rings are rocks)', () => {
    const thin: string[] = [];
    for (let j = 0; j < 128; j++) {
      for (let i = 0; i < 128; i++) {
        if (!open(i, j)) continue;
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
        ]) {
          for (let n = 1; n <= 2; n++) {
            let blocked = true;
            for (let k = 1; k <= n; k++) if (open(i + di * k, j + dj * k)) blocked = false;
            if (blocked && open(i + di * (n + 1), j + dj * (n + 1)) && !nearPit(i + di, j + dj)) thin.push(`${i},${j}`);
          }
        }
      }
    }
    expect(thin).toEqual([]);
  });

  it('the lanes and the river band are never blocked (outside the pit rings)', () => {
    for (const lane of info.lanes) {
      const [xs, ys] = lane.path[0];
      for (let k = 1; k < xs.length; k++) {
        const [ax, ay] = [xs[k - 1], ys[k - 1]];
        const [bx, by] = [xs[k], ys[k]];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 500);
        for (let s = 0; s <= steps; s++) {
          const x = ax + ((bx - ax) * s) / steps;
          const y = ay + ((by - ay) * s) / steps;
          expect(cellOpen(x, y), `${lane.id} ${x},${y}`).toBe(true);
        }
      }
    }
    for (let i = 0; i < 128; i++) {
      for (let j = 0; j < 128; j++) {
        const x = i * 1000 + 500;
        const y = j * 1000 + 500;
        if (Math.abs(x + y - W) <= 4000 && x > 6000 && y > 6000 && !nearPit(i, j)) expect(open(i, j), `river ${i},${j}`).toBe(true);
      }
    }
  });

  it('every walkable cell is reachable from team 0 fountain; every camp, exit node, bed and landing is walkable', () => {
    const seen = new Uint8Array(16384);
    const f = info.fountains[0];
    const start = Math.trunc(f.y / 1000) * 128 + Math.trunc(f.x / 1000);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const c = q.pop()!;
      const i = c % 128;
      const j = (c - i) / 128;
      for (const [a, b] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!open(i + a, j + b)) continue;
        const n = (j + b) * 128 + i + a;
        if (!seen[n]) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    let lost = 0;
    for (let c = 0; c < 16384; c++) if (P[c] === 1 && !seen[c]) lost++;
    expect(lost).toBe(0);
    for (const c of info.camps) expect(cellOpen(c.x, c.y), `camp ${c.kind} ${c.x},${c.y}`).toBe(true);
    for (const n of JUNGLE_NODES) expect(cellOpen(n.x, n.y), `node ${n.kind} ${n.x},${n.y}`).toBe(true);
    for (const b of info.beds) expect(cellOpen(b.x, b.y) && cellOpen(b.landX, b.landY), `bed ${b.x},${b.y}`).toBe(true);
  });

  it('each objective is as far from both fountains by A* (within 1 m), and no A* over 4,000 random pairs comes up short', { timeout: 600000 }, () => {
    bindMap(1);
    const grid = createGrid();
    const ox = new Int32Array(64);
    const oy = new Int32Array(64);
    const len = (sx: number, sy: number, tx: number, ty: number, team: number): number => {
      const r = findPath(grid, sx, sy, tx, ty, ox, oy, 0, team);
      expect(r.complete).toBe(true);
      let d = 0;
      let px = sx;
      let py = sy;
      for (let k = 0; k < r.count; k++) {
        d += isqrt((ox[k] - px) ** 2 + (oy[k] - py) ** 2);
        px = ox[k];
        py = oy[k];
      }
      return d;
    };
    const [f0, f1] = info.fountains;
    for (const o of info.objectives) {
      // Each team's own mouth of the pit (the team 0 mouth reflected is team 1's): within 1 m.
      const m0 = len(f0.x, f0.y, o.x, o.y, 0);
      const m1 = len(f1.x, f1.y, o.x, o.y, 1);
      expect(Math.abs(m0 - m1), `${o.kind}: ${m0} vs ${m1}`).toBeLessThanOrEqual(1000);
    }
    // Random pairs (a fixed LCG): every walkable pair is joined. Cells within 7 m of the enemy fountain are skipped (its
    // disc walls off the corner cells behind it for that team, as on every map since sim v16).
    const enemyFountain = (c: number, team: number): boolean => {
      const f = info.fountains[1 - team];
      return Math.hypot((c % 128) * 1000 + 500 - f.x, Math.trunc(c / 128) * 1000 + 500 - f.y) <= 7000;
    };
    const cells: number[] = [];
    for (let c = 0; c < 16384; c++) if (grid.walls[c] === 0 && grid.blocked[c] === 0) cells.push(c);
    let seed = 22;
    const rnd = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff);
    let short = 0;
    for (let k = 0; k < 4000; k++) {
      const a = cells[rnd() % cells.length];
      const b = cells[rnd() % cells.length];
      const team = k & 1;
      if (enemyFountain(a, team) || enemyFountain(b, team)) continue;
      const r = findPath(grid, (a % 128) * 1000 + 500, Math.trunc(a / 128) * 1000 + 500, (b % 128) * 1000 + 500, Math.trunc(b / 128) * 1000 + 500, ox, oy, 0, team);
      if (!r.complete) short++;
    }
    expect(short).toBe(0);
    bindMap(0);
  });
});

describe('camps, brush and beds', () => {
  it('four quadrants, each a buff, a Rat Nest, a Frog Pond and a Beetle Log at their clearings (kinds by the river mirror)', () => {
    const got = info.camps.map((c) => `${c.quadrant}:${c.kind}@${c.x / 1000},${c.y / 1000}`).sort();
    expect(got).toEqual(
      [
        'south:prickle@58,30',
        'south:rat@42,22',
        'south:toad@80,24',
        'south:beetle@64,42',
        'west:crow@30,58',
        'west:rat@22,42',
        'west:toad@24,80',
        'west:beetle@42,64',
        'east:prickle@98,70',
        'east:rat@106,86',
        'east:toad@104,48',
        'east:beetle@86,64',
        'north:crow@70,98',
        'north:rat@86,106',
        'north:toad@48,104',
        'north:beetle@64,86',
      ].sort(),
    );
    for (const c of info.clearings) expect(info.camps.some((k) => k.x === c.x && k.y === c.y)).toBe(true);
    expect(info.clearings).toHaveLength(16);
    expect(info.corridors).toHaveLength(40);
    expect(info.pits).toHaveLength(2);
  });

  it('32 bushes, reflected in pairs; none on a camp centre, a cannon spot, a yarn home, a bed or a lane centre line', () => {
    expect(info.bushes).toHaveLength(32);
    const hit = (b: (typeof info.bushes)[number], x: number, y: number, pad: number) =>
      Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(y - b.y) <= b.h / 2 + pad;
    for (const b of info.bushes) {
      for (const c of info.camps) expect(hit(b, c.x, c.y, 2000), `bush ${b.x},${b.y} on camp ${c.x},${c.y}`).toBe(false);
      for (const [x, y] of HEARTHWOOD_CANNON.spots) expect(hit(b, x, y, 1000), `bush ${b.x},${b.y} on the cannon`).toBe(false);
      for (const [x, y] of HEARTHWOOD_YARN.homes) expect(hit(b, x, y, 1000), `bush ${b.x},${b.y} on the yarn`).toBe(false);
      for (const d of info.beds) {
        expect(hit(b, d.x, d.y, 1000) || hit(b, d.landX, d.landY, 1000), `bush ${b.x},${b.y} on a bed`).toBe(false);
      }
      for (const lane of info.lanes) {
        const [xs, ys] = lane.path[0];
        for (let k = 1; k < xs.length; k++) {
          const steps = Math.ceil(Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]) / 500);
          for (let s = 0; s <= steps; s++) {
            const x = xs[k - 1] + ((xs[k] - xs[k - 1]) * s) / steps;
            const y = ys[k - 1] + ((ys[k] - ys[k - 1]) * s) / steps;
            expect(hit(b, x, y, 500), `bush ${b.x},${b.y} on ${lane.id}`).toBe(false);
          }
        }
      }
      // Mostly on walkable ground (a bush is a place to stand in).
      let on = 0;
      let all = 0;
      for (let x = b.x - b.w / 2 + 500; x < b.x + b.w / 2; x += 1000) {
        for (let y = b.y - b.h / 2 + 500; y < b.y + b.h / 2; y += 1000) {
          all++;
          if (cellOpen(x, y)) on++;
        }
      }
      expect(on / all, `bush ${b.x},${b.y} on ground`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('one Boing Bed a quadrant: from the side lane past the inner tower to the buff clearing edge', () => {
    expect(info.beds).toHaveLength(4);
    for (const b of info.beds) {
      const d = Math.hypot(b.landX - b.x, b.landY - b.y);
      expect(d).toBeGreaterThan(10000);
      expect(d).toBeLessThan(15000);
      const buff = info.camps.find((c) => (c.kind === 'prickle' || c.kind === 'crow') && Math.hypot(c.x - b.landX, c.y - b.landY) <= 7000);
      expect(buff, `bed ${b.x},${b.y} lands by a buff`).toBeDefined();
    }
  });

  it('publishes the objective timers and the jungle route graph', () => {
    expect(info.objectiveTimers.sugarRush).toBe(SUGAR_RUSH.ticks);
    expect(info.objectiveTimers.grizzlechopRespawn).toBeGreaterThan(0);
    expect(info.jungleNodes.length).toBe(48);
    for (const [a, b] of info.jungleEdges) expect(info.jungleNodes[a] && info.jungleNodes[b]).toBeTruthy();
    // Team 1's nodes are team 0's, river-mirrored, in the same order.
    for (let k = 0; k < 24; k++) {
      const a = info.jungleNodes[k];
      const b = info.jungleNodes[24 + k];
      expect([b.x, b.y, b.kind, a.team, b.team]).toEqual([W - a.y, W - a.x, a.kind, 0, 1]);
    }
  });
});

/** A quiet Hearthwood match (bots off). */
function hearth(): MatchHandle {
  const { picks, tricks } = fillPicks(7, 'clem', 'pounce', 'hearthwood');
  const m = createMatch({ seed: 7, picks, tricks, difficulty: 'normal', map: 'hearthwood' });
  m.world.globals[G.BotsOff] = 1;
  step(m);
  return m;
}

describe('Sugar Rush (§6.2)', () => {
  it('calming the Great Pudding gives every living hero of the team Sugar Rush for 90 s, flagged and ended by death', () => {
    const m = hearth();
    const w = m.world;
    w.lastHitBy[RANGE.pudding] = 2;
    w.alive[4] = 0;
    onPuddingDown(m);
    const got = m.events.filter((e) => e.type === 'buff' && e.kind === 'sugarRush').map((e) => (e as { id: number }).id);
    expect(got).toEqual([0, 1, 2, 3]);
    for (const h of [0, 1, 2, 3]) expect(w.mg[MG.Rush + h]).toBe(SUGAR_RUSH.ticks);
    for (const h of [4, 5, 6, 7, 8, 9]) expect(w.mg[MG.Rush + h]).toBe(0);
    w.alive[4] = 1;
    step(m);
    expect(w.buffs[0] & Buff.SugarRush).not.toBe(0);
    expect(w.mg[MG.Rush + 0]).toBe(SUGAR_RUSH.ticks - 1);
  });

  it('allied minions within 8 m take 30% less damage and deal 30% more to structures; farther ones do not', () => {
    const m = hearth();
    const w = m.world;
    w.mg[MG.Rush + 0] = SUGAR_RUSH.ticks;
    const near = putMinion(m, 0, w.x[0] + 5000, w.y[0]);
    const far = putMinion(m, 0, w.x[0] + 20000, w.y[0]);
    const hpN = w.hp[near];
    const hpF = w.hp[far];
    dealDamage(m, -1, 1, Kind.Tower, near, 100, 'basic', { pierce: true });
    dealDamage(m, -1, 1, Kind.Tower, far, 100, 'basic', { pierce: true });
    const lostN = hpN - w.hp[near];
    const lostF = hpF - w.hp[far];
    expect(lostN).toBeLessThan(lostF);
    expect(Math.abs(lostN - Math.round(lostF * 0.7))).toBeLessThanOrEqual(1);
    step(m);
    expect(w.buffs[near] & Buff.Sugared).not.toBe(0);
    expect(w.buffs[far] & Buff.Sugared).toBe(0);
  });
});
