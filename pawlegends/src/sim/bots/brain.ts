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
 *
 * Sim v10 (GAPS B1): an allied bot with a ping order (bots/orders.ts) follows it below retreat, the fights (it fights
 * back on the way) and the back-off from a bad fight or tower fire, and above Pudding, the camp and the lane. Orders
 * that shift power, not only goals: Fall back is the retreat itself while an enemy hero is close; Defend base comes
 * before any fight elsewhere (like the core defence) and ends once the base is safe; Focus halves the focused hero's
 * foe key and, with the human on that hero, chases it without the power check; on Group or Push a bot beside the
 * human holds through a bad fight (not through untanked tower fire). Take Pudding ends once Pudding is no longer wild.
 * Lane roles follow the lane swap (`laneRole`).
 */
import { BOT_AI, BOT_MODE, type BotParams } from '../../data/bots';
import { PING, PING_KIND } from '../../data/pings';
import { RAT_CAMP_STATS } from '../../data/camps';
import { PUD_STATE } from '../../data/pudding';
import { TIMELINE } from '../../data/timeline';
import { HERO_RULES } from '../../data/xp';
import { HUMAN_SLOT, Op, type Command } from '../api';
import { BP_ONE, applyBp, dist2, idiv, isqrt } from '../fixed';
import { LANES, MAP, PUDDING_SPOT, RAT_CAMP, TOWER_SPOTS, mirrorX } from '../../data/map';
import { nearLane } from '../map/grid';
import type { Rng } from '../rng';
import type { MatchHandle } from '../state';
import { G, Kind, NEVER, Order, RANGE, type World } from '../world';
import { rulesOf } from '../rules';
import { PICKUP_FRENZY, PICKUP_SNACK, nearestPickup } from '../units/pickup';
import { heroData, attackDamage, attackRange, radiusOf, targetable } from '../units/kinds';
import { firstRat } from '../units/camp';
import type { BotMem } from './mem';
import { clearCast, escapeCast, fightCast, nearestFoe, purrifyCast, snackCast } from './casts';
import { laneRole, orderOf } from './orders';
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
  if (p.hunts && huntable(w, team, foe) && hpBp(w, id) > BOT_AI.objectiveHpBp) return true;
  return hpBp(w, foe) < BOT_AI.finishHpBp && hpBp(w, id) > BOT_AI.objectiveHpBp;
}

/** Sim v7 Hard (BotParams.hunts): a foe under crowd control, or one standing inside our structure's reach. */
function huntable(w: World, team: number, foe: number): boolean {
  if (w.stunT[foe] > 0 || w.rootT[foe] > 0 || w.fearT[foe] > 0 || w.slowT[foe] > 0) return true;
  return ownCover(w, team, w.x[foe], w.y[foe]);
}

/**
 * Carry allies (DifficultyRules.carryAllies) leave a nearly dead enemy hero to the human: one under
 * BOT_AI.stealHpBp that the human, within BOT_AI.stealRange, hit in the last BOT_AI.stealTicks or is attacking.
 */
function leaveToHuman(w: World, e: number): boolean {
  const h = HUMAN_SLOT;
  if (w.alive[h] === 0 || hpBp(w, e) >= BOT_AI.stealHpBp) return false;
  if (dist2(w.x[h], w.y[h], w.x[e], w.y[e]) > BOT_AI.stealRange * BOT_AI.stealRange) return false;
  const t = w.assistTick[e * HEROES_N + h];
  return w.target[h] === e || (t !== NEVER && w.globals[G.Tick] - t <= BOT_AI.stealTicks);
}

