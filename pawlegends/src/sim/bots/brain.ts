/**
 * The bot brain (POC.md §7.2): a utility AI that runs every TIMELINE.botThinkEvery ticks per bot (staggered by
 * slot) and returns at most one command, which goes through the same order code as the human's.
 *
 * Priorities, highest first: retreat (HP under the difficulty's threshold; Nap when safe, escape casts and a
 * defensive Paw Trick when chased), fight an aware enemy hero when the local power check passes (abilities first,
 * then basics), back off from a bad fight or from untanked tower fire, contest Pudding, take the own rat camp (the
 * roamer), then the lane: last-hits, a tanked enemy structure, the wave, else stand behind the lane front (never
 * inside an enemy tower's reach unless a minion tanks it). From BotParams.groupAt the team groups in the push lane.
 *
 * Difficulty enters through BotParams: reaction delay (an enemy hero is acted on only after it has been in view
 * that long), skillshot aim error, mistakes (per think, a seeded roll: skip the last-hit, chase too far, ignore a
 * newly arrived enemy), retreat threshold, Paw Trick use, and how often Pudding is contested.
 *
 * Bots read the enemy only through sense.ts (`visibleTo`, the snapshot's own test).
 */
import { BOT_AI, BOT_MODE, type BotParams } from '../../data/bots';
import { RAT_CAMP_STATS } from '../../data/camps';
import { PUD_STATE } from '../../data/pudding';
import { TIMELINE } from '../../data/timeline';
import { HERO_RULES } from '../../data/xp';
import { Op, type Command } from '../api';
import { BP_ONE, applyBp, dist2, idiv, isqrt } from '../fixed';
import type { Rng } from '../rng';
import type { MatchHandle } from '../state';
import { G, Kind, Order, RANGE, type World } from '../world';
import { heroData, attackDamage, attackRange, radiusOf, targetable } from '../units/kinds';
import { firstRat } from '../units/camp';
import type { BotMem } from './mem';
import { clearCast, escapeCast, fightCast, nearestFoe, snackCast } from './casts';
import {
  fountainX,
  fountainY,
  hpBp,
  laneFront,
  laneStructure,
  laneTowers,
  ownCover,
  powerOf,
  progressOf,
  seenEnemy,
  sign,
  structReach,
  tanked,
  untankedThreat,
} from './sense';

const HEROES_N = RANGE.minions - RANGE.heroes;
const ROAM = 2;

/** Lane role by team slot: 0 Sunny, 1 Puddle, 2 roams (rat camp, then the lane that needs help). */
const roleOf = (id: number): number => id % 3;

const isRanged = (w: World, id: number): boolean => heroData(w, id).base.range > HERO_RULES.meleeMaxRange;

function moveTo(w: World, id: number, mem: BotMem, x: number, y: number): Command | null {
  const slack = BOT_AI.repeatSlack;
  if (mem.op[id] === Op.Move && Math.abs(mem.x[id] - x) <= slack && Math.abs(mem.y[id] - y) <= slack) {
    if (w.order[id] === Order.Move || dist2(w.x[id], w.y[id], x, y) <= slack * slack) return null;
  }
  mem.op[id] = Op.Move;
  mem.x[id] = x;
  mem.y[id] = y;
  mem.tid[id] = -1;
  return { op: Op.Move, x, y };
}

function attack(w: World, id: number, mem: BotMem, t: number): Command | null {
  if (w.order[id] === Order.Attack && w.target[id] === t) return null;
  mem.op[id] = Op.Attack;
  mem.tid[id] = t;
  return { op: Op.Attack, id: t };
}

/** Refresh the reaction-delay clock for every enemy hero; a mistake ignores a newly arrived one this think. */
function updateAwareness(w: World, id: number, mem: BotMem, tick: number, slip: boolean): void {
  const r2 = BOT_AI.awareRange * BOT_AI.awareRange;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    const k = id * HEROES_N + e;
    const inView = seenEnemy(w, w.team[id], e) && dist2(w.x[id], w.y[id], w.x[e], w.y[e]) <= r2;
    if (!inView) mem.seen[k] = -1;
    else if (mem.seen[k] < 0 && !slip) mem.seen[k] = tick;
  }
}

