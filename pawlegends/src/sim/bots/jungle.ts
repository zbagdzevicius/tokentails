/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §9): how bots use Hearthwood's carved jungle. Pure reads of the world
 * plus the bot's own jungle memory (`mem.jg`, JG_ROW per hero); no RNG. Every function writes a goal into `out` and
 * says what to do with it, and `brain.ts` turns that into a command.
 *
 * - The route graph (§9.1): team 0's south quadrant nodes copied to the four quadrants (the swap, the river mirror).
 *   Team 1's nodes are the river mirror of team 0's in the same order, so both teams make mirror-image choices.
 * - The Prowl (§9.2, BotParams.jungle ≥ 1): a fixed first clear ending at Grizzlechop, then on every think the best
 *   of: wait at its pit-mouth bush for an objective due within JUNGLE_BOT.objectiveSoon, gank a lane from an exit,
 *   invade an enemy buff (jungle 2), farm the nearest own camp. Rookie and Easy Prowls keep the v19 habit (brain.ts).
 * - The laners' danger read (§9.3): past the river with the enemy Prowl unseen for JUNGLE_BOT.dangerUnseen, a laner
 *   whose lane touches the quadrant it was last seen in backs off to its outer tower.
 * - Objective contests (§9.4): count the heroes at the pit; hold at the mouth bush when outnumbered, unless stealing.
 */
import { JUNGLE_BOT, JUNGLE_W, JNODE, PIT_WAITS, SOUTH_EDGES, SOUTH_NODES } from '../../data/maps/hearthwoodGraph';
import { CAMP_KIND, CAMP_KINDS, GRIZZLECHOP } from '../../data/camps';
import { CAMPS, MAP, PUDDING_SPOT } from '../../data/map';
import { PUD_STATE } from '../../data/pudding';
import { TIMELINE } from '../../data/timeline';
import type { BotParams } from '../../data/bots';
import { BP_ONE, dist2, idiv, isqrt } from '../fixed';
import { G, JG_ROW, MG, RANGE, type World } from '../world';
import { BOSS_CAMP, campDueAt, campSize, firstRat } from '../units/camp';
import { targetable } from '../units/kinds';
import type { BotMem } from './mem';
import { ROLE } from './roles';
import { hpBp, seenEnemy } from './sense';

/** Fields of a jungle memory row. */
export const JG = Object.freeze({ Step: 0, Gank: 1, Until: 2, SeenAt: 3, SeenX: 4, SeenY: 5, Hold: 6, MoveAt: 7 });

/** Copies of the south quadrant: 0 south and 1 west (team 0), 2 east and 3 north (team 1, the river mirrors). */
const QUADS = 4;
const PER = SOUTH_NODES.length;

/** Every node, quadrant-major (team 0's south, west, then team 1's east, north): kind, x, y. */
export const JUNGLE_NODES: readonly { readonly kind: number; readonly x: number; readonly y: number; readonly team: number }[] = (() => {
  const W = JUNGLE_W;
  const out: { kind: number; x: number; y: number; team: number }[] = [];
  for (let q = 0; q < QUADS; q++) {
    for (const [kind, x, y] of SOUTH_NODES) {
      // q 0: as authored; 1: swapped; 2: river mirror of south; 3: river mirror of west.
      const sx = q === 1 || q === 3 ? y : x;
      const sy = q === 1 || q === 3 ? x : y;
      out.push(Object.freeze({ kind, x: q >= 2 ? W - sy : sx, y: q >= 2 ? W - sx : sy, team: q >= 2 ? 1 : 0 }));
    }
  }
  return Object.freeze(out);
})();

/** Every edge, as node index pairs (each quadrant's corridors, plus the safe mid crossings between a team's two). */
export const JUNGLE_EDGES: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let q = 0; q < QUADS; q++) for (const [a, b] of SOUTH_EDGES) out.push([q * PER + a, q * PER + b]);
  const midSafe = SOUTH_NODES.findIndex((n) => n[0] === JNODE.MidSafe);
  out.push([midSafe, PER + midSafe], [2 * PER + midSafe, 3 * PER + midSafe]);
  return Object.freeze(out.map((e) => Object.freeze(e)));
})();