/** The enemy hero to fight now, or −1. Sets `bad` to an aware enemy that is too strong to fight here. */
function pickFoe(
  w: World,
  id: number,
  mem: BotMem,
  p: BotParams,
  tick: number,
  slip: boolean,
  out: Int32Array,
  carry: boolean,
  brave: boolean,
  spare: number,
  focus = -1,
): number {
  out[0] = -1;
  const team = w.team[id];
  // Sim v8: before DifficultyRules.truceUntil an enemy bot never picks the human (the Rookie scripted fight excepted).
  const truce = team !== w.team[HUMAN_SLOT] && !brave && tick < truceUntil;
  let best = -1;
  let bestKey = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (!seenEnemy(w, team, e) || !aware(mem, id, e, tick, p) || !targetable(w, e, team)) continue;
    if (truce && e === HUMAN_SLOT) continue;
    const focused = e === focus;
    // Sim v10 Focus ping: with the human on the focused hero, the bot chases it like its own foe and skips the power check.
    const committed = focused && w.alive[HUMAN_SLOT] === 1 && dist2(w.x[HUMAN_SLOT], w.y[HUMAN_SLOT], w.x[e], w.y[e]) <= BOT_AI.powerRange * BOT_AI.powerRange;
    const d = isqrt(dist2(w.x[id], w.y[id], w.x[e], w.y[e]));
    // Carry allies peel: an enemy hero on the human is fought first, from further away, whatever the odds.
    const peel = carry && w.target[e] === HUMAN_SLOT && w.alive[HUMAN_SLOT] === 1;
    const reach = BOT_AI.engageRange + (e === mem.foe[id] || peel || brave || committed ? BOT_AI.chaseSlack : 0) + (slip ? BOT_AI.chaseSlack : 0);
    if (d > reach) continue;
    if (carry && leaveToHuman(w, e)) continue;
    // Never chase into an untanked enemy tower, unless the foe is nearly dead or this is a mistake.
    if (!slip && !brave && hpBp(w, e) > BOT_AI.finishHpBp && untankedThreat(w, team, w.x[e], w.y[e], 0) >= 0) continue;
    if (!peel && !brave && !committed && !goodFight(w, id, e, p)) {
      if (out[0] < 0) out[0] = e;
      continue;
    }
    // Peel targets first; the scripted first fight (brave) goes for the human.
    let key = Math.max(0, w.hp[e]) + idiv(d, BOT_AI.distWeight) - (peel || (brave && e === HUMAN_SLOT) ? BOT_AI.peelKey : 0);
    if (e === HUMAN_SLOT && !brave) key += spare;
    if (p.hunts && huntable(w, team, e)) key -= BOT_AI.huntKey;
    // Sim v10 Focus ping: twice the preference (a lower key wins).
    if (focused) key = idiv(key, PING.focusKeyDiv);
    if (best < 0 || key < bestKey) {
      best = e;
      bestKey = key;
    }
  }
  return best;
}

const scratch = new Int32Array(1);
/** DifficultyRules.truceUntil of the match being thought about (set before pickFoe; the brain is single-threaded). */
let truceUntil = 0;

/** Heroes of `team` alive within BOT_AI.powerRange of hero `id` (itself included); −1: all of `team` alive. */
function alliesNear(w: World, team: number, id: number): number {
  const r2 = BOT_AI.powerRange * BOT_AI.powerRange;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.team[h] !== team || w.alive[h] === 0) continue;
    if (id < 0 || dist2(w.x[h], w.y[h], w.x[id], w.y[id]) <= r2) n++;
  }
  return n;
}

/** Visible enemy heroes (of `team`) within BOT_AI.defendRange of `team`'s outermost structure in `lane`. */
function raiders(w: World, team: number, lane: number): number {
  const s = laneStructure(w, team, lane, true);
  const r2 = BOT_AI.defendRange * BOT_AI.defendRange;
  let n = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.alive[e] === 1 && seenEnemy(w, team, e) && dist2(w.x[e], w.y[e], w.x[s], w.y[s]) <= r2) n++;
  }
  return n;
}

/**
 * Has `team` grouped (BotParams.groupAt)? Sim v7 (DifficultyRules.leadPressure): a team BOT_AI.leadGroup or more
 * ahead groups and sieges from BOT_AI.leadGroupFrom on, so a lead in fights becomes map pressure.
 */
function groupedNow(m: MatchHandle, team: number, tick: number, p: BotParams): boolean {
  if (tick >= p.groupAt) return true;
  return rulesOf(m).leadPressure && tick >= BOT_AI.leadGroupFrom && -scoreBehind(m.world, team) >= BOT_AI.leadGroup;
}

/** How far `team` trails: the enemy's takedowns minus ours, plus 3 per tower the enemy took more (≤ 0: not behind). */
function scoreBehind(w: World, team: number): number {
  const kills = w.globals[team === 0 ? G.Kills1 : G.Kills0] - w.globals[team === 0 ? G.Kills0 : G.Kills1];
  const towers = w.globals[team === 0 ? G.Towers1 : G.Towers0] - w.globals[team === 0 ? G.Towers0 : G.Towers1];
  return kills + 3 * towers;
}

/**
 * Lane the team groups in from BotParams.groupAt (sim v4): the lane where enemy heroes threaten an own structure
 * (defend: the teams meet instead of racing each other's bases); else the fewest enemy towers left; tie: our wave is
 * further on; tie: Sunny.
 */
