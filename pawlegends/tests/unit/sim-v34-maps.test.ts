/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md): the 3v3 map pool. The draw from the seed; per map the nav grid (mirror
 * symmetric, every spot that matters reachable from the base), each objective's rules, and determinism.
 */
import { describe, expect, it } from 'vitest';
import { limit } from './cpu-budget';
import { MAP_IDS, MAP_POOL_3V3, Op, pickMap3v3, type MapId } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, hash, playerBotCommands, result, snapshot, step, type MatchHandle } from '../../src/sim/index';
import { bindMap, mapIndex } from '../../src/sim/map/runtime';
import { NX, NY, cellOf, createGrid, walkable } from '../../src/sim/map/grid';
import { ACTIVE_MAP, CAMPS, FOUNTAIN, LANES, LANE_WAYPOINTS, MAP, PUDDING_SPOT, TOWER_SPOTS } from '../../src/data/map';
import { FUN_BY_MAP } from '../../src/data/fun';
import { FRENZY_SPOTS } from '../../src/data/pickups';
import { PRACTICE_BY_MAP } from '../../src/data/practice';
import { G, OB, OBF, RANGE, YARN_STATE } from '../../src/sim/world';
import { yarnAt } from '../../src/sim/units/yarn';
import { YF } from '../../src/sim/world';
import { objSpeedBp, objectiveDeath, objStructBp } from '../../src/sim/units/objective';
import { Kind } from '../../src/sim/world';
import { verifyReplay } from '../../src/sim/server';
import { replayRecord } from '../../src/sim/index';

const POOL: readonly MapId[] = ['ridge', 'thicket', 'quarry', 'pitch'];

describe('sim v34: the pool and the draw', () => {
  it('appends four maps and draws all five from the seed, about evenly', () => {
    expect(MAP_IDS.slice(2)).toEqual(POOL);
    expect(MAP_POOL_3V3).toEqual(['crossing', ...POOL]);
    const n: Record<string, number> = {};
    for (let s = 0; s < 5000; s++) n[pickMap3v3(s)] = (n[pickMap3v3(s)] ?? 0) + 1;
    for (const m of MAP_POOL_3V3) expect(n[m]).toBeGreaterThan(850);
    expect(pickMap3v3(123456)).toBe(pickMap3v3(123456));
  });
});

/** Cells reachable from team 0's fountain edge (4-connected BFS over the static walls). */
function reach(): Uint8Array {
  const g = createGrid();
  const seen = new Uint8Array(NX * NY);
  const q: number[] = [cellOf(FOUNTAIN.x + FOUNTAIN.radius + 1000, FOUNTAIN.y)];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const i = c % NX;
    const j = (c - i) / NX;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const k = nj * NX + ni;
      if (seen[k] || !walkable(g, k)) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  return seen;
}

describe.each(POOL)('sim v34 map %s: nav', (id) => {
  it('is mirror symmetric and every spot is reachable from the base', () => {
    bindMap(mapIndex(id));
    expect(ACTIVE_MAP.id).toBe(id);
    const walls = createGrid().walls;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) expect(walls[j * NX + i], `cell ${i},${j}`).toBe(walls[j * NX + NX - 1 - i]);
    const ok = reach();
    const at = (x: number, y: number, what: string): void => {
      // a spot on a cell border counts when a cell within 1 m reaches
      let hit = false;
      for (const [dx, dy] of [[0, 0], [600, 0], [-600, 0], [0, 600], [0, -600]]) if (ok[cellOf(x + dx, y + dy)]) hit = true;
      expect(hit, `${id}: ${what} at ${x},${y}`).toBe(true);
    };
    const both = (x: number, y: number, what: string): void => {
      at(x, y, what);
      at(MAP.width - x, y, `${what} (mirror)`);
    };
    for (const l of LANES) for (const [x, y] of LANE_WAYPOINTS[l]) both(x, y, `lane ${l}`);
    for (const t of TOWER_SPOTS) both(t.x, t.y + 2000, `tower ${t.lane} ${t.tier}`);
    for (const c of CAMPS) at(c.x, c.y, `camp ${c.kind}`);
    const o = ACTIVE_MAP.objective!;
    both(o.x, o.y + (o.kind === 'gems' ? 2500 : 0), `objective ${o.kind}`);
    if (o.kind === 'mill' || o.kind === 'shrines') both(PUDDING_SPOT.x, PUDDING_SPOT.y, 'Pudding');
    for (const f of FRENZY_SPOTS) {
      at(f[0], f[1], 'frenzy');
      at(f[2], f[3], 'frenzy');
    }
    for (const [x, y, lx, ly] of FUN_BY_MAP[mapIndex(id)].beds) {
      both(x, y, 'bed');
      both(lx, ly, 'bed landing');
    }
    const pr = PRACTICE_BY_MAP[mapIndex(id)];
    for (const [x, y] of pr.spots) at(x, y, 'practice spot');
    at(pr.walkTo[0], pr.walkTo[1], 'practice walk');
    if (ACTIVE_MAP.goalMouth) both((ACTIVE_MAP.goalMouth[0] + ACTIVE_MAP.goalMouth[2]) / 2, 30000, 'goal mouth');
    // entity ids stay in the 63-bit hit masks
    expect(RANGE.end).toBeLessThanOrEqual(64);
  });
});