const aware = (mem: BotMem, id: number, e: number, tick: number, p: BotParams): boolean => {
  const t = mem.seen[id * HEROES_N + e];
  return t >= 0 && tick - t >= p.reactionTicks;
};

/** Power of `team`'s side around (x, y): allied heroes (all), or enemy heroes (visible only) when `enemy`. */
function sidePower(w: World, team: number, x: number, y: number, enemy: boolean): number {
  const r2 = BOT_AI.powerRange * BOT_AI.powerRange;
  let sum = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.alive[h] === 0) continue;
    if (enemy ? !seenEnemy(w, team, h) : w.team[h] !== team) continue;
    if (dist2(w.x[h], w.y[h], x, y) <= r2) sum += powerOf(w, h, BOT_AI.powerPerLevel);
  }
  return sum;
}

function goodFight(w: World, id: number, foe: number, p: BotParams): boolean {
  const team = w.team[id];
  const fx = w.x[foe];
  const fy = w.y[foe];
  let ours = sidePower(w, team, fx, fy, false);
  let theirs = sidePower(w, team, fx, fy, true);
  if (ownCover(w, team, fx, fy)) ours += BOT_AI.towerPower;
  if (untankedThreat(w, team, fx, fy, 0) >= 0) theirs += BOT_AI.towerPower;
  if (ours * BP_ONE >= theirs * p.fightPowerBp) return true;
  return hpBp(w, foe) < BOT_AI.finishHpBp && hpBp(w, id) > BOT_AI.objectiveHpBp;
}

/** The enemy hero to fight now, or −1. Sets `bad` to an aware enemy that is too strong to fight here. */
function pickFoe(w: World, id: number, mem: BotMem, p: BotParams, tick: number, slip: boolean, out: Int32Array): number {
  out[0] = -1;
  const team = w.team[id];
  let best = -1;
  let bestKey = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (!seenEnemy(w, team, e) || !aware(mem, id, e, tick, p) || !targetable(w, e, team)) continue;
    const d = isqrt(dist2(w.x[id], w.y[id], w.x[e], w.y[e]));
    const reach = BOT_AI.engageRange + (e === mem.foe[id] ? BOT_AI.chaseSlack : 0) + (slip ? BOT_AI.chaseSlack : 0);
    if (d > reach) continue;
    // Never chase into an untanked enemy tower, unless the foe is nearly dead or this is a mistake.
    if (!slip && hpBp(w, e) > BOT_AI.finishHpBp && untankedThreat(w, team, w.x[e], w.y[e], 0) >= 0) continue;
    if (!goodFight(w, id, e, p)) {
      if (out[0] < 0) out[0] = e;
      continue;
    }
    const key = Math.max(0, w.hp[e]) + idiv(d, BOT_AI.distWeight);
    if (best < 0 || key < bestKey) {
      best = e;
      bestKey = key;
    }
  }
  return best;
}

const scratch = new Int32Array(1);

/** Lane the team groups in from BotParams.groupAt: the fewest enemy towers left; tie: our wave is further on; tie: Sunny. */
export function pushLane(w: World, team: number): number {
  const a = laneTowers(w, 1 - team, 0);
  const b = laneTowers(w, 1 - team, 1);
  if (a !== b) return a < b ? 0 : 1;
  const fa = laneFront(w, team, 0);
  const fb = laneFront(w, team, 1);
  const pa = fa >= 0 ? progressOf(team, w.x[fa]) : 0;
  const pb = fb >= 0 ? progressOf(team, w.x[fb]) : 0;
  return pb > pa ? 1 : 0;
}