export function pushLane(w: World, team: number, id = -1, pressAhead = 0): number {
  // Defend only with the numbers to hold: allied heroes alive within BOT_AI.powerRange of bot `id` (itself
  // included; −1: every allied hero alive). A hero farming far away does not count. A team pressAhead or more
  // ahead (BotParams.pressAhead) turns back only with strictly more heroes near than raiders: it keeps pushing.
  const ra = raiders(w, team, 0);
  const rb = raiders(w, team, 1);
  const need = pressAhead > 0 && -scoreBehind(w, team) >= pressAhead ? 1 : 0;
  if (ra !== rb && Math.max(ra, rb) + need <= alliesNear(w, team, id)) return ra > rb ? 0 : 1;
  const a = laneTowers(w, 1 - team, 0);
  const b = laneTowers(w, 1 - team, 1);
  if (a !== b) return a < b ? 0 : 1;
  const fa = laneFront(w, team, 0);
  const fb = laneFront(w, team, 1);
  const pa = fa >= 0 ? progressOf(team, w.x[fa]) : 0;
  const pb = fb >= 0 ? progressOf(team, w.x[fb]) : 0;
  return pb > pa ? 1 : 0;
}

/**
 * Is the human playing (sim v5 carry leash): alive, it gave a command or moved in the last BOT_AI.leashIdle ticks,
 * and it stands within BOT_AI.leashLane of a lane or within BOT_AI.leashObjective of a rat camp or Pudding.
 */
function humanEngaged(w: World): boolean {
  const h = HUMAN_SLOT;
  if (w.alive[h] === 0 || w.globals[G.Tick] - w.globals[G.HumanActAt] > BOT_AI.leashIdle) return false;
  const x = w.x[h];
  const y = w.y[h];
  if (nearLane(x, y, BOT_AI.leashLane)) return true;
  const r2 = BOT_AI.leashObjective * BOT_AI.leashObjective;
  return (
    dist2(x, y, RAT_CAMP.x, RAT_CAMP.y) <= r2 || dist2(x, y, mirrorX(RAT_CAMP.x), RAT_CAMP.y) <= r2 || dist2(x, y, PUDDING_SPOT.x, PUDDING_SPOT.y) <= r2
  );
}

/** The human's lane by where it stands (Sunny above the middle). */
const humanLane = (w: World): number => (w.y[HUMAN_SLOT] >= MAP.height >> 1 ? 0 : 1);

/** The lane bot `id` plays now. */
function laneFor(m: MatchHandle, id: number, tick: number, p: BotParams, carry: boolean, hunt: boolean): number {
  const w = m.world;
  const team = w.team[id];
  if (carry || hunt) return humanLane(w);
  if (groupedNow(m, team, tick, p)) return pushLane(w, team, id, p.pressAhead);
  const role = laneRole(w, id);
  if (role !== ROAM) return role;
  // The roamer helps the lane with fewer own towers; tie: the one whose laner is hurt more.
  const a = laneTowers(w, team, 0);
  const b = laneTowers(w, team, 1);
  if (a !== b) return a < b ? 0 : 1;
  const base = team * 3;
  const secondHurt = hpBp(w, base + 1) < hpBp(w, base);
  // Sim v10 lane swap: then slot 0 plays Puddle and slot 1 Sunny.
  return secondHurt !== (laneRole(w, base) === 1) ? 1 : 0;
}

/** May bot `id` hit enemy structure `s` (vulnerable) with no minion tanking it? Only bots that dive. */
function mayDive(w: World, id: number, s: number, p: BotParams): boolean {
  if (!p.dives || hpBp(w, id) < BOT_AI.diveHpBp) return false;
  if (w.kind[s] === Kind.Core || w.hp[s] <= BOT_AI.diveTowerHp) return true;
  // Carry allies push a structure no enemy hero defends (the fight in front of it was won).
  if (thinkingCarry && !defended(w, w.team[id], s)) return true;
  const team = w.team[id];
  return thinkingGrouped && heroesAlive(w, team) - heroesAlive(w, 1 - team) >= BOT_AI.pushAdvantage;
}

/** Set by `think` for the bot thinking now: is it a carry ally? Has its team grouped? (read by mayDive) */
let thinkingCarry = false;
let thinkingGrouped = false;

/** Is an enemy hero (of `team`'s enemy) in view within BOT_AI.awareRange of structure `s`? */
function defended(w: World, team: number, s: number): boolean {
  const r2 = BOT_AI.awareRange * BOT_AI.awareRange;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) if (seenEnemy(w, team, e) && dist2(w.x[e], w.y[e], w.x[s], w.y[s]) <= r2) return true;
  return false;
}

/** Is the human out in its lane (not behind its own outer structure on the way home)? */
function humanOut(w: World): boolean {
  const h = HUMAN_SLOT;
  if (w.alive[h] === 0) return false;
  const team = w.team[h];
  const own = laneStructure(w, team, humanLane(w), true);
  return progressOf(team, w.x[h]) >= progressOf(team, w.x[own]) - BOT_AI.holdAhead;
}

/** Heroes of `team` alive (the scoreboard shows who is down, so bots may read it). */
function heroesAlive(w: World, team: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === team && w.alive[h] === 1) n++;
  return n;
}

