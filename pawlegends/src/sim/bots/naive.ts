/**
 * The naive player-bot (`npm run match -- --profile naive`, the fun gates fun1 / fun2): a scripted stand-in for a
 * real first-timer, built from the 2026-10-17 playtest diagnosis instead of the first-match tips the novice follows.
 *
 * - Attack-moves to the nearest enemy hero within NAIVE.seekRange and chases it up to NAIVE.chaseRange, otherwise
 *   follows its wave in Sunny Lane.
 * - Ignores towers: it steps back only after NAIVE.towerHits consecutive tower hits AND below NAIVE.towerHpBp.
 * - Casts Q, E and R the moment they are ready, at the nearest enemy (a hero first, else a minion), ±25° aim.
 * - Walks home below 20% HP and comes back at 80%; never naps, never uses its Paw Trick or W.
 * - Walks over a pickup only within NAIVE.pickupRange.
 * - Hesitates: in 5% of its thinks it stands still for 0.5 to 2 s.
 * - Takes talent 1 at every offer.
 *
 * Calibration on sim v3 (vs Easy, 200 seeds, hero random; see tests/unit/naive.test.ts): see the comment there.
 * It reaches the sim only through commands, like a human.
 */
import { NAIVE } from '../../data/bots';
import { NO_TARGET, Op, type CastSlot, type Command } from '../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin, isqrt } from '../fixed';
import type { Rng } from '../rng';
import type { MatchHandle } from '../state';
import { G, Order, RANGE, TALENT_TIERS, type World } from '../world';
import { canCast } from '../heroes/kit';
import { unlockedTiers } from '../heroes/talents';
import type { BotMem } from './mem';
import { fountainX, fountainY, hpBp, laneFront, laneStructure, progressOf, seenEnemy, sign } from './sense';
import { nearestPickup } from '../units/pickup';

const SUNNY = 0;
const MODE_HOME = 1;
const HEROES_N = RANGE.minions - RANGE.heroes;