/** The fixed first clear (§9.2), as indices into team 0's camps: West Crow Roost, West Rat Nest, South Rat Nest,
 *  Prickle Hollow, the Beetle Log, the Frog Pond; then Grizzlechop. Team 1 uses the same camps + 8 (its mirrors). */
const FIRST_CLEAR = Object.freeze([4, 5, 1, 0, 3, 2]);
/** Camps per team on Hearthwood (two quadrants of four). */
const TEAM_CAMPS = 8;

/** The pit-mouth bush each team waits in for an objective (team 0: Grizzlechop's, the Great Pudding's; team 1 mirrored). */
const WAIT = Object.freeze(
  [0, 1].map((team) =>
    Object.freeze(
      PIT_WAITS.flatMap(([x, y]) => (team === 0 ? [x, y] : [JUNGLE_W - y, JUNGLE_W - x])),
    ),
  ),
);

/** Is the first clear over for bot `id`? */
export const firstClearDone = (mem: BotMem, id: number): boolean => mem.jg[id * JG_ROW + JG.Step] >= FIRST_CLEAR.length;

/** The enemy Prowl (role) of `team`'s enemy, or −1. */
function enemyProwl(w: World, team: number): number {
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === 1 - team && w.mg[MG.Role + h] === ROLE.Prowl) return h;
  return -1;
}

/** Remember where the enemy Prowl was last seen (a new memory starts with it at its fountain at 0:00). */
export function noteEnemyProwl(w: World, id: number, mem: BotMem): void {
  if (w.mg.length === 0) return;
  const r = id * JG_ROW;
  const e = enemyProwl(w, w.team[id]);
  if (e < 0) return;
  if (mem.jg[r + JG.SeenAt] === 0 && mem.jg[r + JG.SeenX] === 0) {
    mem.jg[r + JG.SeenX] = w.team[id] === 0 ? MAP.width : 0;
    mem.jg[r + JG.SeenY] = w.team[id] === 0 ? MAP.height : 0;
  }
  if (!seenEnemy(w, w.team[id], e)) return;
  mem.jg[r + JG.SeenAt] = w.globals[G.Tick];
  mem.jg[r + JG.SeenX] = w.x[e];
  mem.jg[r + JG.SeenY] = w.y[e];
}

/** Is any monster of camp `c` alive? */
function campUp(w: World, c: number): boolean {
  for (let k = 0; k < campSize(c); k++) if (w.alive[firstRat(c) + k] === 1) return true;
  return false;
}