/** Stand-point in `lane`: behind the lane front, outside any untanked enemy tower. Writes [x, y]. */
function laneGoal(w: World, id: number, lane: number, p: BotParams, out: Int32Array, carry = false): void {
  const team = w.team[id];
  const s = sign(team);
  const front = laneFront(w, team, lane);
  const hold = isRanged(w, id) ? BOT_AI.holdRanged : BOT_AI.holdMelee;
  const outer = laneStructure(w, team, lane, true);
  let gx: number;
  let gy: number;
  // v4: a wave still behind the own outer structure (just spawned) is waited for in front of it, not walked back to.
  if (front >= 0 && progressOf(team, w.x[front]) - hold > progressOf(team, w.x[outer]) + BOT_AI.holdAhead) {
    gx = w.x[front] - s * hold;
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
  // Carry allies never stand more than BOT_AI.leadMax ahead of the human (or of the own tower while it is dead).
  if (carry) {
    const h = HUMAN_SLOT;
    const anchor = humanOut(w) ? w.x[h] : w.x[laneStructure(w, team, lane, true)];
    const maxP = progressOf(team, anchor) + BOT_AI.leadMax;
    if (progressOf(team, gx) > maxP) gx = team === 0 ? maxP : MAP.width - maxP;
  }
  out[0] = gx;
  out[1] = gy;
}

const goal = new Int32Array(2);

/** Lane work: last-hit, a tanked structure, the wave, else the stand-point. */
function laneAct(w: World, id: number, mem: BotMem, lane: number, slip: boolean, p: BotParams, carry = false, noSiege = false): Command | null {
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
  if (!noSiege && (p.structureFirst || weakest < 0)) {
    for (let s = RANGE.towers; s < RANGE.fountains; s++) {
      if (w.alive[s] === 0 || w.team[s] === team || !targetable(w, s, team)) continue;
      if (!tanked(w, s, team) && !mayDive(w, id, s, p)) continue;
      const r = reach + radiusOf(w, s);
      if (dist2(w.x[id], w.y[id], w.x[s], w.y[s]) <= r * r) return attack(w, id, mem, s);
    }
  }
  if (weakest >= 0) return (p.waveClear ? clearCast(w, id, weakest) : null) ?? attack(w, id, mem, weakest);
  laneGoal(w, id, lane, p, goal, carry);
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

/**
 * Sim v7 base threat (BotParams.defendBase): the own inner tower or core (the core first) with a visible enemy hero,
 * or BOT_AI.baseThreatMinions enemy minions, within BOT_AI.baseThreatRange; −1 when the base is safe.
 */
export function baseThreat(w: World, team: number): number {
  heroThreat = false;
  const core = RANGE.cores + team;
  for (let pass = 0; pass < 3; pass++) {
    // pass 0: the core (within BOT_AI.coreThreatRange: attackers gather just outside its reach); 1 and 2: the inner
    // tower of Sunny, then Puddle.
    const s = pass === 0 ? core : innerTower(w, team, pass - 1);
    if (s < 0 || w.alive[s] === 0) continue;
    const range = pass === 0 ? BOT_AI.coreThreatRange : BOT_AI.baseThreatRange;
    const r2 = range * range;
    let minions = 0;
    for (let e = RANGE.heroes; e < RANGE.towers; e++) {
      if (!seenEnemy(w, team, e) || dist2(w.x[e], w.y[e], w.x[s], w.y[s]) > r2) continue;
      if (e < RANGE.minions) {
        heroThreat = true;
        return s;
      }
      if (w.kind[e] === Kind.Minion && ++minions >= BOT_AI.baseThreatMinions) return s;
    }
  }
  return -1;
}

/** Set by baseThreat: is an enemy hero part of the threat (else minions only)? */
let heroThreat = false;

/** `team`'s inner tower in `lane` while it stands, else −1. */
function innerTower(w: World, team: number, lane: number): number {
  const base = RANGE.towers + team * TOWER_SPOTS.length;
  for (let k = 0; k < TOWER_SPOTS.length; k++) {
    if (TOWER_SPOTS[k].lane === LANES[lane] && TOWER_SPOTS[k].tier === 'inner') return w.alive[base + k] === 1 ? base + k : -1;
  }
  return -1;
}

/** Defend structure `s`: fight the nearest enemy near it, else nap or walk back to it. */
function defend(w: World, id: number, mem: BotMem, s: number, p: BotParams, rng: Rng): Command | null {
  const team = w.team[id];
  const range = s === RANGE.cores + team ? BOT_AI.coreThreatRange : BOT_AI.baseThreatRange;
  const r2 = range * range;
  const aware2 = BOT_AI.awareRange * BOT_AI.awareRange;
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.heroes; e < RANGE.towers; e++) {
    if (!seenEnemy(w, team, e) || dist2(w.x[e], w.y[e], w.x[s], w.y[s]) > r2) continue;
    // Heroes first: a hero counts as this much closer.
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]) - (e < RANGE.minions ? aware2 : 0);
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  mem.mode[id] = BOT_MODE.Push;
  if (best >= 0 && dist2(w.x[id], w.y[id], w.x[best], w.y[best]) <= aware2) {
    if (best < RANGE.minions) {
      mem.foe[id] = best;
      const c = rng.chanceBp(p.abilityUseBp) ? fightCast(w, id, best, p, rng) : null;
      return c ?? attack(w, id, mem, best);
    }
    return (p.waveClear ? clearCast(w, id, best) : null) ?? attack(w, id, mem, best);
  }
  const far = dist2(w.x[id], w.y[id], w.x[s], w.y[s]) > BOT_AI.napMinDist * BOT_AI.napMinDist;
  if (far && w.napT[id] === 0 && nearestFoe(w, id, BOT_AI.napSafeRange) < 0) {
    mem.op[id] = Op.Nap;
    return { op: Op.Nap };
  }
  return moveTo(w, id, mem, w.x[s], w.y[s]);
}

