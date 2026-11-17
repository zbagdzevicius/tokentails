/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md §3–§6): how the in-sim bots play the pool maps' objectives. Called by the brain
 * below retreat, the fights, the back-off and ping orders, beside Pudding and above the camps and the lane. Stateless:
 * every think reads the world again (no new bot memory, nothing new hashed).
 *
 * Returns PLAN.None (no opinion), PLAN.Move (walk to out[0], out[1]) or PLAN.Attack (hit out[2]).
 */
import { ACTIVE_MAP, MAP, mirrorX } from '../../data/map';
import { OBJECTIVE_BOT as OB_BOT } from '../../data/objectives';
import { BP_ONE, dist2, idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { GEM_ROWS, G, Kind, OB, OBF, RANGE, SHRINE_ROW, YARN_STATE, YF, type World } from '../world';
import { cellOf, lineClear, walkable } from '../map/grid';
import { seenEnemy } from './sense';
import { shrineX, teamGems } from '../units/objective';
import { yarnAt, yarnCount } from '../units/yarn';

export const OBJ_PLAN = Object.freeze({ None: 0, Move: 1, Attack: 2 } as const);

const ROAM = 2;
const roamer = (id: number): boolean => id % 3 === ROAM;

/** Visible enemy heroes of `team` within `r` of (x, y). */
function enemiesNear(w: World, team: number, x: number, y: number, r: number): number {
  let n = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) if (w.alive[e] === 1 && seenEnemy(w, team, e) && dist2(w.x[e], w.y[e], x, y) <= r * r) n++;
  return n;
}
/** Allied heroes alive of `team` within `r` of (x, y). */
function alliesNear(w: World, team: number, x: number, y: number, r: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.alive[h] === 1 && w.team[h] === team && dist2(w.x[h], w.y[h], x, y) <= r * r) n++;
  return n;
}
function heroesAlive(w: World, team: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.alive[h] === 1 && w.team[h] === team) n++;
  return n;
}
/** A stand point in a disc for slot `id`, so three bots on it do not stack (a third of the radius off centre). */
function standIn(id: number, x: number, y: number, r: number, out: Int32Array): void {
  const k = id % 3;
  const d = idiv(r, 3);
  out[0] = x + (k === 0 ? -d : k === 1 ? d : 0);
  out[1] = y + (k === 2 ? d : 0);
}

export function objectivePlan(m: MatchHandle, id: number, hp: number, minHp: number, out: Int32Array): number {
  const w = m.world;
  const o = ACTIVE_MAP.objective;
  if (o === undefined || w.ob.length === 0) return OBJ_PLAN.None;
  if (o.kind === 'gems') return gemPlan(m, id, hp, minHp, out);
  if (hp < minHp) return OBJ_PLAN.None;
  if (o.kind === 'mill') return millPlan(w, id, out);
  if (o.kind === 'shrines') return shrinePlan(w, id, out);
  return ballPlan(m, id, out);
}

// ---------------------------------------------------------------------------------------------------------------

function millPlan(w: World, id: number, out: Int32Array): number {
  const o = ACTIVE_MAP.objective!;
  const b = OB.Obj;
  if (w.ob[b + OBF.MillState] !== 1) return OBJ_PLAN.None;
  const team = w.team[id];
  const r = o.r;
  const mine = alliesNear(w, team, o.x, o.y, r);
  const foes = enemiesNear(w, team, o.x, o.y, r + r);
  const pt = w.ob[b + OBF.ProgTeam];
  const go = roamer(id)
    ? w.ob[b + OBF.Pot] >= OB_BOT.millPot || mine > 0 || pt === 1 - team
    : dist2(w.x[id], w.y[id], o.x, o.y) <= OB_BOT.millJoin * OB_BOT.millJoin && (mine > 0 || pt === 1 - team) && (foes > 0 || pt === 1 - team);
  if (!go) return OBJ_PLAN.None;
  standIn(id, o.x, o.y, r, out);
  return OBJ_PLAN.Move;
}

// ---------------------------------------------------------------------------------------------------------------

function shrinePlan(w: World, id: number, out: Int32Array): number {
  const o = ACTIVE_MAP.objective!;
  const tick = w.globals[G.Tick];
  if (tick < o.first) return OBJ_PLAN.None;
  const team = w.team[id];
  const range2 = OB_BOT.shrineRange * OB_BOT.shrineRange;
  // Own shrine first (s = team), then the enemy's.
  for (let pass = 0; pass < 2; pass++) {
    const s = pass === 0 ? team : 1 - team;
    const r = OB.Obj + s * SHRINE_ROW;
    if (w.ob[r] === team || tick < w.ob[r + 3]) continue;
    const x = shrineX(s);
    const near = dist2(w.x[id], w.y[id], x, o.y) <= range2;
    const threatened = w.ob[r + 2] === 1 - team;
    let go: boolean;
    if (pass === 0) go = roamer(id) || (near && threatened);
    else go = roamer(id) && (heroesAlive(w, 1 - team) <= 1 || alliesNear(w, team, x, o.y, OB_BOT.shrineAllyRange) >= OB_BOT.shrineAllies || near);
    if (!go) continue;
    standIn(id, x, o.y, o.r, out);
    return OBJ_PLAN.Move;
  }
  return OBJ_PLAN.None;
}