/** The lane bot `id` plays now. */
function laneFor(w: World, id: number, tick: number, groupAt: number): number {
  const team = w.team[id];
  if (tick >= groupAt) return pushLane(w, team);
  const role = roleOf(id);
  if (role !== ROAM) return role;
  // The roamer helps the lane with fewer own towers; tie: the one whose laner is hurt more.
  const a = laneTowers(w, team, 0);
  const b = laneTowers(w, team, 1);
  if (a !== b) return a < b ? 0 : 1;
  const base = team * 3;
  return hpBp(w, base + 1) < hpBp(w, base) ? 1 : 0;
}

/** May bot `id` hit enemy structure `s` (vulnerable) with no minion tanking it? Only bots that dive. */
function mayDive(w: World, id: number, s: number, p: BotParams): boolean {
  if (!p.dives || hpBp(w, id) < BOT_AI.diveHpBp) return false;
  if (w.kind[s] === Kind.Core || w.hp[s] <= BOT_AI.diveTowerHp) return true;
  const team = w.team[id];
  return w.globals[G.Tick] >= p.groupAt && heroesAlive(w, team) - heroesAlive(w, 1 - team) >= BOT_AI.pushAdvantage;
}

/** Heroes of `team` alive (the scoreboard shows who is down, so bots may read it). */
function heroesAlive(w: World, team: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === team && w.alive[h] === 1) n++;
  return n;
}

/** Stand-point in `lane`: behind the lane front, outside any untanked enemy tower. Writes [x, y]. */
function laneGoal(w: World, id: number, lane: number, p: BotParams, out: Int32Array): void {
  const team = w.team[id];
  const s = sign(team);
  const front = laneFront(w, team, lane);
  let gx: number;
  let gy: number;
  if (front >= 0) {
    gx = w.x[front] - s * (isRanged(w, id) ? BOT_AI.holdRanged : BOT_AI.holdMelee);
    gy = w.y[front];
  } else {
    const own = laneStructure(w, team, lane, true);
    gx = w.x[own] + s * BOT_AI.holdAhead;
    gy = w.y[own];
  }
  const t = untankedThreat(w, team, gx, gy, BOT_AI.towerMargin);
  if (t >= 0 && targetable(w, t, team) && mayDive(w, id, t, p)) {
    gx = w.x[t];
    gy = w.y[t];
  } else if (t >= 0) gx = w.x[t] - s * (structReach(w, t) + BOT_AI.towerMargin);
  out[0] = gx;
  out[1] = gy;
}

const goal = new Int32Array(2);

/** Lane work: last-hit, a tanked structure, the wave, else the stand-point. */
function laneAct(w: World, id: number, mem: BotMem, lane: number, slip: boolean, p: BotParams): Command | null {
  const team = w.team[id];
  const reach = attackRange(w, id) + radiusOf(w, id) + BOT_AI.farmReach;
  const hit = attackDamage(w, id);
  let lastHit = -1;
  let weakest = -1;
  for (let e = RANGE.minions; e < RANGE.towers; e++) {
    if (!seenEnemy(w, team, e)) continue;
    const r = reach + radiusOf(w, e);
    if (dist2(w.x[id], w.y[id], w.x[e], w.y[e]) > r * r) continue;
    if (untankedThreat(w, team, w.x[e], w.y[e], 0) >= 0) continue;
    const dealt = idiv(hit * HERO_RULES.armourBase, HERO_RULES.armourBase + w.armour[e]);
    if (w.hp[e] <= dealt && (lastHit < 0 || w.hp[e] < w.hp[lastHit])) lastHit = e;
    if (weakest < 0 || w.hp[e] < w.hp[weakest]) weakest = e;
  }
  if (lastHit >= 0 && !slip) return attack(w, id, mem, lastHit);
  if (p.structureFirst || weakest < 0) {
    for (let s = RANGE.towers; s < RANGE.fountains; s++) {
      if (w.alive[s] === 0 || w.team[s] === team || !targetable(w, s, team)) continue;
      if (!tanked(w, s, team) && !mayDive(w, id, s, p)) continue;
      const r = reach + radiusOf(w, s);
      if (dist2(w.x[id], w.y[id], w.x[s], w.y[s]) <= r * r) return attack(w, id, mem, s);
    }
  }
  if (weakest >= 0) return (p.waveClear ? clearCast(w, id, weakest) : null) ?? attack(w, id, mem, weakest);
  laneGoal(w, id, lane, p, goal);
  return moveTo(w, id, mem, goal[0], goal[1]);
}