/** Sim v7 Hard: is bot `id` far ahead of its own wave front in `lane` with no allied hero near? */
function overextended(w: World, id: number, lane: number): boolean {
  const team = w.team[id];
  const front = laneFront(w, team, lane);
  const fp = front >= 0 ? progressOf(team, w.x[front]) : progressOf(team, w.x[laneStructure(w, team, lane, true)]);
  if (progressOf(team, w.x[id]) - fp <= BOT_AI.overextend) return false;
  return alliesNear(w, team, id) <= 1;
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

/** Is the human alive within PING.groupRange of bot `id` (slot 0 itself: never)? */
function beside(w: World, id: number): boolean {
  const h = HUMAN_SLOT;
  return id !== h && w.alive[h] === 1 && dist2(w.x[id], w.y[id], w.x[h], w.y[h]) <= PING.groupRange * PING.groupRange;
}

/** Allied heroes of bot `id` (mine included) alive and above BOT_AI.objectiveHpBp. */
function healthyAllies(w: World, id: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === w.team[id] && w.alive[h] === 1 && hpBp(w, h) >= BOT_AI.objectiveHpBp) n++;
  return n;
}

/** Where ping order `ord` sends bot `id` (writes [x, y] into `goal`), and how close counts as there. */
function orderGoal(w: World, id: number, ord: number, p: BotParams): number {
  switch (ord) {
    case PING_KIND.Group:
      goal[0] = w.x[HUMAN_SLOT];
      goal[1] = w.y[HUMAN_SLOT];
      return PING.groupRange;
    case PING_KIND.Pudding: {
      const pud = RANGE.pudding;
      const up = w.alive[pud] === 1;
      goal[0] = up ? w.x[pud] : PUDDING_SPOT.x;
      goal[1] = up ? w.y[pud] : PUDDING_SPOT.y;
      return PING.arriveRange;
    }
    case PING_KIND.PushSunny:
    case PING_KIND.PushPuddle:
      laneGoal(w, id, ord === PING_KIND.PushSunny ? 0 : 1, p, goal);
      return PING.arriveRange;
    default:
      goal[0] = orderPt[0];
      goal[1] = orderPt[1];
      return PING.arriveRange;
  }
}

/** Is order `ord` fulfilled before its TTL: Pudding no longer wild, or the base safe (no threat left)? */
function orderDone(w: World, id: number, ord: number): boolean {
  if (ord === PING_KIND.Pudding) return w.globals[G.PudState] !== PUD_STATE.Wild || w.alive[RANGE.pudding] === 0;
  if (ord === PING_KIND.Defend) return baseThreat(w, w.team[id]) < 0;
  return false;
}

