/**
 * Heroes: orders (move, attack, attack-move, stop, cast, trick, nap, talent), A* walking, basic attacks, forced
 * movement and CC, Nap (recall), death and respawn. Abilities resolve through heroes/kit.ts. Bots (slots 1..5) are
 * M3 and idle until then, but they still auto-attack what walks into their attack range.
 */
import { FOUNTAIN, HERO_SPAWNS, MAP, MAX_HEROES, NAV, RADIUS, mirrorX, mirrorY } from '../../data/map';
import { HERO_RULES, ZOOMIES } from '../../data/xp';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import { NO_TARGET, Op, type Command } from '../api';
import { ANGLE_STEPS, clamp, dist2, iatan2, isqrt, moveToward } from '../fixed';
import { findPath } from '../nav/astar';
import { cellOfTeam, walkable } from '../map/grid';
import type { MatchHandle } from '../state';
import { FM, G, Kind, NEVER, Order, RANGE, UnitState, type World } from '../world';
import { inAttackRange, startAttack } from '../combat/attack';
import { cancelSwing } from '../combat/swing';
import { clearStatus, disabled, interrupt } from '../effects/status';
import { fleeStep } from '../effects/fear';
import { stepForced } from '../effects/dash';
import { aimHunt, kitBusy, kitOf, orderCast, walkInDone, walkInX, walkInY, TRICK_SLOT } from '../heroes/kit';
import { planted } from '../heroes/brutus';
import { chooseTalent } from '../heroes/talents';
import { attackRange, moveSpeed, radiusOf, targetable } from './kinds';
import { cannonWinding, orderFire } from './cannon';

const out = new Int32Array(3);

// Sim v19: on a point map team 1's spawn k mirrors team 0's across the river, (x, y) → (W − y, H − x).
const spawnX = (w: World, id: number): number => {
  const p = HERO_SPAWNS[id % HERO_SPAWNS.length];
  return w.team[id] === 0 ? p.x : MAP.point === 1 ? MAP.width - p.y : mirrorX(p.x);
};
const spawnY = (w: World, id: number): number => {
  const p = HERO_SPAWNS[id % HERO_SPAWNS.length];
  return w.team[id] === 0 ? p.y : MAP.point === 1 ? MAP.height - p.x : mirrorY(p.y);
};

/** Send hero `id` to its fountain spawn point (respawn, Nap). */
function toSpawn(w: World, id: number): void {
  w.x[id] = spawnX(w, id);
  w.y[id] = spawnY(w, id);
  w.moveX[id] = w.x[id];
  w.moveY[id] = w.y[id];
  w.moveCarry[id] = 0;
  // Sim v19: on a point map the heroes face up the diagonal (team 0 north-east, team 1 south-west).
  w.facing[id] = (w.team[id] === 0 ? 0 : ANGLE_STEPS >> 1) + (MAP.point === 1 ? ANGLE_STEPS >> 3 : 0);
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
  // Sim v16 (MAP-GAPS B15): with its team, so the path routes round the enemy fountain.
  const r = findPath(m.grid, w.x[id], w.y[id], tx, ty, w.pathX, w.pathY, id * NAV.maxPathPoints, w.team[id]);
  w.pathLen[id] = r.count;
  w.pathIdx[id] = 0;
  w.timer[id] = NAV.repathEvery;
  // Sim v16 (MAP-GAPS B4): this path cannot reach the goal (an overflowed search may still, so it is re-planned).
  w.pathDone[id] = !r.complete && r.expansions <= NAV.maxExpand ? 1 : 0;
}

/** A new order cancels a walk-in cast and Nap (not a cast already winding up). */
function cancelSoft(w: World, id: number): void {
  if (w.castPhase[id] === 1) w.castPhase[id] = 0;
  if (w.napT[id] > 0) {
    w.napT[id] = 0;
    w.state[id] = UnitState.Idle;
  }
}

/**
 * Sim v20 (V20-CHASE.md S1; LoL Wiki "Basic attack": "There exists a grace period of one game-tick before a champion's
 * attack windup completes", in which a move or stop no longer cancels it): a new command cancels the swing and gives
 * the attack timer back, except in the swing's last tick, when it lands first.
 */
