/**
 * Level solver / bot for Catnip Heist.
 *
 * (a) proveOneCatUnsolvable: static reachability proof that a level cannot be won by moving only
 *     one cat (the other stays parked on its spawn).
 * (b) planSolution: plans a winning input log for two cats. A scripted list of high-level steps
 *     (goto / collect / swap / interact / meow / wait) is expanded into per-tick inputs. Each goto is
 *     an A* search over (cat tile, guard state) using the real sim as the forward model, so the
 *     guard state is exactly "tick mod patrol period" while guards patrol. Branches in which any
 *     cat gets spotted are pruned, so the plan is guaranteed to replay with spottedCount == 0.
 *
 * Movement is continuous in the sim (see src/sim/sim.ts), but the planner works in tile space: every
 * move action is one grid-cardinal input held for exactly CAT_TICKS_PER_TILE ticks, which takes a cat
 * at rest on a tile centre (movement accumulator 0) to the neighbouring centre with the accumulator
 * back at 0, without ever touching a wall (the hitbox stays inside the two tiles). Waits use no input,
 * which also resets the accumulator. Any action that does not end on a tile centre (e.g. a plate door
 * closing in the cat's face) is pruned.
 *
 * Generic over LevelDef: pass any level and a script. `main()` solves every level listed in
 * LEVEL_SCRIPTS (tools/level-scripts.ts; optionally only the ids given on the command line).
 *
 * Run: `node tools/solve.mjs` (bundles this file with rolldown and calls main()).
 */
import { NO_INPUT, SIM_VERSION, type Axis, type Input, type LevelDef, type SimState, type Vec2i } from '../src/types';
import { atCenter, compileLevel, isOpenTile, tileOf } from '../src/sim/grid';
import { CAT_TICKS_PER_TILE, initSim, sentryPeriod, stepSim, type SimGuard } from '../src/sim/sim';
import { encodeInputs, replay, type InputLog } from '../src/sim/replay';
import { renderAscii } from '../src/sim/debug';
import { LEVEL_SCRIPTS } from './level-scripts';

// ---------------------------------------------------------------------------------------------
// (a) One-cat proof
// ---------------------------------------------------------------------------------------------

export interface LoneCatReport {
  cat: 0 | 1;
  /** Number of tiles the lone cat can reach. */
  reachableTiles: number;
  canReachKey: boolean;
  canReachCrate: boolean;
  canReachExit: boolean;
  /** The parked cat stands on an exit tile (needed for a win). */
  partnerOnExit: boolean;
  /** Plate doors that block the lone cat (ids). */
  blockingDoors: string[];
}

export interface OneCatProof {
  /** True when no single cat can win alone. */
  unsolvable: boolean;
  cats: LoneCatReport[];
  /** Human readable argument. */
  argument: string[];
}

/**
 * Static argument. With only one cat moving, a PLATE door is open only while (i) the parked cat
 * holds a linked plate, or (ii) the mover stands on a linked plate. Every plate is at least 2 tiles
 * (Chebyshev) from its doors (validateLevel), a door only closes when nobody is in or walking into
 * it, and a move into the door tile can only start from an 8-neighbour of the door. So in case (ii)
 * the mover's hitbox (centre +- CAT_HALF < half a tile) never overlaps the door while it is open, and
 * PLATE doors not held by the parked cat act as walls. The VAULT door opens once the key is
 * reachable. The cat hitbox cannot squeeze between two blocking tiles that touch at a corner, so
 * 4-neighbour flood fill over tile centres gives the exact reachable set. Rescue needs the crate
 * within 1 tile (Chebyshev) of a reachable tile.
 */