/** The nearest enemy minion `team` can see within BOT_AI.engageRange of (x, y), or −1. */
function minionNear(w: World, team: number, x: number, y: number): number {
  const r2 = BOT_AI.engageRange * BOT_AI.engageRange;
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.minions; e < RANGE.towers; e++) {
    if (!seenEnemy(w, team, e)) continue;
    const d = dist2(w.x[e], w.y[e], x, y);
    if (d <= r2 && (best < 0 || d < bestD)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Go to (x, y) within `r`; once there, hit an enemy minion close by or stand on the point. */
function holdAt(w: World, id: number, mem: BotMem, x: number, y: number, r: number, p: BotParams): Command | null {
  if (dist2(w.x[id], w.y[id], x, y) <= r * r) {
    const e = minionNear(w, w.team[id], x, y);
    if (e >= 0 && untankedThreat(w, w.team[id], w.x[e], w.y[e], 0) < 0) return (p.waveClear ? clearCast(w, id, e) : null) ?? attack(w, id, mem, e);
  }
  return moveTo(w, id, mem, x, y);
}

/** Work on ping order `ord` (Group, Take Pudding, Push, Go here; the fights came first). */
function orderAct(m: MatchHandle, id: number, mem: BotMem, ord: number, p: BotParams, slipLastHit: boolean): Command | null {
  const w = m.world;
  const team = w.team[id];
  const r = orderGoal(w, id, ord, p);
  mem.mode[id] = BOT_MODE.Push;
  switch (ord) {
    case PING_KIND.Group: {
      // Hit what the human hits, once beside it.
      const t = w.target[HUMAN_SLOT];
      const near = dist2(w.x[id], w.y[id], goal[0], goal[1]) <= r * r;
      if (near && t >= 0 && w.alive[t] === 1 && w.team[t] !== team && targetable(w, t, team) && untankedThreat(w, team, w.x[t], w.y[t], 0) < 0) return attack(w, id, mem, t);
      return holdAt(w, id, mem, goal[0], goal[1], r, p);
    }
    case PING_KIND.Pudding: {
      const pud = RANGE.pudding;
      mem.mode[id] = BOT_MODE.Pudding;
      if (w.globals[G.PudState] === PUD_STATE.Wild && w.alive[pud] === 1 && targetable(w, pud, team)) {
        return (p.waveClear ? clearCast(w, id, pud) : null) ?? attack(w, id, mem, pud);
      }
      return holdAt(w, id, mem, goal[0], goal[1], r, p);
    }
    case PING_KIND.PushSunny:
    case PING_KIND.PushPuddle: {
      const lane = ord === PING_KIND.PushSunny ? 0 : 1;
      mem.lane[id] = lane;
      // A push order is a grouped push: a diving bot hits an untanked tower while its team has more heroes up.
      thinkingGrouped = true;
      return laneAct(w, id, mem, lane, slipLastHit, p);
    }
    default:
      mem.mode[id] = BOT_MODE.Lane;
      return holdAt(w, id, mem, goal[0], goal[1], r, p);
  }
}

/** The point and target of the order being worked on (set by `think`; the brain is single-threaded). */
const orderPt = new Int32Array(3);

/**
 * An order an outside player-bot gives itself (the `pinger` profile follows its own pings, as a human would). Never
 * world state: it reaches the sim only through the commands it leads to.
 */
export interface SelfOrder {
  kind: number;
  until: number;
  x: number;
  y: number;
  target: number;
}

/** One think for bot `id`. Returns a command or null. `mine`: slot 0's own order (outside player-bots only). */
export function think(m: MatchHandle, id: number, p: BotParams, mem: BotMem, rng: Rng, mine: SelfOrder | null = null): Command | null {
  const w = m.world;
  const tick = w.globals[G.Tick];
  thinkingCarry = false;
  thinkingGrouped = false;
  if (w.alive[id] === 0) {
    mem.mode[id] = BOT_MODE.Lane;
    mem.foe[id] = -1;
    mem.op[id] = 0;
    return null;
  }
  const slip = slipOf(mem, id, tick, p, rng);
  updateAwareness(w, id, mem, tick, slip === SLIP.Gank);
  if (w.castPhase[id] !== 0) return null;
  // Sim v10 (GAPS B5): a crowd-controlled bot shrugs it off first.
  const purr = purrifyCast(w, id, p);
  if (purr) return purr;
  const hp = hpBp(w, id);
  if (mem.mode[id] === BOT_MODE.Retreat) {
    if (hp < BOT_AI.retreatExitBp) return retreat(w, id, mem, p);
    mem.mode[id] = BOT_MODE.Lane;
  }
  // The scripted first fight is fought to the end (DifficultyRules.scriptFrom).
  const scripted = id === 3 && rulesOf(m).scriptFrom > 0 && tick >= rulesOf(m).scriptFrom && tick < rulesOf(m).scriptUntil;
  const low = hp < p.retreatHpBp && !scripted;
  if (low && (hp < applyBp(p.retreatHpBp, BOT_AI.retreatAlwaysBp) || threatened(w, id, mem, p, tick))) return retreat(w, id, mem, p);
  if (w.napT[id] > 0) return null;
  // Sim v10 ping orders (allied bots only): Fall back is a retreat; the others are worked on below the fights.
  let ord = -1;
  if (id === HUMAN_SLOT) {
    if (mine && tick <= mine.until) {
      ord = mine.kind;
      orderPt[0] = mine.x;
      orderPt[1] = mine.y;
      orderPt[2] = mine.target;
    }
  } else {
    ord = orderOf(w, id);
    orderPt[0] = w.botOrdX[id];
    orderPt[1] = w.botOrdY[id];
    orderPt[2] = w.botOrdId[id];
  }
  if (ord >= 0 && orderDone(w, id, ord)) {
    if (id === HUMAN_SLOT && mine) mine.until = -1;
    else w.botOrd[id] = 0;
    ord = -1;
  }
  // Fall back is the pre-v10 retreat (escape casts, then home) while an enemy hero is close; once safe it ends.
  if (ord === PING_KIND.FallBack) {
    if (nearestFoe(w, id, BOT_AI.napSafeRange) >= 0) return retreat(w, id, mem, p);
    if (id === HUMAN_SLOT && mine) mine.until = -1;
    else w.botOrd[id] = 0;
    ord = -1;
  }
  // Defend base comes before any fight elsewhere, like the pre-v10 core defence (orderDone ends it once safe).
  if (ord === PING_KIND.Defend) return defend(w, id, mem, baseThreat(w, w.team[id]), p, rng);
  const snack = snackCast(w, id, p);
  if (snack) return snack;
  const ordered = ord >= 0 && ord !== PING_KIND.Focus;
  const focus = ord === PING_KIND.Focus ? orderPt[2] : -1;

  const rules = rulesOf(m);
  // The roamer (team slot 2) carries first, then the Puddle laner (DifficultyRules.carryAllies).
  // Sim v5: only while the human plays (humanEngaged): a human parked off the lanes, or idle, is not followed.
  // Sim v10: an ordered bot follows its order instead.
  const carry = !ordered && id !== HUMAN_SLOT && w.team[id] === w.team[HUMAN_SLOT] && rules.carryAllies >= (roleOf(id) === ROAM ? 1 : 2) && humanEngaged(w);
  thinkingCarry = carry;
  // Rookie: slot 3 walks into Sunny Lane early and picks the first fight (DifficultyRules.scriptFrom).
  const script = id === 3 && rules.scriptFrom > 0 && tick >= rules.scriptFrom && tick < rules.scriptUntil;
  // Sim v7: enemy heroes at the own core come before any fight elsewhere (a base race is not a lead).
  if (p.defendBase && !low && !carry && !script && !ordered) {
    const s = baseThreat(w, w.team[id]);
    if (s === RANGE.cores + w.team[id] && heroThreat && dist2(w.x[id], w.y[id], w.x[s], w.y[s]) > BOT_AI.coreThreatRange * BOT_AI.coreThreatRange) {
      return defend(w, id, mem, s, p, rng);
    }
  }
  truceUntil = rules.truceUntil;
  const foe = low
    ? -1
    : pickFoe(w, id, mem, p, tick, slip === SLIP.Chase, scratch, carry, script, w.team[id] === w.team[HUMAN_SLOT] ? 0 : rules.spareHuman, focus);
  if (low) scratch[0] = -1;
  if (foe >= 0) {
    mem.mode[id] = BOT_MODE.Fight;
    mem.foe[id] = foe;
    const c = rng.chanceBp(p.abilityUseBp) ? fightCast(w, id, foe, p, rng) : null;
    return c ?? attack(w, id, mem, foe);
  }
  mem.foe[id] = -1;
  const team = w.team[id];
  if (script) {
    // Toward the human's side of Sunny Lane, swinging at what it meets.
    const toHuman = humanOut(w) && w.y[HUMAN_SLOT] >= MAP.height >> 1;
    const tx = toHuman ? w.x[HUMAN_SLOT] : BOT_AI.scriptX;
    const ty = toHuman ? w.y[HUMAN_SLOT] : BOT_AI.scriptY;
    mem.mode[id] = BOT_MODE.Lane;
    if (mem.op[id] === Op.AttackMove && Math.abs(mem.x[id] - tx) <= BOT_AI.repeatSlack && Math.abs(mem.y[id] - ty) <= BOT_AI.repeatSlack) return null;
    mem.op[id] = Op.AttackMove;
    mem.x[id] = tx;
    mem.y[id] = ty;
    return { op: Op.AttackMove, x: tx, y: ty };
  }
  // Carry allies: back to the human when it walked away.
  if (carry && humanOut(w) && dist2(w.x[id], w.y[id], w.x[HUMAN_SLOT], w.y[HUMAN_SLOT]) > BOT_AI.followRange * BOT_AI.followRange) {
    mem.mode[id] = BOT_MODE.Lane;
    return moveTo(w, id, mem, w.x[HUMAN_SLOT], w.y[HUMAN_SLOT]);
  }
  // Pickups: a Frenzy Catnip close by (carry allies leave it to the human), a Fish Snack when hurt.
  if (p.pickups) {
    const fr = carry ? -1 : nearestPickup(w, id, BOT_AI.pickupRange, PICKUP_FRENZY);
    const sn = hp < BOT_AI.pickupSnackHpBp ? nearestPickup(w, id, BOT_AI.snackRange, PICKUP_SNACK) : -1;
    const pk = fr >= 0 ? fr : sn;
    if (pk >= 0) return moveTo(w, id, mem, w.pkX[pk], w.pkY[pk]);
  }
  // Sim v7: a base threat comes before pickups, objectives and lane work (BotParams.defendBase).
  // Enemy heroes at the base pull every bot back; minions alone pull only bots within baseThreatPull, and a team
  // well ahead (BOT_AI.leadGroup) keeps its siege unless they are at its core.
  if (p.defendBase && !carry && !ordered && hp >= BOT_AI.objectiveHpBp) {
    const s = baseThreat(w, team);
    const near = s >= 0 && dist2(w.x[id], w.y[id], w.x[s], w.y[s]) <= BOT_AI.baseThreatPull * BOT_AI.baseThreatPull;
    const pull = s >= 0 && (heroThreat || (near && (s === RANGE.cores + team || -scoreBehind(w, team) < BOT_AI.leadGroup)));
    if (pull) return defend(w, id, mem, s, p, rng);
  }
  const hunt = rules.enemiesToHuman && w.team[id] !== w.team[HUMAN_SLOT] && tick >= rules.scriptUntil;
  const lane = laneFor(m, id, tick, p, carry, hunt);
  thinkingGrouped = groupedNow(m, team, tick, p);
  const grouped = thinkingGrouped && !carry;
  // A strong enemy close by, or a tower shooting us with no minion to tank it: step back to cover.
  const bad = scratch[0];
  let shotBy = -1;
  for (let s = RANGE.towers; s < RANGE.fountains; s++) if (w.alive[s] === 1 && w.target[s] === id && w.team[s] !== team) shotBy = s;
  const shot = shotBy >= 0 && !tanked(w, shotBy, team) && !(targetable(w, shotBy, team) && mayDive(w, id, shotBy, p));
  const exposed = p.hunts && !grouped && overextended(w, id, lane);
  // Sim v10: a bot on a Group or Push order beside the human holds through a bad fight (tower fire still counts).
  const backed = ordered && (ord === PING_KIND.Group || ord === PING_KIND.PushSunny || ord === PING_KIND.PushPuddle) && beside(w, id);
  if ((!backed && ((bad >= 0 && dist2(w.x[id], w.y[id], w.x[bad], w.y[bad]) <= BOT_AI.engageRange * BOT_AI.engageRange) || exposed)) || shot) {
    const own = laneStructure(w, team, lane, true);
    mem.mode[id] = BOT_MODE.Lane;
    return moveTo(w, id, mem, w.x[own] + sign(team) * BOT_AI.holdAhead, w.y[own]);
  }
  // Sim v10: a ping order comes after the fights and the back-off, before Pudding, the camp and the lane.
  if (ordered) return orderAct(m, id, mem, ord, p, slip === SLIP.LastHit);

  // Pudding: decided once per spawn.
  const pud = RANGE.pudding;
  if (w.globals[G.PudState] === PUD_STATE.Wild && w.alive[pud] === 1) {
    const spawns = w.globals[G.PudSpawns];
    if (mem.pud[id] < 0 || mem.pud[id] >> 1 !== spawns) mem.pud[id] = spawns * 2 + (rng.chanceBp(p.contestPuddingBp) ? 1 : 0);
    const withHuman = !carry || dist2(w.x[HUMAN_SLOT], w.y[HUMAN_SLOT], w.x[pud], w.y[pud]) <= BOT_AI.awareRange * BOT_AI.awareRange;
    if ((mem.pud[id] & 1) === 1 && withHuman && hp >= BOT_AI.objectiveHpBp && healthyAllies(w, id) >= BOT_AI.pudAllies && (!grouped || !sieging(w, id))) {
      mem.mode[id] = BOT_MODE.Pudding;
      return (p.waveClear ? clearCast(w, id, pud) : null) ?? attack(w, id, mem, pud);
    }
  }
  // The roamer clears the own rat camp until the team groups.
  if (!carry && !hunt && roleOf(id) === ROAM && tick >= TIMELINE.campsUp && !grouped && hp >= BOT_AI.objectiveHpBp) {
    const rat = campRat(w, id);
    if (rat >= 0) {
      mem.mode[id] = BOT_MODE.Camp;
      return (p.waveClear ? clearCast(w, id, rat) : null) ?? attack(w, id, mem, rat);
    }
  }
  mem.mode[id] = grouped ? BOT_MODE.Push : BOT_MODE.Lane;
  mem.lane[id] = lane;
  // Rookie (DifficultyRules.pushNeedsHuman): the human's allies hit enemy structures only while the human plays, so
  // a parked human's team holds its lanes (its waves still push) but does not win the match for it.
  const noSiege = rules.pushNeedsHuman && team === w.team[HUMAN_SLOT] && !humanEngaged(w);
  return laneAct(w, id, mem, lane, slip === SLIP.LastHit, p, carry, noSiege);
}
