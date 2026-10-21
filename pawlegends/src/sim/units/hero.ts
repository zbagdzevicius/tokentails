/**
 * Heroes: orders (move, attack, attack-move, stop, cast, trick, nap, talent), A* walking, basic attacks, forced
 * movement and CC, Nap (recall), death and respawn. Abilities resolve through heroes/kit.ts. Bots (slots 1..5) are
 * M3 and idle until then, but they still auto-attack what walks into their attack range.
 */
import { FOUNTAIN, HERO_SPAWNS, MAP, NAV, RADIUS, mirrorX } from '../../data/map';
import { HERO_RULES, ZOOMIES } from '../../data/xp';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import { NO_TARGET, Op, type Command } from '../api';
import { ANGLE_STEPS, clamp, dist2, iatan2, isqrt, moveToward } from '../fixed';
import { findPath } from '../nav/astar';
import type { MatchHandle } from '../state';
import { FM, G, Kind, NEVER, Order, RANGE, UnitState, type World } from '../world';
import { inAttackRange, startAttack } from '../combat/attack';
import { clearStatus, disabled, interrupt } from '../effects/status';
import { fleeStep } from '../effects/fear';
import { stepForced } from '../effects/dash';
import { aimHunt, kitOf, orderCast, walkInDone, walkInX, walkInY, TRICK_SLOT } from '../heroes/kit';
import { planted } from '../heroes/brutus';
import { chooseTalent } from '../heroes/talents';
import { attackRange, moveSpeed, radiusOf, targetable } from './kinds';

const out = new Int32Array(3);

const spawnX = (w: World, id: number): number => {
  const x = HERO_SPAWNS[id % HERO_SPAWNS.length].x;
  return w.team[id] === 0 ? x : mirrorX(x);
};
const spawnY = (id: number): number => HERO_SPAWNS[id % HERO_SPAWNS.length].y;

/** Send hero `id` to its fountain spawn point (respawn, Nap). */
function toSpawn(w: World, id: number): void {
  w.x[id] = spawnX(w, id);
  w.y[id] = spawnY(id);
  w.moveX[id] = w.x[id];
  w.moveY[id] = w.y[id];
  w.moveCarry[id] = 0;
  w.facing[id] = w.team[id] === 0 ? 0 : ANGLE_STEPS >> 1;
  w.state[id] = UnitState.Idle;
  w.order[id] = Order.None;
  w.target[id] = -1;
  w.windup[id] = 0;
  w.pathLen[id] = 0;
  w.pathIdx[id] = 0;
  w.timer[id] = 0;
}

/** Put hero `id` at its fountain at full HP (match start and respawn), with Zoomies. */
export function placeAtFountain(w: World, id: number): void {
  w.alive[id] = 1;
  w.zoomT[id] = ZOOMIES.ticks;
  w.hp[id] = w.maxHp[id];
  toSpawn(w, id);
  w.attackTimer[id] = 0;
  w.lastHitBy[id] = -1;
  w.hurtTick[id] = NEVER;
  w.kHurt[id] = NEVER;
  w.castPhase[id] = 0;
  w.castT[id] = 0;
  w.napT[id] = 0;
  clearStatus(w, id);
  kitOf(w, id).reset?.(w, id);
}

function planPath(m: MatchHandle, id: number, tx: number, ty: number): void {
  const w = m.world;
  const r = findPath(m.grid, w.x[id], w.y[id], tx, ty, w.pathX, w.pathY, id * NAV.maxPathPoints);
  w.pathLen[id] = r.count;
  w.pathIdx[id] = 0;
  w.timer[id] = NAV.repathEvery;
}

/** A new order cancels a walk-in cast and Nap (not a cast already winding up). */
function cancelSoft(w: World, id: number): void {
  if (w.castPhase[id] === 1) w.castPhase[id] = 0;
  if (w.napT[id] > 0) {
    w.napT[id] = 0;
    w.state[id] = UnitState.Idle;
  }
}