function dropSwing(w: World, id: number): void {
  if (w.windup[id] > 1) cancelSwing(w, id);
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
      // Sim v20 (V20-CHASE.md S2): an attack-move mid-swing on a unit it may still hit keeps that swing (re-issuing the
      // attack never restarts the windup); only the goal changes, and the hero keeps chasing its current target.
      // An attack-move clicked on (or right by) the unit it is already attacking keeps that unit too, between swings
      // (desktop A-click spam on a fleeing hero: LoL/WR keep the attack; a re-acquire could pick a tower or minion).
      if (cmd.op === Op.AttackMove && w.target[id] >= 0 && targetable(w, w.target[id], w.team[id]) && (w.windup[id] > 0 || clickedOn(w, id, w.target[id]))) {
        w.order[id] = Order.AttackMove;
        w.pathLen[id] = 0;
        w.pathIdx[id] = 0;
        w.timer[id] = 0;
        break;
      }
      w.order[id] = cmd.op === Op.Move ? Order.Move : Order.AttackMove;
      dropSwing(w, id);
      if (w.windup[id] === 0) w.target[id] = -1;
      // Sim v16 (MAP-GAPS B3): during forced movement the hero re-plans on landing (dash.ts stepForced), not from here.
      if (w.fmKind[id] === FM.None) planPath(m, id, w.moveX[id], w.moveY[id]);
      else {
        w.pathLen[id] = 0;
        w.pathIdx[id] = 0;
      }
      if (w.castPhase[id] === 0) w.state[id] = UnitState.Moving;
      break;
    }
    case Op.Attack: {
      if (cmd.id >= RANGE.end || !targetable(w, cmd.id, w.team[id])) break;
      cancelSoft(w, id);
      // Sim v20 (V20-CHASE.md S2): the same attack again (a held or re-tapped ATK, right-click spam) changes nothing.
      if (w.order[id] === Order.Attack && w.target[id] === cmd.id) break;
      // another unit is a new command: a swing at the old one stops and the timer comes back. No last-tick grace here:
      // the swing reads w.target when it lands, so a kept windup would land on the new unit instead of the old one.
      if (w.target[id] !== cmd.id) cancelSwing(w, id);
      w.order[id] = Order.Attack;
      w.target[id] = cmd.id;
      w.pathLen[id] = 0;
      w.timer[id] = 0;
      break;
    }
    case Op.Kite: {
      // KITE-FIX (docs/plans/moba/KITE-FIX.md): no unit to keep attacking is a plain move
      if (cmd.id >= RANGE.end || !targetable(w, cmd.id, w.team[id])) {
        applyOrder(m, id, { op: Op.Move, x: cmd.x, y: cmd.y });
        break;
      }
      cancelSoft(w, id);
      // another unit is a new command (the swing at the old one stops, its timer comes back); the same unit keeps the
      // windup in progress, so a held stick re-sending its kite never throws a swing away
      if (w.target[id] !== cmd.id) cancelSwing(w, id);
      w.order[id] = Order.Kite;
      w.target[id] = cmd.id;
      w.moveX[id] = clamp(cmd.x, 0, MAP.width);
      w.moveY[id] = clamp(cmd.y, 0, MAP.height);
      if (w.fmKind[id] === FM.None && w.windup[id] === 0) planPath(m, id, w.moveX[id], w.moveY[id]);
      else {
        w.pathLen[id] = 0;
        w.pathIdx[id] = 0;
        w.timer[id] = 0;
      }
      break;
    }
    case Op.Stop:
      cancelSoft(w, id);
      w.order[id] = Order.None;
      dropSwing(w, id);
      if (w.windup[id] === 0) w.target[id] = -1;
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
    case Op.Fire:
      orderFire(m, id, cmd.x, cmd.y);
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
 * Sim v20 (V20-CHASE.md S2): is hero `id`'s new attack-move point on its current target (within the target's radius +
 * HERO_RULES.amoveClick mm of its centre), while it already has an attack order on it?
 */