/** The alive monster of camp `c` nearest bot `id`, or −1. */
function campMonster(w: World, id: number, c: number): number {
  let best = -1;
  let bestD = 0;
  for (let k = 0; k < campSize(c); k++) {
    const r = firstRat(c) + k;
    if (w.alive[r] === 0 || !targetable(w, r, w.team[id])) continue;
    const d = dist2(w.x[id], w.y[id], w.x[r], w.y[r]);
    if (best < 0 || d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** What `prowlPlan` asks for: nothing, walk to (out[0], out[1]), or attack out[2]. */
export const PLAN = Object.freeze({ None: 0, Move: 1, Attack: 2 });

/** Is an objective due soon (or up)? Writes the team's wait spot and the objective's centre into out[0..3]. */
function objectiveSoon(w: World, team: number, out: Int32Array): boolean {
  const tick = w.globals[G.Tick];
  const soon = JUNGLE_BOT.objectiveSoon;
  const spot = WAIT[team];
  if (BOSS_CAMP >= 0) {
    const due = campDueAt(w, BOSS_CAMP);
    const up = w.alive[firstRat(BOSS_CAMP)] === 1;
    if (!up && due > tick && due - tick <= soon && due <= GRIZZLECHOP.lastSpawn) {
      out[0] = spot[0];
      out[1] = spot[1];
      out[3] = CAMPS[BOSS_CAMP].x;
      out[4] = CAMPS[BOSS_CAMP].y;
      return true;
    }
  }
  if (w.globals[G.PudState] === PUD_STATE.Away) {
    const at = w.globals[G.PudAt];
    if (at > tick && at - tick <= soon) {
      out[0] = spot[2];
      out[1] = spot[3];
      out[3] = PUDDING_SPOT.x;
      out[4] = PUDDING_SPOT.y;
      return true;
    }
  }
  return false;
}

/**
 * Objective contest (§9.4): should bot `id` hold at its mouth bush instead of hitting the objective at (x, y) whose HP
 * share is `hp`? Holds when the visible enemy heroes within JUNGLE_BOT.objectiveCount outnumber ours (our Prowl counts
 * within objectiveProwl), unless it is a steal (the objective low and this bot close).
 */
export function holdObjective(w: World, id: number, x: number, y: number, hp: number, out: Int32Array): boolean {
  if (w.mg.length === 0) return false;
  const team = w.team[id];
  const r2 = JUNGLE_BOT.objectiveCount * JUNGLE_BOT.objectiveCount;
  const p2 = JUNGLE_BOT.objectiveProwl * JUNGLE_BOT.objectiveProwl;
  let ours = 0;
  let theirs = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.alive[h] === 0) continue;
    const d = dist2(w.x[h], w.y[h], x, y);
    if (w.team[h] === team) {
      if (d <= r2 || (w.mg[MG.Role + h] === ROLE.Prowl && d <= p2)) ours++;
    } else if (seenEnemy(w, team, h) && d <= r2) theirs++;
  }
  if (ours >= theirs) return false;
  // Far from the pit, keep walking to it (the count there changes on the way; a far hold would flip with other goals).
  const near = JUNGLE_BOT.holdNear * JUNGLE_BOT.holdNear;
  if (dist2(w.x[id], w.y[id], x, y) > near) return false;
  if (hp <= JUNGLE_BOT.stealHpBp && dist2(w.x[id], w.y[id], x, y) <= JUNGLE_BOT.stealRange * JUNGLE_BOT.stealRange) return false;
  const pud = dist2(x, y, PUDDING_SPOT.x, PUDDING_SPOT.y) < dist2(x, y, MAP.width - PUDDING_SPOT.x, MAP.height - PUDDING_SPOT.y);
  out[0] = WAIT[team][pud ? 2 : 0];
  out[1] = WAIT[team][pud ? 3 : 1];
  return true;
}

/**
 * A hold decided at the mouth bush (holdObjective) lasts JUNGLE_BOT.holdTicks (JG.Hold: the end tick × 2 + 1 for the
 * Great Pudding), so the bot does not flip between the bush and its other goals on every think.
 */
export function noteHold(w: World, id: number, mem: BotMem, pudding: boolean): void {
  mem.jg[id * JG_ROW + JG.Hold] = (w.globals[G.Tick] + JUNGLE_BOT.holdTicks) * 2 + (pudding ? 1 : 0);
}

/** Bot `id` is still holding at a mouth bush whose objective is up: writes the bush into out[0..1]. */
export function holding(w: World, id: number, mem: BotMem, out: Int32Array): boolean {
  if (w.mg.length === 0) return false;
  const v = mem.jg[id * JG_ROW + JG.Hold];
  if (v <= 0 || v >> 1 < w.globals[G.Tick]) return false;
  const pud = (v & 1) === 1;
  const up = pud ? w.globals[G.PudState] === PUD_STATE.Wild && w.alive[RANGE.pudding] === 1 : BOSS_CAMP >= 0 && w.alive[firstRat(BOSS_CAMP)] === 1;
  if (!up) {
    mem.jg[id * JG_ROW + JG.Hold] = 0;
    return false;
  }
  out[0] = WAIT[w.team[id]][pud ? 2 : 0];
  out[1] = WAIT[w.team[id]][pud ? 3 : 1];
  return true;
}

/** Exits of `team`'s two quadrants (lane and mid exits). */
const isExit = (k: number): boolean => k === JNODE.LaneSafe || k === JNODE.LaneRisky || k === JNODE.MidSafe || k === JNODE.MidRisky;

/**
 * A gank (§9.2 rule 1): an enemy hero visible within gankExit of one of our exits that our Prowl reaches within
 * gankReach, hurt or on our side of the river, with an ally of ours near it and no more enemies near it than our side
 * there plus the Prowl. The nearest such exit wins (ties: the lower node). Writes the exit into out[0..1], the target
 * into out[2]. `early` (the first clear): a nearer exit (earlyGankReach) and a hurt target only (earlyGankHpBp).
 */
function gankFor(w: World, id: number, out: Int32Array, early: boolean): boolean {
  const team = w.team[id];
  const reach = early ? JUNGLE_BOT.earlyGankReach : JUNGLE_BOT.gankReach;
  const reach2 = reach * reach;
  const exit2 = JUNGLE_BOT.gankExit * JUNGLE_BOT.gankExit;
  const hpMax = early ? JUNGLE_BOT.earlyGankHpBp : JUNGLE_BOT.gankHpBp;
  let best = -1;
  let bestD = 0;
  let bestT = -1;
  const first = team * 2 * PER;
  for (let n = first; n < first + 2 * PER; n++) {
    const node = JUNGLE_NODES[n];
    if (!isExit(node.kind)) continue;
    const d = dist2(w.x[id], w.y[id], node.x, node.y);
    if (d > reach2 || (best >= 0 && d >= bestD)) continue;
    for (let e = RANGE.heroes; e < RANGE.minions; e++) {
      if (!seenEnemy(w, team, e) || !targetable(w, e, team)) continue;
      if (dist2(w.x[e], w.y[e], node.x, node.y) > exit2) continue;
      const ourSide = team === 0 ? w.x[e] + w.y[e] < MAP.width : w.x[e] + w.y[e] > MAP.width;
      if (hpBp(w, e) > hpMax && (early || !ourSide)) continue;
      if (!gankOdds(w, id, e)) continue;
      best = n;
      bestD = d;
      bestT = e;
      break;
    }
  }
  if (best < 0) return false;
  out[0] = JUNGLE_NODES[best].x;
  out[1] = JUNGLE_NODES[best].y;
  out[2] = bestT;
  return true;
}

/** An ally of ours within gankAlly of enemy `e`, and no more enemies within gankCount of it than our side there + 1. */
function gankOdds(w: World, id: number, e: number): boolean {
  const team = w.team[id];
  const a2 = JUNGLE_BOT.gankAlly * JUNGLE_BOT.gankAlly;
  const c2 = JUNGLE_BOT.gankCount * JUNGLE_BOT.gankCount;
  let ally = false;
  let ours = 1;
  let theirs = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (h === id || w.alive[h] === 0) continue;
    const d = dist2(w.x[h], w.y[h], w.x[e], w.y[e]);
    if (w.team[h] === team) {
      if (d <= a2) ally = true;
      if (d <= c2) ours++;
    } else if (seenEnemy(w, team, h) && d <= c2) theirs++;
  }
  return ally && theirs <= ours;
}