export function proveOneCatUnsolvable(level: LevelDef): OneCatProof {
  const c = compileLevel(level);
  const reports: LoneCatReport[] = [];
  const argument: string[] = [];
  for (const mover of [0, 1] as const) {
    const parked = level.catSpawns[1 - mover];
    const heldPlates = new Set<number>();
    level.plates.forEach((p, i) => {
      if (p.tile.x === parked.x && p.tile.y === parked.y) heldPlates.add(i);
    });
    const doorsOpen = level.doors.map((d, di) => d.kind === 'PLATE' && c.doorPlates[di].some((pi) => heldPlates.has(pi)));
    const flood = (open: boolean[]): Uint8Array => {
      const seen = new Uint8Array(c.w * c.h);
      const s = level.catSpawns[mover];
      const q: number[] = [s.y * c.w + s.x];
      seen[q[0]] = 1;
      while (q.length) {
        const i = q.pop()!;
        const x = i % c.w;
        const y = (i - x) / c.w;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!isOpenTile(c, nx, ny, open)) continue;
          const ni = ny * c.w + nx;
          if (!seen[ni]) {
            seen[ni] = 1;
            q.push(ni);
          }
        }
      }
      return seen;
    };
    let seen = flood(doorsOpen);
    const at = (t: Vec2i) => seen[t.y * c.w + t.x] === 1;
    const canReachKey = !!level.key && at(level.key.tile);
    if (canReachKey) {
      level.doors.forEach((d, di) => {
        if (d.kind === 'VAULT') doorsOpen[di] = true;
      });
      seen = flood(doorsOpen);
    }
    const ct = level.crate.tile;
    const canReachCrate = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ].some(([dx, dy]) => {
      const x = ct.x + dx;
      const y = ct.y + dy;
      return x >= 0 && y >= 0 && x < c.w && y < c.h && seen[y * c.w + x] === 1;
    });
    const canReachExit = level.exit.tiles.some((t) => at(t));
    const partnerOnExit = level.exit.tiles.some((t) => t.x === parked.x && t.y === parked.y);
    const blockingDoors = level.doors
      .filter((d, di) => d.kind === 'PLATE' && !doorsOpen[di])
      .filter((d) => {
        // Door borders the reachable region.
        return [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => {
          const x = d.tile.x + dx;
          const y = d.tile.y + dy;
          return x >= 0 && y >= 0 && x < c.w && y < c.h && seen[y * c.w + x] === 1;
        });
      })
      .map((d) => d.id);
    let reachableTiles = 0;
    for (let i = 0; i < seen.length; i++) reachableTiles += seen[i];
    reports.push({ cat: mover, reachableTiles, canReachKey, canReachCrate, canReachExit, partnerOnExit, blockingDoors });
    argument.push(
      `cat ${mover + 1} alone reaches ${reachableTiles} tiles; key ${canReachKey ? 'yes' : 'no'}, crate ${
        canReachCrate ? 'yes' : 'no'
      }, exit ${canReachExit ? 'yes' : 'no'}; partner on exit ${partnerOnExit ? 'yes' : 'no'}; blocked by ${
        blockingDoors.join(', ') || 'nothing'
      }`,
    );
  }
  // Stronger than "the partner is not on the exit": even ignoring where the partner ends up, no lone
  // cat can both reach the crate and reach the exit, so the partner has to hold a plate at some point.
  const unsolvable = reports.every((r) => !(r.canReachCrate && r.canReachExit));
  argument.push(
    unsolvable
      ? 'No lone cat can both free the shelter cat and reach the exit, even ignoring its partner: the level needs both cats.'
      : 'A lone cat can free the shelter cat and reach the exit (the level does not force teamwork).',
  );
  return { unsolvable, cats: reports, argument };
}

// ---------------------------------------------------------------------------------------------
// (b) Planner
// ---------------------------------------------------------------------------------------------

export type PlanStep =
  | { goto: [number, number]; note?: string }
  | { collect: 'reachable' | [number, number][]; note?: string; exclude?: [number, number][] }
  | { swap: true }
  | { interact: true }
  | { meow: true }
  | { wait: number }
  /**
   * Backtracking: run `steps`; if they fail (no path, spotted, interact did nothing), rewind and
   * retry after an extra WAIT_TICKS of standing still, up to `waitUpTo` ticks. Use it where the
   * right moment to start matters, e.g. meowing when a patrol is out of earshot.
   */
  | { try: PlanStep[]; waitUpTo: number; note?: string };