function clickedOn(w: World, id: number, t: number): boolean {
  if (w.order[id] !== Order.Attack && w.order[id] !== Order.AttackMove) return false;
  const r = radiusOf(w, t) + HERO_RULES.amoveClick;
  return dist2(w.moveX[id], w.moveY[id], w.x[t], w.y[t]) <= r * r;
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
  const fy = w.team[id] === 0 ? mirrorY(FOUNTAIN.y) : FOUNTAIN.y;
  const r = FOUNTAIN.radius + RADIUS.hero;
  return dist2(x, y, fx, fy) <= r * r;
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
    // Sim v16 (MAP-GAPS B4): at the end of a path that cannot reach the goal (a structure, a wall): as close as it gets.
    if (w.pathLen[id] > 0 && w.pathDone[id] === 1) return true;
    if (w.timer[id] > 0) return false;
    planPath(m, id, w.moveX[id], w.moveY[id]);
    if (w.pathLen[id] === 0) return true; // nowhere to go
  }
  const tx = w.pathX[base + w.pathIdx[id]];
  const ty = w.pathY[base + w.pathIdx[id]];
  if (tx !== w.x[id] || ty !== w.y[id]) w.facing[id] = iatan2(ty - w.y[id], tx - w.x[id]);
  let arrived = moveToward(w.x[id], w.y[id], tx, ty, moveSpeed(w, id), w.moveCarry[id], TICK_HZ, out);
  // Gate barrier (§5): no hero crosses its team's x = 8 m line toward the enemy before it drops. Sim v16 (MAP-GAPS
  // B2): the hero steps toward the real path point and the stepped position is clamped; when the clamp bites it keeps
  // its old y too, so it waits at the barrier instead of sliding along it into the forest or its own tower.
  let gated = false;
  if (w.globals[G.Tick] < TIMELINE.barrierDrop && MAP.point === 1) {
    // Sim v19 (point map): the barrier is the diagonal x + y = barrierSum (team 1: its reflection); a step across it
    // is refused (the hero waits at the line).
    const sum = out[0] + out[1];
    if (w.team[id] === 0 ? sum > MAP.barrierSum : sum < MAP.width + MAP.height - MAP.barrierSum) {
      gated = true;
      out[0] = w.x[id];
      out[1] = w.y[id];
    }
  } else if (w.globals[G.Tick] < TIMELINE.barrierDrop) {
    const gate = w.team[id] === 0 ? MAP.barrierX : mirrorX(MAP.barrierX);
    const c = w.team[id] === 0 ? Math.min(out[0], gate) : Math.max(out[0], gate);
    if (c !== out[0]) {
      gated = true;
      out[0] = c;
      out[1] = w.y[id];
    }
  }
  // The enemy fountain is a wall (v4): a hero does not walk into its fire. Sim v25: it slides along the edge (the x
  // step alone, else the y step alone) instead of stopping dead there, as a path point just past the fountain's rim
  // could hold a walking hero still until its order changed.
  if (inEnemyFountain(w, id, out[0], out[1]) && !inEnemyFountain(w, id, w.x[id], w.y[id])) {
    if (out[0] !== w.x[id] && !inEnemyFountain(w, id, out[0], w.y[id]) && walkable(m.grid, cellOfTeam(out[0], w.y[id], w.team[id]))) out[1] = w.y[id];
    else if (out[1] !== w.y[id] && !inEnemyFountain(w, id, w.x[id], out[1]) && walkable(m.grid, cellOfTeam(w.x[id], out[1], w.team[id]))) out[0] = w.x[id];
    else {
      w.state[id] = UnitState.Idle;
      return false;
    }
    arrived = false;
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

/**
 * An attack order on target `t` (founder bug 2026-11-08, chasing). The swing starts within attack range +
 * HERO_RULES.chaseLeeway. While the attack timer runs, the hero stands only while `t` is in attack range and follows it
 * otherwise, so a target walking away at the same speed is still in reach when the next swing is ready (it used to gain
 * the whole attack interval). A faster or dashing target still opens the gap and gets away.
 */
function engage(m: MatchHandle, id: number, t: number): void {
  const w = m.world;
  // only a hero that can step closes the leeway: rooted or planted (Guard Post), it would land from range + leeway
  const leeway = w.rootT[id] > 0 || planted(w, id) ? 0 : HERO_RULES.chaseLeeway;
  if (inAttackRange(w, id, t, leeway) && (w.attackTimer[id] === 0 || inAttackRange(w, id, t))) {
    swingAt(w, id, t);
    // a swing started in the leeway steps on with the target from its first tick (no stand-still tick lost per swing)
    if (w.windup[id] > 0) followSwing(m, id);
  } else chase(m, id, w.x[t], w.y[t]);
}

/**
 * KITE-FIX (docs/plans/moba/KITE-FIX.md; Wild Rift: hold Attack and steer with the joystick): an attack order on
 * `target` that walks toward (moveX, moveY) while the attack timer runs, instead of standing. The tick the timer is
 * ready with the target within attack range + the chase leeway, the hero swings (and stands through the windup); out
 * of reach it keeps walking (the stick wins, nothing is chased). At the goal it stands, the order kept. A target that
 * is gone leaves a plain move to the goal.
 */
function kite(m: MatchHandle, id: number): void {
  const w = m.world;
  const t = w.target[id];
  if (t < 0 || !targetable(w, t, w.team[id])) {
    w.order[id] = Order.Move;
    w.target[id] = -1;
    if (walk(m, id)) {
      w.order[id] = Order.None;
      w.state[id] = UnitState.Idle;
    }
    return;
  }
  const leeway = w.rootT[id] > 0 || planted(w, id) ? 0 : HERO_RULES.chaseLeeway;
  if (w.attackTimer[id] === 0 && inAttackRange(w, id, t, leeway)) {
    swingAt(w, id, t);
    if (w.windup[id] > 0) {
      // a swing started in the leeway steps on with the target (its chase path replaces the goal's until it lands)
      w.pathLen[id] = 0;
      w.pathIdx[id] = 0;
      w.timer[id] = 0;
      followSwing(m, id);
      return;
    }
  }
  if (walk(m, id)) w.state[id] = UnitState.Idle;
}

/** Mid-swing with an attack order: step after a target that left attack range, still facing it and swinging. */
function followSwing(m: MatchHandle, id: number): void {
  const w = m.world;
  const t = w.target[id];
  if (t < 0 || !targetable(w, t, w.team[id]) || inAttackRange(w, id, t)) return;
  chase(m, id, w.x[t], w.y[t]);
  w.facing[id] = iatan2(w.y[t] - w.y[id], w.x[t] - w.x[id]);
  w.state[id] = UnitState.Attacking;
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
  if (kind !== FM.Knock && kind !== FM.Leap) kitOf(w, id).onDashTick?.(m, id);
}

/** Nap: channel, then home to the fountain. */
function napStep(w: World, id: number): void {
  w.state[id] = UnitState.Napping;
  if (--w.napT[id] > 0) return;
  toSpawn(w, id);
}

/** Start-of-tick hero positions and each hero's staged step (scratch, never carried between ticks). */
const tickX = new Int32Array(MAX_HEROES);
const tickY = new Int32Array(MAX_HEROES);
const nextX = new Int32Array(MAX_HEROES);
const nextY = new Int32Array(MAX_HEROES);

/**
 * Step 4 for heroes: respawn timers, CC, forced movement, casts walking in, orders, movement, swing starts.
 * Sim v16 (PvP side bias): every hero reads the others where the tick started. Each hero steps with the others at their
 * start-of-tick positions, its own step is staged, and all steps land together, so team 1 (higher ids) no longer sees
 * team 0's step first and starts its swing a tick earlier. During this step a hero writes only its own position.
 */
export function stepHeroes(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    tickX[id - RANGE.heroes] = w.x[id];
    tickY[id - RANGE.heroes] = w.y[id];
  }
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    const k = id - RANGE.heroes;
    stepHero(m, id);
    nextX[k] = w.x[id];
    nextY[k] = w.y[id];
    w.x[id] = tickX[k];
    w.y[id] = tickY[k];
  }
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    w.x[id] = nextX[id - RANGE.heroes];
    w.y[id] = nextY[id - RANGE.heroes];
  }
}