/** A gank in progress (§9.2 rule 1): keep chasing its target until JG.Until, while it is seen; else forget it. */
function ganking(w: World, id: number, mem: BotMem, out: Int32Array): boolean {
  const r = id * JG_ROW;
  const g = mem.jg[r + JG.Gank] - 1;
  if (g < 0) return false;
  const team = w.team[id];
  if (w.globals[G.Tick] <= mem.jg[r + JG.Until] && seenEnemy(w, team, g) && targetable(w, g, team)) {
    out[0] = w.x[g];
    out[1] = w.y[g];
    out[2] = g;
    return true;
  }
  mem.jg[r + JG.Gank] = 0;
  return false;
}

/**
 * Start a gank (gankFor) and remember it: the walk to the target (JUNGLE_BOT.walkMmPerTick) plus JUNGLE_BOT.gankTicks. `early` (during the first clear): only a hurt target close to one of our exits.
 */
function startGank(w: World, id: number, mem: BotMem, out: Int32Array, early: boolean): boolean {
  if (!gankFor(w, id, out, early)) return false;
  const r = id * JG_ROW;
  const t = out[2];
  const d = isqrt(dist2(w.x[id], w.y[id], w.x[t], w.y[t]));
  mem.jg[r + JG.Gank] = t + 1;
  mem.jg[r + JG.Until] = w.globals[G.Tick] + idiv(d, JUNGLE_BOT.walkMmPerTick) + JUNGLE_BOT.gankTicks;
  return true;
}