/** Ticks one planned tile move is held (centre to centre from rest). */
export const MOVE_TICKS = CAT_TICKS_PER_TILE;
if (!Number.isInteger(MOVE_TICKS)) throw new Error(`solver: CAT_TICKS_PER_TILE ${MOVE_TICKS} is not an integer`);
/** Granularity of planned waits (lets the cat line up with guard timings). */
export const WAIT_TICKS = 3;
const DIRS4: Vec2i[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function mkInput(dx: number, dy: number, extra: Partial<Input> = {}): Input {
  return { ...NO_INPUT, dx: dx as Axis, dy: dy as Axis, ...extra };
}

/** Turn-schedule periods of the level's sentries (0 for other guards), per level. */
const periodsCache = new WeakMap<LevelDef, number[]>();
function sentryPeriods(level: LevelDef): number[] {
  let p = periodsCache.get(level);
  if (!p) {
    p = level.guards.map((g) => sentryPeriod(g));
    periodsCache.set(level, p);
  }
  return p;
}

/**
 * Dedupe key: everything that matters for future evolution except monotonically growing counters.
 * Turning sentries follow the global clock, so their schedule phase (tick mod period) is part of it.
 */
function nodeKey(level: LevelDef, s: SimState): string {
  const a = s.cats[s.activeIndex];
  const o = s.cats[1 - s.activeIndex];
  let k = `${a.pos.x},${a.pos.y}|${o.pos.x},${o.pos.y}|${s.coinsCollected}|${s.hasKey ? 1 : 0}${s.rescued ? 1 : 0}|`;
  for (const d of s.doorsOpen) k += d ? '1' : '0';
  for (const g of s.guards as SimGuard[]) {
    const mt = g.mode === 'PATROL' ? 0 : g.modeTicks;
    k += `|${g.pos.x},${g.pos.y},${g.facing.x},${g.facing.y},${g.mode[0]},${mt},${g.waypointIndex},${g.waitTicks}`;
  }
  k += `|${s.rng}`;
  for (const p of sentryPeriods(level)) if (p) k += `|${s.tick % p}`;
  return k;
}

class MinHeap<T> {
  private a: { f: number; h: number; n: number; v: T }[] = [];
  private seq = 0;
  get size(): number {
    return this.a.length;
  }
  push(f: number, h: number, v: T): void {
    const a = this.a;
    a.push({ f, h, n: this.seq++, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top.v;
  }
  private less(x: { f: number; h: number; n: number }, y: { f: number; h: number; n: number }): boolean {
    return x.f !== y.f ? x.f < y.f : x.h !== y.h ? x.h < y.h : x.n < y.n;
  }
}

interface Node {
  state: SimState;
  parent: Node | null;
  input: Input;
  ticks: number;
}

export interface LegResult {
  inputs: Input[];
  state: SimState;
  expanded: number;
}

/**
 * A* for the active cat from its current tile centre to `goal`, never getting any cat spotted.
 * Returns null if no plan exists within `maxNodes` expansions.
 */
export function planGoto(level: LevelDef, start: SimState, goal: Vec2i, maxNodes = 2_000_000): LegResult | null {
  const c = compileLevel(level);
  const spotted0 = start.spottedCount;
  const hOf = (s: SimState) => {
    const t = tileOf(s.cats[s.activeIndex].pos);
    return (Math.abs(t.x - goal.x) + Math.abs(t.y - goal.y)) * MOVE_TICKS;
  };
  const open = new MinHeap<Node>();
  const best = new Map<string, number>();
  const root: Node = { state: start, parent: null, input: NO_INPUT, ticks: 0 };
  open.push(hOf(start), hOf(start), root);
  best.set(nodeKey(level, start), start.tick);
  let expanded = 0;
  while (open.size) {
    const n = open.pop()!;
    const s = n.state;
    const cat = s.cats[s.activeIndex];
    const t = tileOf(cat.pos);
    if (s.won || (t.x === goal.x && t.y === goal.y && atCenter(cat.pos))) {
      const inputs: Input[] = [];
      for (let m: Node | null = n; m && m.parent; m = m.parent) for (let k = 0; k < m.ticks; k++) inputs.push(m.input);
      inputs.reverse();
      return { inputs, state: s, expanded };
    }
    if (++expanded > maxNodes) return null;
    if (s.won) continue;
    const tryAction = (input: Input, ticks: number) => {
      let ns = s;
      for (let k = 0; k < ticks; k++) {
        ns = stepSim(level, ns, input);
        if (ns.spottedCount !== spotted0) return;
      }
      if (!ns.won && !atCenter(ns.cats[ns.activeIndex].pos)) return;
      const key = nodeKey(level, ns);
      const prev = best.get(key);
      if (prev !== undefined && prev <= ns.tick) return;
      best.set(key, ns.tick);
      const h = hOf(ns);
      open.push(ns.tick - start.tick + h, h, { state: ns, parent: n, input, ticks });
    };
    for (const d of DIRS4) if (isOpenTile(c, t.x + d.x, t.y + d.y, s.doorsOpen)) tryAction(mkInput(d.x, d.y), MOVE_TICKS);
    tryAction(NO_INPUT, WAIT_TICKS);
  }
  return null;
}

/** BFS path length (4-neighbour, cat-walkable with the current doors), -1 if unreachable. */
function walkDistance(level: LevelDef, s: SimState, from: Vec2i, to: Vec2i): number {
  const c = compileLevel(level);
  const dist = new Int32Array(c.w * c.h).fill(-1);
  const q: number[] = [from.y * c.w + from.x];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % c.w;
    const y = (i - x) / c.w;
    if (x === to.x && y === to.y) return dist[i];
    for (const d of DIRS4) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!isOpenTile(c, nx, ny, s.doorsOpen)) continue;
      const ni = ny * c.w + nx;
      if (dist[ni] < 0) {
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
  }
  return -1;
}

export interface PlanResult {
  log: InputLog;
  final: SimState;
  trace: string[];
}

export class PlanError extends Error {}

export function planSolution(
  level: LevelDef,
  script: PlanStep[],
  opts: { seed?: number; catIds?: [string, string]; log?: (s: string) => void } = {},
): PlanResult {
  const seed = opts.seed ?? 1;
  const catIds = opts.catIds ?? ['bob', 'oreo'];
  const say = opts.log ?? (() => {});
  const trace: string[] = [];
  let s = initSim(level, seed, catIds);
  const inputs: Input[] = [];
  // Notes are printed once the plan stands (failed `try` attempts are rewound out of the trace).
  const note = (m: string) => {
    trace.push(m);
  };
  const push = (inp: Input) => {
    s = stepSim(level, s, inp);
    inputs.push(inp);
    if (s.spottedCount) throw new PlanError(`spotted during a scripted action at tick ${s.tick}\n${renderAscii(level, s)}`);
  };
  const gotoTile = (goal: Vec2i, label: string) => {
    if (!atCenter(s.cats[s.activeIndex].pos)) throw new PlanError(`cat${s.activeIndex + 1} is not on a tile centre before ${label}`);
    const r = planGoto(level, s, goal);
    if (!r) throw new PlanError(`no path for ${label} to (${goal.x},${goal.y})\n${renderAscii(level, s)}`);
    inputs.push(...r.inputs);
    s = r.state;
    note(`t=${s.tick} cat${s.activeIndex + 1} ${label} -> (${goal.x},${goal.y}) [${r.expanded} nodes]`);
  };
  const runSteps = (steps: PlanStep[]): void => {
  for (const st of steps) {
    if ('try' in st) {
      const s0 = s;
      const n0 = inputs.length;
      const t0 = trace.length;
      let lastErr: unknown = null;
      let ok = false;
      for (let extra = 0; extra <= st.waitUpTo && !ok; extra += WAIT_TICKS) {
        s = s0;
        inputs.length = n0;
        trace.length = t0;
        try {
          for (let k = 0; k < extra; k++) push(NO_INPUT);
          runSteps(st.try);
          ok = true;
          if (extra) note(`  (${st.note ?? 'try'}: started after waiting ${extra} ticks)`);
        } catch (e) {
          if (!(e instanceof PlanError)) throw e;
          lastErr = e;
        }
      }
      if (!ok) throw lastErr instanceof PlanError ? new PlanError(`${st.note ?? 'try'} failed for every wait up to ${st.waitUpTo}: ${lastErr.message}`) : lastErr;
    } else if ('goto' in st) gotoTile({ x: st.goto[0], y: st.goto[1] }, st.note ?? 'goto');
    else if ('collect' in st) {
      const ex = new Set((st.exclude ?? []).map(([x, y]) => `${x},${y}`));
      const want = (): Vec2i[] => {
        const all =
          st.collect === 'reachable'
            ? s.coins.filter((co) => !co.taken).map((co) => co.tile)
            : st.collect.map(([x, y]) => ({ x, y })).filter((t) => s.coins.some((co) => !co.taken && co.tile.x === t.x && co.tile.y === t.y));
        return all.filter((t) => !ex.has(`${t.x},${t.y}`));
      };
      for (;;) {
        const here = tileOf(s.cats[s.activeIndex].pos);
        let bestT: Vec2i | null = null;
        let bestD = Infinity;
        for (const t of want()) {
          const d = walkDistance(level, s, here, t);
          if (d >= 0 && d < bestD) {
            bestD = d;
            bestT = t;
          }
        }
        if (!bestT) break;
        gotoTile(bestT, `${st.note ?? 'collect'} coin`);
      }
    } else if ('swap' in st) {
      push(mkInput(0, 0, { swap: true }));
      note(`t=${s.tick} swap -> cat${s.activeIndex + 1}`);
    } else if ('interact' in st) {
      const before = s.rescued;
      const doors = s.doorsOpen.join();
      push(mkInput(0, 0, { interact: true }));
      if (s.rescued === before && s.doorsOpen.join() === doors) throw new PlanError(`interact did nothing at tick ${s.tick}\n${renderAscii(level, s)}`);
      note(`t=${s.tick} interact (rescued=${s.rescued})`);
    } else if ('meow' in st) {
      push(mkInput(0, 0, { meow: true }));
      note(`t=${s.tick} meow`);
    } else if ('wait' in st) {
      for (let k = 0; k < st.wait; k++) push(NO_INPUT);
    }
  }
  };
  try {
    runSteps(script);
  } finally {
    for (const m of trace) say(m);
  }
  if (!s.won) throw new PlanError(`script finished without a win at tick ${s.tick}\n${renderAscii(level, s)}`);
  // Inputs after the winning tick are no-ops (the sim freezes on a win); drop them.
  inputs.length = s.tick;
  const log: InputLog = {
    levelId: level.id,
    simVersion: SIM_VERSION,
    seed,
    catIds,
    ticks: inputs.length,
    runs: encodeInputs(inputs),
    finalHash: s.hash,
    score: s.score,
    spottedCount: s.spottedCount,
    coins: s.coinsCollected,
  };
  // Independent check: replay from scratch.
  const r = replay(level, log);
  if (!r.final.won || r.final.hash !== s.hash) throw new PlanError('replay of the planned log diverged');
  return { log, final: s, trace };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export { LEVEL_SCRIPTS };

export interface SolveReport {
  proof: OneCatProof;
  plan: PlanResult;
}

/**
 * Plan and verify a winning run with `script`. When the level's meta says it needs both cats, first
 * prove that a lone cat cannot finish it (throws if it can).
 */
export function solveLevel(level: LevelDef, script: PlanStep[], log: (s: string) => void = () => {}): SolveReport {
  const proof = proveOneCatUnsolvable(level);
  log('One-cat proof:');
  for (const line of proof.argument) log('  ' + line);
  if (level.meta.twoCatRequired && !proof.unsolvable) throw new PlanError(`${level.id} is marked twoCatRequired but one cat can finish it`);
  const plan = planSolution(level, script, { log: (m) => log('  ' + m) });
  if (plan.final.spottedCount !== 0) throw new PlanError(`${level.id}: planned run was spotted`);
  if (plan.log.ticks > level.meta.parTicks) throw new PlanError(`${level.id}: plan takes ${plan.log.ticks} ticks, over par ${level.meta.parTicks}`);
  return { proof, plan };
}

export async function main(ids: string[] = process.argv.slice(2).filter((a) => !a.startsWith('-'))): Promise<void> {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  const { loadLevel } = await import('../src/sim/level');
  const todo = ids.length ? ids : Object.keys(LEVEL_SCRIPTS);
  const rows: string[] = [];
  for (const id of todo) {
    const script = LEVEL_SCRIPTS[id];
    if (!script) throw new Error(`no solver script for level ${id} (add it to LEVEL_SCRIPTS)`);
    const level = loadLevel(JSON.parse(readFileSync(join(root, `src/levels/${id}.json`), 'utf8')));
    console.log(`== ${id}`);
    const t0 = Date.now();
    const { plan: res, proof } = solveLevel(level, script, (m) => console.log(m));
    rows.push(
      `${id.padEnd(9)} ${String(res.log.ticks).padStart(5)} / par ${String(level.meta.parTicks).padStart(5)} ticks  coins ${res.final.coinsCollected}/${level.coins.length}  score ${String(res.final.score).padStart(3)}  one-cat ${proof.unsolvable ? 'impossible' : 'possible'}  hash ${res.final.hash}`,
    );
    const secs = (res.log.ticks / 30).toFixed(1);
    console.log(
      `Plan: ${res.log.ticks} ticks (${secs}s), coins ${res.final.coinsCollected}/${level.coins.length}, score ${res.final.score}, spotted ${res.final.spottedCount}, hash ${res.final.hash} [${Date.now() - t0} ms]`,
    );
    writeFileSync(join(root, `src/levels/${id}.solution.json`), JSON.stringify(res.log) + '\n');
    console.log(`wrote src/levels/${id}.solution.json`);
  }
  console.log('\nSummary:\n' + rows.join('\n'));
}