/** Apply a (quantised) command to hero `id`. Commands to a dead hero are ignored, except talent picks. */
export function applyOrder(m: MatchHandle, id: number, cmd: Command): void {
  const w = m.world;
  if (cmd.op === Op.Talent) {
    chooseTalent(m, id, cmd.tier, cmd.choice);
    return;
  }
  if (w.alive[id] === 0) return;
  switch (cmd.op) {
    case Op.Move:
    case Op.AttackMove: {
      cancelSoft(w, id);
      w.moveX[id] = clamp(cmd.x, 0, MAP.width);
      w.moveY[id] = clamp(cmd.y, 0, MAP.height);
      w.order[id] = cmd.op === Op.Move ? Order.Move : Order.AttackMove;
      w.target[id] = -1;
      w.windup[id] = 0;
      planPath(m, id, w.moveX[id], w.moveY[id]);
      if (w.castPhase[id] === 0) w.state[id] = UnitState.Moving;
      break;
    }
    case Op.Attack: {
      if (cmd.id >= RANGE.end || !targetable(w, cmd.id, w.team[id])) break;
      cancelSoft(w, id);
      w.order[id] = Order.Attack;
      w.target[id] = cmd.id;
      w.pathLen[id] = 0;
      w.timer[id] = 0;
      break;
    }
    case Op.Stop:
      cancelSoft(w, id);
      w.order[id] = Order.None;
      w.target[id] = -1;
      w.windup[id] = 0;
      w.pathLen[id] = 0;
      w.moveX[id] = w.x[id];
      w.moveY[id] = w.y[id];
      if (w.castPhase[id] === 0) w.state[id] = UnitState.Idle;
      break;
    case Op.Cast:
      orderCast(m, id, cmd.slot, cmd.x, cmd.y, cmd.id);
      break;
    case Op.Trick:
      orderCast(m, id, TRICK_SLOT, cmd.x, cmd.y, NO_TARGET);
      break;
    case Op.Nap:
      if (disabled(w, id) || w.fmKind[id] !== FM.None || w.castPhase[id] === 2) break;
      interrupt(w, id, false);
      w.order[id] = Order.None;
      w.target[id] = -1;
      w.pathLen[id] = 0;
      w.napT[id] = HERO_RULES.napChannel;
      w.state[id] = UnitState.Napping;
      break;
    default:
      break;
  }
}

/**
 * Nearest targetable enemy (heroes, minions, structures) by edge distance: within `reach` mm, or within attack range
 * when `attackOnly`. −1 when none. Hidden units are not targetable (map/brush.ts), so they are never acquired.
 */