/**
 * The Prowl's plan for this think (§9.2, BotParams.jungle ≥ 1), below the fights, retreat, orders and the objectives
 * that are up (brain.ts). Returns PLAN.Move with a goal in out[0..1], PLAN.Attack with a target in out[2], or None (the
 * lane, as before).
 */
export function prowlPlan(w: World, id: number, p: BotParams, mem: BotMem, out: Int32Array): number {
  const tick = w.globals[G.Tick];
  const team = w.team[id];
  const r = id * JG_ROW;
  // The first clear: camp by camp in a fixed order; a camp already taken (down and respawning) is skipped. On the way,
  // a gank on a hurt laner close to one of our exits is taken (JUNGLE_BOT.earlyGank*).
  while (mem.jg[r + JG.Step] < FIRST_CLEAR.length) {
    if (ganking(w, id, mem, out) || (tick >= TIMELINE.campsUp && startGank(w, id, mem, out, true))) return PLAN.Attack;
    const c = FIRST_CLEAR[mem.jg[r + JG.Step]] + team * TEAM_CAMPS;
    const due = campDueAt(w, c);
    if (tick < TIMELINE.campsUp || campUp(w, c) || (due >= 0 && due <= tick)) {
      const t = tick >= TIMELINE.campsUp ? campMonster(w, id, c) : -1;
      if (t >= 0) {
        out[2] = t;
        return PLAN.Attack;
      }
      out[0] = CAMPS[c].x;
      out[1] = CAMPS[c].y;
      return PLAN.Move;
    }
    mem.jg[r + JG.Step]++;
  }
  // An objective due soon: wait in the pit-mouth bush.
  if (objectiveSoon(w, team, out)) return PLAN.Move;
  // A gank in progress, or a new one.
  if (ganking(w, id, mem, out) || startGank(w, id, mem, out, false)) return PLAN.Attack;
  // Hard: invade an enemy buff while the enemy Prowl was seen far from it.
  if (p.jungle >= 2 && invade(w, id, mem, out)) return PLAN.Attack;
  return farm(w, id, out);
}