// ---------------------------------------------------------------------------------------------------------------

function gemPlan(m: MatchHandle, id: number, hp: number, minHp: number, out: Int32Array): number {
  const w = m.world;
  const o = ACTIVE_MAP.objective!;
  const team = w.team[id];
  const b = OB.Obj;
  const own = w.ob[b + (team === 0 ? OBF.Count0 : OBF.Count1)];
  const foe = w.ob[b + (team === 0 ? OBF.Count1 : OBF.Count0)];
  const carry = w.ob[b + OBF.Carry + id];
  // From Sunset the bots play for the core (the gem dance stalled endgames at the safety end).
  if (w.globals[G.Tick] >= w.globals[G.Sunset]) return OBJ_PLAN.None;
  // Our countdown: carriers hold behind the Gem Road.
  if (own >= 0 && carry > 0) {
    out[0] = team === 0 ? OB_BOT.gemHoldX : mirrorX(OB_BOT.gemHoldX);
    out[1] = o.y + (id % 3) * 1000 - 1000; // lint-sim: allow (a 1 m spread of three carriers)
    return OBJ_PLAN.Move;
  }
  // Their countdown: hunt the visible carrier with the most gems.
  if (foe >= 0 && hp >= minHp) {
    let best = -1;
    for (let e = RANGE.heroes; e < RANGE.minions; e++) {
      if (w.team[e] === team || w.alive[e] === 0 || !seenEnemy(w, team, e)) continue;
      if (best < 0 || w.ob[b + OBF.Carry + e] > w.ob[b + OBF.Carry + best]) best = e;
    }
    if (best >= 0 && w.ob[b + OBF.Carry + best] > 0) {
      out[2] = best;
      return OBJ_PLAN.Attack;
    }
  }
  if (hp < minHp) return OBJ_PLAN.None;
  // A carrier with a few gems keeps out of the arena (it still lanes).
  if (carry >= OB_BOT.gemCarrier && !roamer(id)) return OBJ_PLAN.None;
  // A ground gem in reach and safe.
  const reach = roamer(id) ? OB_BOT.gemRoam : OB_BOT.gemRange;
  let gx = 0;
  let gy = 0;
  let gd = -1;
  for (let g = 0; g < GEM_ROWS; g++) {
    const r = b + OBF.Ground + g * 3;
    if (w.ob[r] === 0) continue;
    const x = w.ob[r + 1];
    const y = w.ob[r + 2];
    const d = roamer(id) ? dist2(x, y, o.x, o.y) : dist2(w.x[id], w.y[id], x, y);
    if (d > reach * reach || enemiesNear(w, team, x, y, OB_BOT.gemSafe) > 0) continue;
    const dd = dist2(w.x[id], w.y[id], x, y);
    if (gd < 0 || dd < gd) {
      gd = dd;
      gx = x;
      gy = y;
    }
  }
  if (gd >= 0) {
    out[0] = gx;
    out[1] = gy;
    return OBJ_PLAN.Move;
  }
  // The roamer waits at its arena entrance while the team is short of gems.
  if (roamer(id) && teamGems(w, team) < o.gemNeed) {
    out[0] = team === 0 ? OB_BOT.gemWaitX : mirrorX(OB_BOT.gemWaitX);
    out[1] = o.y;
    return OBJ_PLAN.Move;
  }
  return OBJ_PLAN.None;
}

// ---------------------------------------------------------------------------------------------------------------

const dir = new Int32Array(2);

/** Unit direction (×BP_ONE) from (ax, ay) to (bx, by) into dir; false when they coincide. */
function unit(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const l = isqrt(dx * dx + dy * dy);
  if (l === 0) return false;
  dir[0] = idiv(dx * BP_ONE, l);
  dir[1] = idiv(dy * BP_ONE, l);
  return true;
}