function nearestEnemy(w: World, id: number, reach: number, attackOnly: boolean): number {
  const team = w.team[id];
  const x = w.x[id];
  const y = w.y[id];
  const own = attackOnly ? attackRange(w, id) + radiusOf(w, id) : reach;
  let best = -1;
  let bestD = 0;
  for (let e = 0; e < RANGE.fountains; e++) {
    if (w.alive[e] === 0 || w.team[e] === team || w.team[e] > 1) continue;
    const dx = w.x[e] - x;
    const dy = w.y[e] - y;
    const d2 = dx * dx + dy * dy;
    const r = own + radiusOf(w, e);
    if (d2 > r * r || !targetable(w, e, team)) continue;
    const d = isqrt(d2) - radiusOf(w, e);
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Is (x, y) inside the fountain of hero `id`'s enemy (its radius + a hero radius)? */
function inEnemyFountain(w: World, id: number, x: number, y: number): boolean {
  const fx = w.team[id] === 0 ? mirrorX(FOUNTAIN.x) : FOUNTAIN.x;
  const r = FOUNTAIN.radius + RADIUS.hero;
  return dist2(x, y, fx, FOUNTAIN.y) <= r * r;
}

/** One tick along the hero's path toward (moveX, moveY). Returns true on arrival at the goal. Rooted or planted: stays. */
function walk(m: MatchHandle, id: number): boolean {
  const w = m.world;
  // Sim v10 (GAPS B6): Sir Brutus in his Guard Post holds still like a root.
  if (w.rootT[id] > 0 || planted(w, id)) {
    w.state[id] = UnitState.Idle;
    return false;
  }
  const base = id * NAV.maxPathPoints;
  if (w.pathIdx[id] >= w.pathLen[id]) {
    if (dist2(w.x[id], w.y[id], w.moveX[id], w.moveY[id]) <= NAV.reach * NAV.reach) return true;
    if (w.timer[id] > 0) return false;
    planPath(m, id, w.moveX[id], w.moveY[id]);
    if (w.pathLen[id] === 0) return true; // nowhere to go
  }
  let tx = w.pathX[base + w.pathIdx[id]];
  const ty = w.pathY[base + w.pathIdx[id]];
  // Gate barrier (§5): no hero crosses its team's x = 8 m line toward the enemy before it drops.
  let gated = false;
  if (w.globals[G.Tick] < TIMELINE.barrierDrop) {
    const gate = w.team[id] === 0 ? MAP.barrierX : mirrorX(MAP.barrierX);
    const c = w.team[id] === 0 ? Math.min(tx, gate) : Math.max(tx, gate);
    gated = c !== tx;
    tx = c;
  }
  if (tx !== w.x[id] || ty !== w.y[id]) w.facing[id] = iatan2(ty - w.y[id], tx - w.x[id]);
  const arrived = moveToward(w.x[id], w.y[id], tx, ty, moveSpeed(w, id), w.moveCarry[id], TICK_HZ, out);
  // The enemy fountain is a wall (v4): a hero stops at its edge instead of walking into its fire.
  if (inEnemyFountain(w, id, out[0], out[1]) && !inEnemyFountain(w, id, w.x[id], w.y[id])) {
    w.state[id] = UnitState.Idle;
    return false;
  }
  w.x[id] = out[0];
  w.y[id] = out[1];
  w.moveCarry[id] = out[2];
  w.state[id] = UnitState.Moving;
  if (arrived && !gated) {
    w.pathIdx[id]++;
    if (w.pathIdx[id] >= w.pathLen[id] && dist2(w.x[id], w.y[id], w.moveX[id], w.moveY[id]) <= NAV.reach * NAV.reach) return true;
  }
  return false;
}

/**
 * Chase (tx, ty): re-path toward it every NAV.repathEvery ticks. (moveX, moveY) keep the attack-move goal, which the
 * hero walks on to once the target is gone.
 */
function chase(m: MatchHandle, id: number, tx: number, ty: number): void {
  const w = m.world;
  if (w.timer[id] === 0 || w.pathIdx[id] >= w.pathLen[id]) planPath(m, id, tx, ty);
  walk(m, id);
}

function swingAt(w: World, id: number, t: number): void {
  w.facing[id] = iatan2(w.y[t] - w.y[id], w.x[t] - w.x[id]);
  if (!startAttack(w, id, t)) w.state[id] = UnitState.Attacking;
}

/** Forced movement: dashes, knockbacks, homing dashes, with the kit's per-tick hook. */
function forcedStep(m: MatchHandle, id: number): void {
  const w = m.world;
  aimHunt(m, id);
  if (w.fmKind[id] === FM.None) return;
  const kind = w.fmKind[id];
  stepForced(w, id);
  w.state[id] = UnitState.Moving;
  if (kind !== FM.Knock) kitOf(w, id).onDashTick?.(m, id);
}

/** Nap: channel, then home to the fountain. */
function napStep(w: World, id: number): void {
  w.state[id] = UnitState.Napping;
  if (--w.napT[id] > 0) return;
  toSpawn(w, id);
}

/** Step 4 for heroes: respawn timers, CC, forced movement, casts walking in, orders, movement, swing starts. */
export function stepHeroes(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.kind[id] !== Kind.Hero) continue;
    if (w.alive[id] === 0) {
      if (w.timer[id] > 0) w.timer[id]--;
      if (w.timer[id] === 0) {
        placeAtFountain(w, id);
        m.events.push({ type: 'buff', tick: w.globals[G.Tick], id, kind: 'zoomies', ticks: ZOOMIES.ticks });
      }
      continue;
    }
    if (w.timer[id] > 0) w.timer[id]--;
    if (w.fmKind[id] !== FM.None) {
      forcedStep(m, id);
      continue;
    }
    if (w.stunT[id] > 0) {
      w.state[id] = UnitState.Idle;
      continue;
    }
    if (w.fearT[id] > 0) {
      fleeStep(w, m.grid, id);
      w.state[id] = UnitState.Moving;
      continue;
    }
    if (w.napT[id] > 0) {
      napStep(w, id);
      continue;
    }
    if (w.castPhase[id] === 2) {
      if (w.castT[id] > 0) w.state[id] = UnitState.Casting;
      continue;
    }
    if (w.castPhase[id] === 1) {
      if (!walkInDone(m, id)) chase(m, id, walkInX(w, id), walkInY(w, id));
      continue;
    }
    if (w.windup[id] > 0) continue; // mid-swing
    const order = w.order[id];
    if (order === Order.Attack) {
      const t = w.target[id];
      if (t < 0 || !targetable(w, t, w.team[id])) {
        w.order[id] = Order.None;
        w.target[id] = -1;
        w.state[id] = UnitState.Idle;
        continue;
      }
      if (inAttackRange(w, id, t)) swingAt(w, id, t);
      else chase(m, id, w.x[t], w.y[t]);
      continue;
    }
    if (order === Order.AttackMove) {
      let t = w.target[id];
      if (t < 0 || !targetable(w, t, w.team[id])) t = nearestEnemy(w, id, HERO_RULES.acquireRange, false);
      w.target[id] = t;
      if (t >= 0) {
        if (inAttackRange(w, id, t)) swingAt(w, id, t);
        else chase(m, id, w.x[t], w.y[t]);
        continue;
      }
      if (walk(m, id)) {
        w.order[id] = Order.None;
        w.state[id] = UnitState.Idle;
      }
      continue;
    }
    if (order === Order.Move) {
      if (walk(m, id)) {
        w.order[id] = Order.None;
        w.state[id] = UnitState.Idle;
      }
      continue;
    }
    // Idle: hit whatever is already in attack range (no chasing).
    const t = nearestEnemy(w, id, 0, true);
    w.target[id] = t;
    if (t >= 0) swingAt(w, id, t);
    else w.state[id] = UnitState.Idle;
  }
}