function stepHero(m: MatchHandle, id: number): void {
  const w = m.world;
  if (w.kind[id] !== Kind.Hero) return;
  if (w.alive[id] === 0) {
    if (w.timer[id] > 0) w.timer[id]--;
    if (w.timer[id] === 0) {
      placeAtFountain(w, id);
      m.events.push({ type: 'buff', tick: w.globals[G.Tick], id, kind: 'zoomies', ticks: ZOOMIES.ticks });
    }
    return;
  }
  if (w.timer[id] > 0) w.timer[id]--;
  if (w.fmKind[id] !== FM.None) {
    forcedStep(m, id);
    return;
  }
  if (w.stunT[id] > 0) {
    w.state[id] = UnitState.Idle;
    return;
  }
  if (w.fearT[id] > 0) {
    fleeStep(w, m.grid, id);
    w.state[id] = UnitState.Moving;
    return;
  }
  // Sim v14: Bravo playing dead and Chili in his purse stay put and start nothing (orders wait).
  if (kitBusy(w, id)) {
    w.state[id] = UnitState.Idle;
    return;
  }
  if (w.napT[id] > 0) {
    napStep(w, id);
    return;
  }
  // Sim v21: planted while winding the Kibble Cannon up (orders wait).
  if (cannonWinding(w, id)) {
    w.state[id] = UnitState.Casting;
    return;
  }
  if (w.castPhase[id] === 2) {
    if (w.castT[id] > 0) w.state[id] = UnitState.Casting;
    return;
  }
  if (w.castPhase[id] === 1) {
    if (!walkInDone(m, id)) chase(m, id, walkInX(w, id), walkInY(w, id));
    return;
  }
  const order = w.order[id];
  if (w.windup[id] > 0) {
    // mid-swing. Founder bug 2026-11-08: with an attack order the hero keeps pace with a target walking out of range
    // during the windup (MLBB's follow), so the swing lands instead of the target gaining a windup's walk each swing.
    if (order === Order.Attack || order === Order.AttackMove || order === Order.Kite) followSwing(m, id);
    // KITE-FIX: the swing lands this tick (step 5); the walk after it plans afresh toward the kite goal
    if (order === Order.Kite && w.windup[id] === 1) {
      w.pathLen[id] = 0;
      w.pathIdx[id] = 0;
      w.timer[id] = 0;
    }
    return;
  }
  if (order === Order.Kite) {
    kite(m, id);
    return;
  }
  if (order === Order.Attack) {
    const t = w.target[id];
    if (t < 0 || !targetable(w, t, w.team[id])) {
      w.order[id] = Order.None;
      w.target[id] = -1;
      w.state[id] = UnitState.Idle;
      return;
    }
    engage(m, id, t);
    return;
  }
  if (order === Order.AttackMove) {
    let t = w.target[id];
    // Sim v20 (V20-CHASE.md S2): never shorter than what the hero could swing at (attack range + its radius + the
    // chase leeway), so a long-range hero attack-moving acquires a unit already in its reach.
    if (t < 0 || !targetable(w, t, w.team[id])) t = nearestEnemy(w, id, Math.max(HERO_RULES.acquireRange, attackRange(w, id) + radiusOf(w, id) + HERO_RULES.chaseLeeway), false);
    w.target[id] = t;
    if (t >= 0) {
      engage(m, id, t);
      return;
    }
    if (walk(m, id)) {
      w.order[id] = Order.None;
      w.state[id] = UnitState.Idle;
    }
    return;
  }
  if (order === Order.Move) {
    // Sim v20 (V20-CHASE.md S1): a Move in a swing's last tick let that swing land; the walking hero then lets go of
    // its target (Stilts' auto-pounce and the bots read it).
    w.target[id] = -1;
    if (walk(m, id)) {
      w.order[id] = Order.None;
      w.state[id] = UnitState.Idle;
    }
    return;
  }
  // Idle: hit whatever is already in attack range (no chasing).
  const t = nearestEnemy(w, id, 0, true);
  w.target[id] = t;
  if (t >= 0) swingAt(w, id, t);
  else w.state[id] = UnitState.Idle;
}