function ballPlan(m: MatchHandle, id: number, out: Int32Array): number {
  const w = m.world;
  if (yarnCount(w) === 0) return OBJ_PLAN.None;
  if (w.globals[yarnAt(0, YF.State)] !== YARN_STATE.Rest) return OBJ_PLAN.None;
  const bx = w.globals[yarnAt(0, YF.X)];
  const by = w.globals[yarnAt(0, YF.Y)];
  const team = w.team[id];
  const r2 = OB_BOT.ballRange * OB_BOT.ballRange;
  const d = dist2(w.x[id], w.y[id], bx, by);
  if (d > r2 && !roamer(id)) return OBJ_PLAN.None;
  // Only the roamer and the team's nearest hero play the ball.
  if (!roamer(id)) {
    for (let h = RANGE.heroes; h < RANGE.minions; h++) {
      if (h === id || w.team[h] !== team || w.alive[h] === 0 || w.kind[h] !== Kind.Hero) continue;
      const dh = dist2(w.x[h], w.y[h], bx, by);
      if (dh < d || (dh === d && h < id)) return OBJ_PLAN.None;
    }
  }
  const g = ACTIVE_MAP.goalMouth!;
  const gy = (g[1] + g[3]) >> 1;
  const ownX = team === 0 ? (g[0] + g[2]) >> 1 : MAP.width - ((g[0] + g[2]) >> 1);
  const foeX = MAP.width - ownX;
  // Aim: clear a ball near the own goal toward the nearer touchline; else at the enemy goal (or beside a blocked line).
  const defend = dist2(bx, by, ownX, gy) <= OB_BOT.defend * OB_BOT.defend;
  let ok = false;
  if (defend) ok = unit(bx, by, bx + (foeX > ownX ? OB_BOT.side : -OB_BOT.side), by >= gy ? MAP.height : 0);
  else {
    for (let k = 0; k < 3 && !ok; k++) {
      const ty = gy + (k === 0 ? 0 : k === 1 ? OB_BOT.aimOffset : -OB_BOT.aimOffset);
      if (k < 2 && !lineClear(m.grid, bx, by, foeX, ty)) continue;
      ok = unit(bx, by, foeX, ty);
    }
  }
  if (!ok) return OBJ_PLAN.None;
  // Turn the kick until its approach point is on walkable ground (a ball resting against a wall).
  let ux = dir[0];
  let uy = dir[1];
  let found = false;
  for (let t = 0; t < 5 && !found; t++) {
    const ax = bx - idiv(ux * OB_BOT.behind, BP_ONE);
    const ay = by - idiv(uy * OB_BOT.behind, BP_ONE);
    // The walk-through point must be open too: a ball resting against a crate or wall is kicked off it, not into it
    // (a bot pressing into the crate stood stuck there, V34-MAPS.md §2b).
    const tx = bx + idiv(ux * OB_BOT.through, BP_ONE);
    const ty = by + idiv(uy * OB_BOT.through, BP_ONE);
    const open = (x: number, y: number): boolean => x > 0 && y > 0 && x < MAP.width && y < MAP.height && walkable(m.grid, cellOf(x, y));
    if (open(ax, ay) && open(tx, ty)) {
      found = true;
      break;
    }
    // rotate by ±45° alternately (cos 45° = 7071 bp)
    const s = t % 2 === 0 ? 1 : -1;
    const c = 7071; // lint-sim: allow (cos 45° in bp)
    const nx = idiv((ux - s * uy) * c, BP_ONE);
    const ny = idiv((uy + s * ux) * c, BP_ONE);
    ux = nx;
    uy = ny;
  }
  if (!found) return OBJ_PLAN.None;
  const ax = bx - idiv(ux * OB_BOT.behind, BP_ONE);
  const ay = by - idiv(uy * OB_BOT.behind, BP_ONE);
  // At the approach point: walk through the ball (the kick).
  if (dist2(w.x[id], w.y[id], ax, ay) <= OB_BOT.ready * OB_BOT.ready) {
    out[0] = bx + idiv(ux * OB_BOT.through, BP_ONE);
    out[1] = by + idiv(uy * OB_BOT.through, BP_ONE);
    return OBJ_PLAN.Move;
  }
  // Ahead of the ball (on the goal side): step round it first, out of kicking reach.
  const ahead = (w.x[id] - bx) * ux + (w.y[id] - by) * uy > OB_BOT.aheadSlack * BP_ONE;
  if (ahead) {
    const side = (w.x[id] - bx) * -uy + (w.y[id] - by) * ux >= 0 ? 1 : -1;
    const sx = bx + side * idiv(-uy * OB_BOT.side, BP_ONE);
    const sy = by + side * idiv(ux * OB_BOT.side, BP_ONE);
    if (walkable(m.grid, cellOf(sx, sy))) {
      out[0] = sx;
      out[1] = sy;
      return OBJ_PLAN.Move;
    }
  }
  out[0] = ax;
  out[1] = ay;
  return OBJ_PLAN.Move;
}