/** Hard (§9.2 rule 4): an enemy buff up (or due within invadeSoon) with the enemy Prowl seen recently far from it. */
function invade(w: World, id: number, mem: BotMem, out: Int32Array): boolean {
  const tick = w.globals[G.Tick];
  const team = w.team[id];
  const r = id * JG_ROW;
  if (tick - mem.jg[r + JG.SeenAt] > JUNGLE_BOT.invadeSeen || mem.jg[r + JG.SeenAt] === 0) return false;
  // Give up when the enemy shows up in numbers.
  const q2 = JUNGLE_BOT.invadeRetreat * JUNGLE_BOT.invadeRetreat;
  let near = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) if (seenEnemy(w, team, e) && dist2(w.x[e], w.y[e], w.x[id], w.y[id]) <= q2) near++;
  if (near >= JUNGLE_BOT.invadeQuit) return false;
  const far2 = JUNGLE_BOT.invadeFar * JUNGLE_BOT.invadeFar;
  const enemyFirst = (1 - team) * TEAM_CAMPS;
  for (let c = enemyFirst; c < enemyFirst + TEAM_CAMPS; c++) {
    const kind = CAMPS[c].kind;
    if (kind !== CAMP_KIND.prickle && kind !== CAMP_KIND.crow) continue;
    if (dist2(mem.jg[r + JG.SeenX], mem.jg[r + JG.SeenY], CAMPS[c].x, CAMPS[c].y) <= far2) continue;
    if (!campUp(w, c)) continue;
    const t = campMonster(w, id, c);
    if (t < 0) continue;
    out[2] = t;
    return true;
  }
  return false;
}

/** Farm (§9.2 rule 3): the nearest own camp that is up (a buff wins a near tie), else walk to one due soon. */
function farm(w: World, id: number, out: Int32Array): number {
  const tick = w.globals[G.Tick];
  const team = w.team[id];
  let best = -1;
  let bestD = 0;
  let soon = -1;
  let soonAt = 0;
  for (let c = team * TEAM_CAMPS; c < (team + 1) * TEAM_CAMPS; c++) {
    if (campUp(w, c)) {
      const buff = CAMPS[c].kind === CAMP_KIND.prickle || CAMPS[c].kind === CAMP_KIND.crow;
      const d = isqrt(dist2(w.x[id], w.y[id], CAMPS[c].x, CAMPS[c].y)) - (buff ? JUNGLE_BOT.buffBias : 0);
      if (best < 0 || d < bestD) {
        best = c;
        bestD = d;
      }
      continue;
    }
    const at = campDueAt(w, c);
    if (at > tick && at - tick <= JUNGLE_BOT.farmWait && (soon < 0 || at < soonAt)) {
      soon = c;
      soonAt = at;
    }
  }
  if (best >= 0) {
    const t = campMonster(w, id, best);
    if (t >= 0) {
      out[2] = t;
      return PLAN.Attack;
    }
  }
  if (soon >= 0) {
    out[0] = CAMPS[soon].x;
    out[1] = CAMPS[soon].y;
    return PLAN.Move;
  }
  return PLAN.None;
}

/**
 * The laners' danger read (§9.3, BotParams.jungle ≥ 1): bot `id` in `lane` past the river, the enemy Prowl unseen for
 * JUNGLE_BOT.dangerUnseen and last seen in a quadrant that touches `lane` (Fenceline: the two above the main diagonal;
 * Gutterway: the two below; Yarn Road: any).
 */
export function inDanger(w: World, id: number, mem: BotMem, lane: number): boolean {
  if (w.mg.length === 0) return false;
  const team = w.team[id];
  const past = team === 0 ? w.x[id] + w.y[id] > MAP.width : w.x[id] + w.y[id] < MAP.width;
  if (!past) return false;
  const r = id * JG_ROW;
  if (w.globals[G.Tick] - mem.jg[r + JG.SeenAt] < JUNGLE_BOT.dangerUnseen) return false;
  const sx = mem.jg[r + JG.SeenX];
  const sy = mem.jg[r + JG.SeenY];
  if (lane === 0) return sy >= sx;
  if (lane === 2) return sy <= sx;
  return true;
}

/** A camp's share of HP left (the objective-contest steal check reads it). */
export const unitHpBp = (w: World, u: number): number => (w.maxHp[u] > 0 ? idiv(Math.max(0, w.hp[u]) * BP_ONE, w.maxHp[u]) : 0);

/** For the tests and mapInfo: is camp index `c` (Hearthwood) a buff camp? */
export const isBuffCamp = (c: number): boolean => CAMP_KINDS[CAMPS[c].kind].name === 'prickle' || CAMP_KINDS[CAMPS[c].kind].name === 'crow';