/** Nearest visible enemy hero within `r` that has been in view for the reaction time, or −1. */
function nearestHero(w: World, id: number, mem: BotMem, tick: number, r: number): number {
  const team = w.team[id];
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    const k = id * HEROES_N + e;
    if (!seenEnemy(w, team, e)) {
      mem.seen[k] = -1;
      continue;
    }
    if (mem.seen[k] < 0) mem.seen[k] = tick;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (d > r * r || tick - mem.seen[k] < NAIVE.reactionTicks) continue;
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Nearest visible enemy minion within `r`, or −1. */
function nearestMinion(w: World, id: number, r: number): number {
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.minions; e < RANGE.towers; e++) {
    if (!seenEnemy(w, w.team[id], e)) continue;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (d > r * r) continue;
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Has an enemy tower hit hero `id` NAIVE.towerHits times in a row (it is still shooting it)? */
function towerPounding(w: World, id: number): boolean {
  for (let t = RANGE.towers; t < RANGE.fountains; t++) {
    if (w.alive[t] === 0 || w.team[t] === w.team[id] || w.target[t] !== id) continue;
    if (w.shotAt[t] === id && w.streak[t] + 1 >= NAIVE.towerHits) return true;
  }
  return false;
}

/** A cast of `slot` aimed at unit `e` with the naive aim error. */
function castAt(w: World, id: number, slot: number, e: number, rng: Rng): Command {
  const d = Math.max(isqrt(dist2(w.x[id], w.y[id], w.x[e], w.y[e])), 1);
  const a = iatan2(w.y[e] - w.y[id], w.x[e] - w.x[id]) + rng.range(-NAIVE.aimErrorSteps, NAIVE.aimErrorSteps);
  const x = w.x[id] + idiv(icos(a) * d, TRIG_ONE);
  const y = w.y[id] + idiv(isin(a) * d, TRIG_ONE);
  return { op: Op.Cast, slot: slot as CastSlot, x, y, id: slot === 3 && e < RANGE.minions ? e : NO_TARGET };
}

export function naiveThink(m: MatchHandle, id: number, mem: BotMem, rng: Rng): Command | null {
  const w = m.world;
  const tick = w.globals[G.Tick];
  if (w.alive[id] === 0) {
    mem.mode[id] = 0;
    mem.foe[id] = -1;
    return null;
  }
  for (let t = 0; t < unlockedTiers(w, id); t++) {
    if (w.talents[id * TALENT_TIERS + t] < 0) return { op: Op.Talent, tier: t as 0 | 1 | 2, choice: 0 };
  }
  if (w.castPhase[id] !== 0) return null;
  // Hesitation: stand still (`slip` holds the tick it ends).
  if (mem.slip[id] > tick) return null;
  if (rng.chanceBp(NAIVE.idleBp)) {
    mem.slip[id] = tick + NAIVE.idleMin + rng.int(NAIVE.idleMax - NAIVE.idleMin + 1);
    return w.order[id] === 0 ? null : { op: Op.Stop };
  }
  const team = w.team[id];
  const hp = hpBp(w, id);
  if (mem.mode[id] === MODE_HOME && hp >= NAIVE.returnHpBp) mem.mode[id] = 0;
  const pounded = towerPounding(w, id);
  if (hp < NAIVE.retreatHpBp || (hp < NAIVE.towerHpBp && pounded)) mem.mode[id] = MODE_HOME;
  if (mem.mode[id] === MODE_HOME) {
    mem.foe[id] = -1;
    const hx = fountainX(team);
    if (w.order[id] === Order.Move && w.moveX[id] === hx) return null;
    return { op: Op.Move, x: hx, y: fountainY() };
  }
  // After NAIVE.towerHits tower hits in a row it finally backs off to its own tower (and forgets the chase).
  if (pounded) {
    mem.foe[id] = -1;
    const own = laneStructure(w, team, SUNNY, true);
    if (w.order[id] === Order.Move && w.moveX[id] === w.x[own]) return null;
    return { op: Op.Move, x: w.x[own], y: w.y[own] };
  }
  // Q, E, R the moment they are ready, at the nearest enemy (a hero first).
  let foe = mem.foe[id];
  if (foe >= 0 && (!seenEnemy(w, team, foe) || dist2(w.x[id], w.y[id], w.x[foe], w.y[foe]) > NAIVE.chaseRange * NAIVE.chaseRange)) foe = -1;
  const near = nearestHero(w, id, mem, tick, NAIVE.seekRange);
  if (foe < 0) foe = near;
  mem.foe[id] = foe;
  const aimAt = near >= 0 && dist2(w.x[id], w.y[id], w.x[near], w.y[near]) <= NAIVE.castRange * NAIVE.castRange ? near : nearestMinion(w, id, NAIVE.castRange);
  if (aimAt >= 0) {
    for (const slot of [0, 2, 3]) if (canCast(w, id, slot)) return castAt(w, id, slot, aimAt, rng);
  }
  // A pickup close by.
  const pk = nearestPickup(w, id, NAIVE.pickupRange);
  if (pk >= 0 && foe < 0) {
    const px = w.pkX[pk];
    const py = w.pkY[pk];
    if (w.order[id] === Order.Move && w.moveX[id] === px && w.moveY[id] === py) return null;
    return { op: Op.Move, x: px, y: py };
  }
  if (foe >= 0) {
    // Attack-move at the foe: it swings at whatever it meets on the way (a real first-timer clicks the ground).
    const fx = w.x[foe];
    const fy = w.y[foe];
    if (dist2(w.x[id], w.y[id], fx, fy) <= NAIVE.lockRange * NAIVE.lockRange) {
      if (w.order[id] === Order.Attack && w.target[id] === foe) return null;
      return { op: Op.Attack, id: foe };
    }
    if (w.order[id] === Order.AttackMove && Math.abs(w.moveX[id] - fx) < NAIVE.followBehind && Math.abs(w.moveY[id] - fy) < NAIVE.followBehind) return null;
    return { op: Op.AttackMove, x: fx, y: fy };
  }
  // Follow the wave in Sunny Lane.
  // (A wave still behind the own outer structure is not walked back to: it waits there in front of it.)
  const own = laneStructure(w, team, SUNNY, true);
  const front = laneFront(w, team, SUNNY);
  const ahead = front >= 0 && progressOf(team, w.x[front]) - NAIVE.followBehind > progressOf(team, w.x[own]) + NAIVE.followBehind;
  const gx = ahead ? w.x[front] - sign(team) * NAIVE.followBehind : w.x[own] + sign(team) * NAIVE.followBehind;
  const gy = ahead ? w.y[front] : w.y[own];
  if (w.order[id] === Order.AttackMove && Math.abs(w.moveX[id] - gx) < NAIVE.followBehind && Math.abs(w.moveY[id] - gy) < NAIVE.followBehind) return null;
  return { op: Op.AttackMove, x: gx, y: gy };
}