function match(id: MapId, seed = 7): MatchHandle {
  const { picks, tricks } = fillPicks(seed, 'sage', 'pounce', id);
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal', map: id }) as MatchHandle;
  m.world.globals[G.BotsOff] = 1;
  return m;
}
/** Step until `tick`, holding hero 0 at (x, y) from `from` on, collecting events of `type`. */
function hold(m: MatchHandle, until: number, x: number, y: number, from = 0, type?: string): { type: string; [k: string]: unknown }[] {
  const out: { type: string; [k: string]: unknown }[] = [];
  const w = m.world;
  while (w.globals[G.Tick] < until) {
    if (w.globals[G.Tick] >= from) {
      w.x[0] = x;
      w.y[0] = y;
    }
    step(m, []);
    for (const e of m.events) if (!type || e.type === type) out.push(e as never);
  }
  return out;
}

describe('sim v34 objectives', () => {
  it('Fish Mill: opens at 1:00, a lone team captures it in 4 s for its pot, XP and Lantern Wave; shuts at 4:30', () => {
    const m = match('ridge');
    const w = m.world;
    const o = ACTIVE_MAP.objective!;
    const ev = hold(m, o.first + 300, 3000, 32000);
    expect(ev.some((e) => e.type === 'millOpen')).toBe(true);
    expect(w.ob[OB.Obj + OBF.Pot]).toBeGreaterThan(30);
    const fish0 = w.fish[0];
    const got = hold(m, o.first + 300 + o.capture + 5, o.x, o.y, 0, 'millCapture');
    expect(got.length).toBe(1);
    expect(got[0].team).toBe(0);
    expect(w.fish[0]).toBeGreaterThan(fish0);
    expect(objStructBp(w, 0, Kind.Minion)).toBe(o.minionStructBp);
    expect(objStructBp(w, 1, Kind.Minion)).toBe(10000);
    expect(w.ob[OB.Obj + OBF.MillState]).toBe(2);
    hold(m, o.endAt + 2, 3000, 32000);
    expect(w.ob[OB.Obj + OBF.MillState]).toBe(3);
    expect(snapshot(m, 0).obj?.mill?.state).toBe('done');
  });

  it('Paw Shrines: locked until 1:30, captured in 3 s, Swift Paws for one, Twin Blessing for both', () => {
    const m = match('thicket');
    const w = m.world;
    const o = ACTIVE_MAP.objective!;
    expect(hold(m, o.first - 1, o.x, o.y, 0, 'shrineCapture')).toHaveLength(0);
    const got = hold(m, o.first + o.capture + 5, o.x, o.y, 0, 'shrineCapture');
    expect(got.map((e) => [e.shrine, e.team])).toEqual([[0, 0]]);
    expect(objSpeedBp(w, 0)).toBe(o.speedBp);
    expect(objSpeedBp(w, 3)).toBe(0);
    const got2 = hold(m, w.globals[G.Tick] + o.capture + 5, MAP.width - o.x, o.y, 0, 'shrineCapture');
    expect(got2.map((e) => [e.shrine, e.team])).toEqual([[1, 0]]);
    expect(objStructBp(w, 0, Kind.Hero)).toBe(o.heroStructBp);
  });

  it('Catnip Gems: pop on the ring, picked up, dropped on death; a held count makes a Surge', () => {
    const m = match('quarry');
    const w = m.world;
    const o = ACTIVE_MAP.objective!;
    hold(m, o.first + o.cooldown * 3 + 1, 3000, 32000);
    expect(snapshot(m, 0).obj?.gems?.ground.length).toBe(4);
    const picks = hold(m, w.globals[G.Tick] + 3, o.x + 2000, o.y, 0, 'gemPick');
    expect(picks.length).toBe(1);
    expect(w.ob[OB.Obj + OBF.Carry]).toBeGreaterThanOrEqual(1);
    const carried = w.ob[OB.Obj + OBF.Carry];
    objectiveDeath(m, 0);
    expect(w.ob[OB.Obj + OBF.Carry]).toBe(0);
    expect(snapshot(m, 0).obj!.gems!.ground.length).toBe(4 - carried + carried);
    w.ob[OB.Obj + OBF.Carry + 1] = o.gemNeed;
    const surge = hold(m, w.globals[G.Tick] + o.countdown + 3, 3000, 32000, 0, 'gemSurge');
    expect(surge.map((e) => e.team)).toEqual([0]);
    expect(w.ob[OB.Obj + OBF.Carry + 1]).toBe(0);
    expect(objStructBp(w, 0, Kind.Minion)).toBe(o.minionStructBp);
  });

  it('Pawball Park: a ball in the goal scores and hits a tower; a crate stops the ball and breaks', () => {
    const m = match('pitch');
    const w = m.world;
    hold(m, FUN_BY_MAP[mapIndex('pitch')].yarn.first + 2, 3000, 32000);
    expect(w.globals[yarnAt(0, YF.State)]).toBe(YARN_STATE.Rest);
    // a kick east along y 32.5 m from 70 m reaches team 1's goal mouth past the crates
    w.globals[yarnAt(0, YF.X)] = 70000;
    w.globals[yarnAt(0, YF.Y)] = 32500;
    w.x[0] = 68400;
    w.y[0] = 32500;
    const towers = Array.from({ length: 4 }, (_, k) => w.hp[RANGE.towers + 4 + k]);
    step(m, [{ op: Op.Move, x: 71500, y: 32500 }]);
    const goals: { type: string; [k: string]: unknown }[] = [];
    for (let i = 0; i < 90; i++) {
      step(m, []);
      for (const e of m.events) if (e.type === 'goal') goals.push(e as never);
    }
    expect(goals.map((e) => e.team)).toEqual([0]);
    expect(w.ob[OB.Obj + OBF.Goals0]).toBe(1);
    const after = Array.from({ length: 4 }, (_, k) => w.hp[RANGE.towers + 4 + k]);
    expect(after.some((h, k) => h < towers[k])).toBe(true);
    // back at the centre 5 s later
    for (let i = 0; i < ACTIVE_MAP.objective!.reset + 2; i++) step(m, []);
    expect(w.globals[yarnAt(0, YF.State)]).toBe(YARN_STATE.Rest);
    expect(w.globals[yarnAt(0, YF.X)]).toBe(50000);
    // a ball kicked into team 1's centre crate stops and breaks it (V34-MAPS.md §2b: one hit since the balance pass)
    const c = OB.Obj + OBF.Crate + 5 + 2;
    expect(w.ob[c]).toBe(ACTIVE_MAP.objective!.capture);
    expect(ACTIVE_MAP.objective!.capture).toBe(1);
    w.globals[yarnAt(0, YF.T)] = 0;
    w.globals[yarnAt(0, YF.X)] = 68000;
    w.globals[yarnAt(0, YF.Y)] = 30000;
    w.x[0] = 66400;
    w.y[0] = 30000;
    step(m, [{ op: Op.Move, x: 69500, y: 30000 }]);
    for (let i = 0; i < 60; i++) step(m, []);
    expect(w.ob[c]).toBe(0);
  });
});

describe.each(POOL)('sim v34 map %s: whole matches', (id) => {
  it('bots play it to a core kill, deterministically, and the replay verifies', { timeout: limit(240000) }, () => {
    const run = (): { hash: number; trail: string; m: MatchHandle } => {
      const { picks, tricks } = fillPicks(31, 'sage', 'pounce', id);
      const m = createMatch({ seed: 31, picks, tricks, difficulty: 'normal', map: id }) as MatchHandle;
      const bot = createPlayerBot(m, 'normal');
      while (!result(m)) step(m, playerBotCommands(m, bot));
      return { hash: hash(m), trail: m.trail.join(','), m };
    };
    const a = run();
    const b = run();
    expect(a.hash).toBe(b.hash);
    expect(a.trail).toBe(b.trail);
    expect(result(a.m)!.reason).toBe('core');
    const rec = replayRecord(a.m)!;
    expect(rec.map).toBe(id);
    expect(verifyReplay(rec).ok).toBe(true);
  });
});
