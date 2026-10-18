/**
 * Rat camps (POC.md §5): one camp of two rats per side, the Purrhaven one at RAT_CAMP and the Woof one mirrored.
 * Up at 1:00 (TIMELINE.campsUp) and 60 s after both rats of a camp fell. Rats are neutral (team 2): they stand at
 * home until something hits them, then both rats of the camp chase the attacker. A rat more than the leash from
 * home drops its target, runs home and heals to full on arrival.
 */
import { RAT_CAMP_STATS } from '../../data/camps';
import { RAT_CAMP, mirrorX } from '../../data/map';
import { TICK_HZ } from '../../data/timeline';
import { ANGLE_STEPS, dist2, iatan2, moveToward } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, NEVER, RANGE, TEAM_NEUTRAL, UnitState, type World } from '../world';
import { clearStatus } from '../effects/status';
import { fleeStep } from '../effects/fear';
import { stepForced } from '../effects/dash';
import { inAttackRange, startAttack } from '../combat/attack';
import { moveSpeed, targetable } from './kinds';

const out = new Int32Array(3);
const CAMPS = 2;

/** Camp of rat `id` (0 Purrhaven side, 1 Woof side). */
export const campOf = (id: number): number => (id - RANGE.camps) >> 1;
/** Ids of camp `c`'s rats: first and first + 1. */
export const firstRat = (c: number): number => RANGE.camps + c * RAT_CAMP_STATS.rats;

export const campX = (c: number): number => (c === 0 ? RAT_CAMP.x : mirrorX(RAT_CAMP.x));
export const campY = (): number => RAT_CAMP.y;
const homeY = (id: number): number => RAT_CAMP.y + ((id - RANGE.camps) & 1 ? RAT_CAMP_STATS.spread : -RAT_CAMP_STATS.spread);

const atKey = (c: number): number => (c === 0 ? G.CampAt0 : G.CampAt1);

/** Match start: the rat slots exist (dead) so the snapshot kinds are right; the camps are due at campsUp. */
export function initCamps(w: World, firstAt: number): void {
  for (let id = RANGE.camps; id < RANGE.pudding; id++) {
    w.kind[id] = Kind.Camp;
    w.team[id] = TEAM_NEUTRAL;
    w.alive[id] = 0;
  }
  for (let c = 0; c < CAMPS; c++) w.globals[atKey(c)] = firstAt;
}

function spawnRat(w: World, id: number): void {
  const c = campOf(id);
  w.alive[id] = 1;
  w.hp[id] = RAT_CAMP_STATS.hp;
  w.maxHp[id] = RAT_CAMP_STATS.hp;
  w.armour[id] = RAT_CAMP_STATS.armour;
  w.shield[id] = 0;
  w.x[id] = campX(c);
  w.y[id] = homeY(id);
  w.moveX[id] = w.x[id];
  w.moveY[id] = w.y[id];
  w.moveCarry[id] = 0;
  w.facing[id] = c === 0 ? ANGLE_STEPS >> 1 : 0;
  w.state[id] = UnitState.Idle;
  w.target[id] = -1;
  w.attackTimer[id] = 0;
  w.windup[id] = 0;
  w.lastHitBy[id] = -1;
  w.hurtTick[id] = NEVER;
  w.buffs[id] = 0;
  w.waypoint[id] = 0;
  clearStatus(w, id);
}

/** Step 3: camps due now spawn. */
export function spawnCamps(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let c = 0; c < CAMPS; c++) {
    if (w.globals[atKey(c)] !== tick) continue;
    w.globals[atKey(c)] = -1;
    for (let k = 0; k < RAT_CAMP_STATS.rats; k++) spawnRat(w, firstRat(c) + k);
  }
}

/** Step 7: rat `id` died. When its camp is empty, schedule the respawn and return true. */
export function onRatDied(w: World, id: number): boolean {
  const c = campOf(id);
  for (let k = 0; k < RAT_CAMP_STATS.rats; k++) if (w.alive[firstRat(c) + k] === 1) return false;
  w.globals[atKey(c)] = w.globals[G.Tick] + RAT_CAMP_STATS.respawn;
  return true;
}

/** A camp cleared by `team`: its living heroes get the Pack buff (+15% damage for 45 s, a `buff` event each). */
export function packBuff(m: MatchHandle, team: number): void {
  const w = m.world;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== team || w.alive[h] === 0) continue;
    w.packT[h] = RAT_CAMP_STATS.packTicks;
    m.events.push({ type: 'buff', tick: w.globals[G.Tick], id: h, kind: 'pack', ticks: RAT_CAMP_STATS.packTicks });
  }
}

/** Is rat `id` still within its leash of home? */
function inLeash(w: World, id: number): boolean {
  const l = RAT_CAMP_STATS.leash;
  return dist2(w.x[id], w.y[id], campX(campOf(id)), campY()) <= l * l;
}

/**
 * Step 4 for rats: aggro, leash, chase and swing, or walk home. A rat takes aggro from whoever hit it (or its camp
 * mate's target) and chases while it is within its leash of home; past the leash it drops the target and walks home
 * (`waypoint` 1 = returning: no aggro on the way), healing to full on arrival.
 */
export function stepCamps(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let id = RANGE.camps; id < RANGE.pudding; id++) {
    if (w.alive[id] === 0) continue;
    if (w.fmKind[id] !== FM.None) {
      stepForced(w, id);
      continue;
    }
    if (w.stunT[id] > 0) continue;
    if (w.fearT[id] > 0) {
      fleeStep(w, m.grid, id);
      continue;
    }
    const returning = w.waypoint[id] === 1;
    let t = returning ? -1 : w.target[id];
    if (t >= 0 && !targetable(w, t, TEAM_NEUTRAL)) t = -1;
    if (!returning && !inLeash(w, id)) {
      t = -1;
      w.waypoint[id] = 1;
    } else if (!returning && t < 0) {
      const mate = RANGE.camps + ((id - RANGE.camps) ^ 1);
      const by = w.lastHitBy[id];
      if (by >= 0 && tick - w.hurtTick[id] <= 1 && by < RANGE.towers && targetable(w, by, TEAM_NEUTRAL)) t = by;
      else if (w.alive[mate] === 1 && w.waypoint[mate] === 0 && w.target[mate] >= 0 && targetable(w, w.target[mate], TEAM_NEUTRAL)) t = w.target[mate];
    }
    w.target[id] = t;
    if (w.windup[id] > 0) continue;
    if (t >= 0) {
      if (inAttackRange(w, id, t)) {
        w.facing[id] = iatan2(w.y[t] - w.y[id], w.x[t] - w.x[id]);
        startAttack(w, id, t);
        continue;
      }
      walk(w, id, w.x[t], w.y[t]);
      continue;
    }
    const hx = campX(campOf(id));
    const hy = homeY(id);
    if (w.x[id] === hx && w.y[id] === hy) {
      if (w.waypoint[id] === 1) {
        w.hp[id] = w.maxHp[id];
        w.waypoint[id] = 0;
      }
      w.state[id] = UnitState.Idle;
      continue;
    }
    walk(w, id, hx, hy);
  }
}

function walk(w: World, id: number, tx: number, ty: number): void {
  if (w.rootT[id] > 0) return;
  w.facing[id] = iatan2(ty - w.y[id], tx - w.x[id]);
  moveToward(w.x[id], w.y[id], tx, ty, moveSpeed(w, id), w.moveCarry[id], TICK_HZ, out);
  w.x[id] = out[0];
  w.y[id] = out[1];
  w.moveCarry[id] = out[2];
  w.state[id] = UnitState.Moving;
}