function retreat(w: World, id: number, mem: BotMem, p: BotParams): Command | null {
  mem.mode[id] = BOT_MODE.Retreat;
  mem.foe[id] = -1;
  const threat = nearestFoe(w, id, BOT_AI.trickThreat);
  if (threat >= 0) {
    const c = escapeCast(w, id, threat, p);
    if (c) return c;
  }
  if (w.napT[id] > 0) return null;
  const team = w.team[id];
  const hx = fountainX(team);
  const hy = fountainY();
  const far = dist2(w.x[id], w.y[id], hx, hy) > BOT_AI.napMinDist * BOT_AI.napMinDist;
  if (far && nearestFoe(w, id, BOT_AI.napSafeRange) < 0) {
    mem.op[id] = Op.Nap;
    return { op: Op.Nap };
  }
  return moveTo(w, id, mem, hx, hy);
}

/** Is the own camp of `team` up (a rat alive)? Returns a rat id or −1, nearest to `id`. */
function campRat(w: World, id: number): number {
  const c = w.team[id];
  let best = -1;
  let bestD = 0;
  for (let k = 0; k < RAT_CAMP_STATS.rats; k++) {
    const r = firstRat(c) + k;
    if (w.alive[r] === 0) continue;
    const d = dist2(w.x[id], w.y[id], w.x[r], w.y[r]);
    if (best < 0 || d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** Is an enemy structure within BOT_AI.siegeRange of bot `id` (a push is on)? */
function sieging(w: World, id: number): boolean {
  const r2 = BOT_AI.siegeRange * BOT_AI.siegeRange;
  for (let s = RANGE.towers; s < RANGE.fountains; s++) {
    if (w.alive[s] === 1 && w.team[s] !== w.team[id] && dist2(w.x[id], w.y[id], w.x[s], w.y[s]) <= r2) return true;
  }
  return false;
}

/** Mistake kinds (§7.2): ignore a gank, chase too far, miss a last-hit. */
const SLIP = Object.freeze({ Gank: 0, Chase: 1, LastHit: 2 });
const SLIP_KINDS = 3;

/** The bot's current mistake kind, or −1. Rolls a new one every BOT_AI.slipEvery ticks. */
function slipOf(mem: BotMem, id: number, tick: number, p: BotParams, rng: Rng): number {
  const cur = mem.slip[id];
  if (cur >= 0 && cur >> 2 >= tick) return cur & 3;
  mem.slip[id] = -1;
  if ((tick + id) % BOT_AI.slipEvery >= TIMELINE.botThinkEvery) return -1;
  if (!rng.chanceBp(p.mistakeBp)) return -1;
  const kind = rng.int(SLIP_KINDS);
  mem.slip[id] = (tick + BOT_AI.slipTicks) * 4 + kind;
  return kind;
}

/** Is bot `id` threatened: an aware enemy hero in view, or an enemy structure shooting it? */
function threatened(w: World, id: number, mem: BotMem, p: BotParams, tick: number): boolean {
  for (let e = RANGE.heroes; e < RANGE.minions; e++) if (seenEnemy(w, w.team[id], e) && aware(mem, id, e, tick, p)) return true;
  for (let s = RANGE.towers; s < RANGE.fountains; s++) if (w.alive[s] === 1 && w.team[s] !== w.team[id] && w.target[s] === id) return true;
  return false;
}

/** Allied heroes of bot `id` (self included) alive and above BOT_AI.objectiveHpBp. */
function healthyAllies(w: World, id: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === w.team[id] && w.alive[h] === 1 && hpBp(w, h) >= BOT_AI.objectiveHpBp) n++;
  return n;
}

/** One think for bot `id`. Returns a command or null. */
export function think(m: MatchHandle, id: number, p: BotParams, mem: BotMem, rng: Rng): Command | null {
  const w = m.world;
  const tick = w.globals[G.Tick];
  if (w.alive[id] === 0) {
    mem.mode[id] = BOT_MODE.Lane;
    mem.foe[id] = -1;
    mem.op[id] = 0;
    return null;
  }
  const slip = slipOf(mem, id, tick, p, rng);
  updateAwareness(w, id, mem, tick, slip === SLIP.Gank);
  if (w.castPhase[id] !== 0) return null;
  const hp = hpBp(w, id);
  if (mem.mode[id] === BOT_MODE.Retreat) {
    if (hp < BOT_AI.retreatExitBp) return retreat(w, id, mem, p);
    mem.mode[id] = BOT_MODE.Lane;
  }
  const low = hp < p.retreatHpBp;
  if (low && (hp < applyBp(p.retreatHpBp, BOT_AI.retreatAlwaysBp) || threatened(w, id, mem, p, tick))) return retreat(w, id, mem, p);
  if (w.napT[id] > 0) return null;
  const snack = snackCast(w, id, p);
  if (snack) return snack;

  const foe = low ? -1 : pickFoe(w, id, mem, p, tick, slip === SLIP.Chase, scratch);
  if (low) scratch[0] = -1;
  if (foe >= 0) {
    mem.mode[id] = BOT_MODE.Fight;
    mem.foe[id] = foe;
    const c = rng.chanceBp(p.abilityUseBp) ? fightCast(w, id, foe, p, rng) : null;
    return c ?? attack(w, id, mem, foe);
  }
  mem.foe[id] = -1;
  const team = w.team[id];
  const lane = laneFor(w, id, tick, p.groupAt);
  const grouped = tick >= p.groupAt;
  // A strong enemy close by, or a tower shooting us with no minion to tank it: step back to cover.
  const bad = scratch[0];
  let shotBy = -1;
  for (let s = RANGE.towers; s < RANGE.fountains; s++) if (w.alive[s] === 1 && w.target[s] === id && w.team[s] !== team) shotBy = s;
  const shot = shotBy >= 0 && !tanked(w, shotBy, team) && !(targetable(w, shotBy, team) && mayDive(w, id, shotBy, p));
  if ((bad >= 0 && dist2(w.x[id], w.y[id], w.x[bad], w.y[bad]) <= BOT_AI.engageRange * BOT_AI.engageRange) || shot) {
    const own = laneStructure(w, team, lane, true);
    mem.mode[id] = BOT_MODE.Lane;
    return moveTo(w, id, mem, w.x[own] + sign(team) * BOT_AI.holdAhead, w.y[own]);
  }

  // Pudding: decided once per spawn.
  const pud = RANGE.pudding;
  if (w.globals[G.PudState] === PUD_STATE.Wild && w.alive[pud] === 1) {
    const spawns = w.globals[G.PudSpawns];
    if (mem.pud[id] < 0 || mem.pud[id] >> 1 !== spawns) mem.pud[id] = spawns * 2 + (rng.chanceBp(p.contestPuddingBp) ? 1 : 0);
    if ((mem.pud[id] & 1) === 1 && hp >= BOT_AI.objectiveHpBp && healthyAllies(w, id) >= BOT_AI.pudAllies && (!grouped || !sieging(w, id))) {
      mem.mode[id] = BOT_MODE.Pudding;
      return (p.waveClear ? clearCast(w, id, pud) : null) ?? attack(w, id, mem, pud);
    }
  }
  // The roamer clears the own rat camp until the team groups.
  if (roleOf(id) === ROAM && tick >= TIMELINE.campsUp && !grouped && hp >= BOT_AI.objectiveHpBp) {
    const rat = campRat(w, id);
    if (rat >= 0) {
      mem.mode[id] = BOT_MODE.Camp;
      return (p.waveClear ? clearCast(w, id, rat) : null) ?? attack(w, id, mem, rat);
    }
  }
  mem.mode[id] = grouped ? BOT_MODE.Push : BOT_MODE.Lane;
  mem.lane[id] = lane;
  return laneAct(w, id, mem, lane, slip === SLIP.LastHit, p);
}
