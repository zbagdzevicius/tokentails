/**
 * Camps (POC.md §5). Crossing: one camp of two rats per side, the Purrhaven one at RAT_CAMP and the Woof one mirrored;
 * up at 0:30 (TIMELINE.campsUp) and 60 s after both rats of a camp fell; clearing one gives the Pack buff.
 *
 * Sim v18 Hearthwood (MAP-5V5.md §1.6, §1.7): twelve jungle camps (per quadrant a buff camp, the Rat Nest and the Frog
 * Pond) and Captain Grizzlechop's pit. The buff camps give their last hitter Prickle Coat or Feather; Grizzlechop
 * gives the team that takes him Fish, XP and the Hoard shield. Camp timers live in `mg` (MG.CampAt).
 *
 * Monsters are neutral (team 2): they stand at home until something hits them, then every monster of the camp chases
 * the attacker. A monster more than its leash from home drops its target, runs home and heals to full on arrival.
 */
import { CAMP_KIND, CAMP_KINDS, GRIZZLECHOP, JUNGLE_BUFF, RAT_CAMP_STATS } from '../../data/camps';
import { CAMPS, MAP, RADIUS, RAT_CAMP, mirrorX } from '../../data/map';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import { ANGLE_STEPS, applyBp, dist2, iatan2, idiv, moveToward } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, MG, NEVER, RANGE, TEAM_NEUTRAL, UnitState, type World } from '../world';
import { clearStatus } from '../effects/status';
import { slow } from '../effects/slow';
import { fleeStep } from '../effects/fear';
import { stepForced } from '../effects/dash';
import { inAttackRange, startAttack } from '../combat/attack';
import { dealDamage } from '../combat/damage';
import { grantFish } from '../progression/fish';
import { grantXp } from '../progression/levels';
import { moveSpeed, targetable } from './kinds';

const out = new Int32Array(3);

/** Per map (rebindCamps): camp of each monster (local index), its home, the first monster and count of each camp. */
let MON_CAMP: Int32Array = new Int32Array(0);
let MON_X: Int32Array = new Int32Array(0);
let MON_Y: Int32Array = new Int32Array(0);
let CAMP_FIRST: Int32Array = new Int32Array(0);
let CAMP_N: Int32Array = new Int32Array(0);
/** The boss camp (Grizzlechop), or −1. */
export let BOSS_CAMP = -1;

const BUILT: { key: object; camp: Int32Array; x: Int32Array; y: Int32Array; first: Int32Array; n: Int32Array; boss: number }[] = [];

/** Sim v18: the active map's camp tables (src/sim/map/runtime.ts bindMap). */
export function rebindCamps(): void {
  for (let i = 0; i < BUILT.length; i++) {
    if (BUILT[i].key === CAMPS) {
      const b = BUILT[i];
      MON_CAMP = b.camp;
      MON_X = b.x;
      MON_Y = b.y;
      CAMP_FIRST = b.first;
      CAMP_N = b.n;
      BOSS_CAMP = b.boss;
      return;
    }
  }
  const camp: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const first: number[] = [];
  const n: number[] = [];
  let boss = -1;
  for (let c = 0; c < CAMPS.length; c++) {
    const s = CAMPS[c];
    const k = CAMP_KINDS[s.kind];
    first.push(camp.length);
    n.push(k.rats);
    if (s.kind === CAMP_KIND.boss) boss = c;
    for (let j = 0; j < k.rats; j++) {
      camp.push(c);
      // Two monsters stand `spread` either side of the centre (y). A point map mirrors team 1's across the river
      // (x, y) → (W − y, W − x), so there the offset runs along x.
      const dy = k.rats === 1 ? 0 : j === 0 ? -RAT_CAMP_STATS.spread : RAT_CAMP_STATS.spread;
      const river = MAP.point === 1 && s.side === 1;
      xs.push(s.x - (river ? dy : 0));
      ys.push(s.y + (river ? 0 : dy));
    }
  }
  BUILT.push({ key: CAMPS, camp: Int32Array.from(camp), x: Int32Array.from(xs), y: Int32Array.from(ys), first: Int32Array.from(first), n: Int32Array.from(n), boss });
  rebindCamps();
}
rebindCamps();

/** Camp of monster `id`. */
export const campOf = (id: number): number => MON_CAMP[id - RANGE.camps];
/** Id of camp `c`'s first monster. */
export const firstRat = (c: number): number => RANGE.camps + CAMP_FIRST[c];
/** Monsters in camp `c`. */
export const campSize = (c: number): number => CAMP_N[c];
/** Camps on the active map. */
export const campCount = (): number => CAMP_FIRST.length;

export const campX = (c: number): number => (c === 0 ? RAT_CAMP.x : mirrorX(RAT_CAMP.x));
const homeX = (id: number): number => MON_X[id - RANGE.camps];
const homeY = (id: number): number => MON_Y[id - RANGE.camps];

/** The camp timer: Crossing's two in `globals` (as in v17), Hearthwood's in `mg`. */
const campAt = (w: World, c: number): number => (w.mg.length === 0 ? w.globals[c === 0 ? G.CampAt0 : G.CampAt1] : w.mg[MG.CampAt + c]);
function setCampAt(w: World, c: number, v: number): void {
  if (w.mg.length === 0) w.globals[c === 0 ? G.CampAt0 : G.CampAt1] = v;
  else w.mg[MG.CampAt + c] = v;
}
/** Tick camp `c` spawns next (−1 while up, −2 never again). */
export const campDueAt = (w: World, c: number): number => campAt(w, c);

/** Match start: the monster slots exist (dead) so the snapshot kinds are right; the camps are due at campsUp. */
export function initCamps(w: World, firstAt: number): void {
  for (let id = RANGE.camps; id < RANGE.pudding; id++) {
    w.kind[id] = Kind.Camp;
    w.team[id] = TEAM_NEUTRAL;
    w.alive[id] = 0;
    if (w.mg.length > 0) w.sub[id] = CAMPS[campOf(id)].kind;
  }
  for (let c = 0; c < CAMP_FIRST.length; c++) setCampAt(w, c, c === BOSS_CAMP ? GRIZZLECHOP.first : firstAt);
}

function spawnRat(w: World, id: number): void {
  const c = campOf(id);
  const k = CAMP_KINDS[w.sub[id]];
  let hp = k.hp;
  // Grizzlechop grows +6% per whole minute at spawn.
  if (c === BOSS_CAMP) {
    hp += applyBp(k.hp, GRIZZLECHOP.hpBpPerMinute * idiv(w.globals[G.Tick], TIMELINE.minute));
    w.timer[id] = 0;
  }
  w.alive[id] = 1;
  w.hp[id] = hp;
  w.maxHp[id] = hp;
  w.armour[id] = k.armour;
  w.shield[id] = 0;
  w.x[id] = homeX(id);
  w.y[id] = homeY(id);
  w.moveX[id] = w.x[id];
  w.moveY[id] = w.y[id];
  w.moveCarry[id] = 0;
  // Crossing: facing as in v17. Hearthwood: toward the map centre.
  w.facing[id] = w.mg.length === 0 ? (c === 0 ? ANGLE_STEPS >> 1 : 0) : CAMPS[c].side === 1 ? (ANGLE_STEPS * 5) >> 3 : ANGLE_STEPS >> 3;
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
  for (let c = 0; c < CAMP_FIRST.length; c++) {
    if (campAt(w, c) !== tick) continue;
    setCampAt(w, c, -1);
    for (let k = 0; k < CAMP_N[c]; k++) spawnRat(w, firstRat(c) + k);
    if (c === BOSS_CAMP) {
      w.mg[MG.SweepAt] = tick + GRIZZLECHOP.sweepEvery;
      w.mg[MG.SweepT] = 0;
      m.events.push({ type: 'objectiveSpawn', tick, kind: 'grizzlechop' });
    }
  }
}

/** Step 7: monster `id` died. When its camp is empty, schedule the respawn and return true. */
export function onRatDied(w: World, id: number): boolean {
  const c = campOf(id);
  for (let k = 0; k < CAMP_N[c]; k++) if (w.alive[firstRat(c) + k] === 1) return false;
  const at = w.globals[G.Tick] + CAMP_KINDS[CAMPS[c].kind].respawn;
  // Grizzlechop: no spawn after GRIZZLECHOP.lastSpawn (the late game belongs to the Great Pudding).
  setCampAt(w, c, c === BOSS_CAMP && at > GRIZZLECHOP.lastSpawn ? -2 : at);
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

/**
 * Step 7, sim v18 (Hearthwood): the rewards of camp monster `id` (killed by team `team`, −1 none): a buff camp's buff
 * to its last hitter, Grizzlechop's team reward. Crossing's rats keep the Pack buff (`packBuff`, by the caller).
 */
export function campReward(m: MatchHandle, id: number, team: number): void {
  const w = m.world;
  const kind = w.sub[id];
  const by = w.lastHitBy[id];
  const hero = by >= 0 && by < RANGE.minions && w.kind[by] === Kind.Hero ? by : -1;
  if (kind === CAMP_KIND.prickle || kind === CAMP_KIND.crow) {
    if (hero >= 0) giveJungleBuff(m, hero, kind === CAMP_KIND.prickle ? 'prickle' : 'feather', kind === CAMP_KIND.prickle ? JUNGLE_BUFF.prickleTicks : JUNGLE_BUFF.featherTicks);
    return;
  }
  if (kind === CAMP_KIND.boss && team >= 0 && team < 2) grizzlechopTaken(m, team, hero);
}

/** Hero `h` gets jungle buff `kind` for `ticks` (MG.Prickle / MG.Feather). */
export function giveJungleBuff(m: MatchHandle, h: number, kind: 'prickle' | 'feather', ticks: number): void {
  const w = m.world;
  w.mg[(kind === 'prickle' ? MG.Prickle : MG.Feather) + h] = ticks;
  m.events.push({ type: 'buff', tick: w.globals[G.Tick], id: h, kind, ticks });
}

/**
 * Sim v18 (Hearthwood) buff steal: hero `victim` fell with a jungle buff; its takedown credit `killer` (a hero, or −1)
 * takes the time left (MAP-5V5.md §1.6). Without a hero killer the buff is lost.
 */
export function stealJungleBuffs(m: MatchHandle, victim: number, killer: number): void {
  const w = m.world;
  if (w.mg.length === 0) return;
  w.mg[MG.Hoard + victim] = 0;
  for (let b = 0; b < 2; b++) {
    const at = (b === 0 ? MG.Prickle : MG.Feather) + victim;
    const left = w.mg[at];
    if (left <= 0) continue;
    w.mg[at] = 0;
    if (killer < 0 || killer >= RANGE.minions || w.kind[killer] !== Kind.Hero || w.team[killer] === w.team[victim]) continue;
    const kind = b === 0 ? 'prickle' : 'feather';
    giveJungleBuff(m, killer, kind, left);
    m.events.push({ type: 'buffSteal', tick: w.globals[G.Tick], id: killer, from: victim, kind });
  }
}

/** Grizzlechop fell to `team` (`hitter` the last-hit hero or −1): Fish, XP and the Hoard shield (MAP-5V5.md §1.7). */
function grizzlechopTaken(m: MatchHandle, team: number, hitter: number): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const takes = w.mg[team === 0 ? MG.Takes0 : MG.Takes1];
  w.mg[team === 0 ? MG.Takes0 : MG.Takes1] = takes + 1;
  const behind = w.globals[team === 0 ? G.Towers1 : G.Towers0] - w.globals[team === 0 ? G.Towers0 : G.Towers1] >= GRIZZLECHOP.behindTowers;
  let fish = GRIZZLECHOP.fish + GRIZZLECHOP.fishPerTake * takes;
  let xp: number = GRIZZLECHOP.xp;
  if (behind) {
    fish = applyBp(fish, GRIZZLECHOP.behindBp);
    xp = applyBp(xp, GRIZZLECHOP.behindBp);
  }
  m.events.push({ type: 'objective', tick, kind: 'grizzlechop', team: team as 0 | 1, slot: hitter });
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== team) continue;
    grantFish(m, h, fish + (h === hitter ? GRIZZLECHOP.fishLastHit : 0), 'pudding');
    grantXp(m, h, xp, 'camp');
    if (w.alive[h] === 0) continue;
    w.shield[h] += GRIZZLECHOP.shieldBase + GRIZZLECHOP.shieldPerLevel * w.level[h];
    // The flat shield expires with the Hoard (status.ts: shieldT 0 clears it).
    w.shieldT[h] = Math.max(w.shieldT[h], GRIZZLECHOP.shieldTicks);
    w.mg[MG.Hoard + h] = GRIZZLECHOP.shieldTicks;
    m.events.push({ type: 'buff', tick, id: h, kind: 'hoard', ticks: GRIZZLECHOP.shieldTicks });
  }
}

/** Is monster `id` still within its leash of home? */
function inLeash(w: World, id: number): boolean {
  const l = CAMP_KINDS[w.sub[id]].leash;
  const c = campOf(id);
  return dist2(w.x[id], w.y[id], CAMPS[c].x, CAMPS[c].y) <= l * l;
}

/** Grizzlechop's Tail Sweep: every GRIZZLECHOP.sweepEvery a telegraph, then a ring of damage and a slow. */
function stepSweep(m: MatchHandle, id: number): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  if (w.target[id] < 0) {
    w.mg[MG.SweepAt] = tick + GRIZZLECHOP.sweepEvery;
    w.mg[MG.SweepT] = 0;
    return;
  }
  if (w.mg[MG.SweepT] > 0) {
    if (--w.mg[MG.SweepT] > 0) return;
    const r = GRIZZLECHOP.sweepRadius;
    for (let h = RANGE.heroes; h < RANGE.towers; h++) {
      if (w.alive[h] === 0 || w.team[h] > 1) continue;
      if (dist2(w.x[h], w.y[h], w.x[id], w.y[id]) > r * r) continue;
      dealDamage(m, id, TEAM_NEUTRAL, Kind.Camp, h, GRIZZLECHOP.sweepDamage, 'ability');
      if (w.alive[h] === 1) slow(w, h, GRIZZLECHOP.sweepSlowBp, GRIZZLECHOP.sweepSlowTicks);
    }
    return;
  }
  if (tick >= w.mg[MG.SweepAt]) {
    w.mg[MG.SweepAt] = tick + GRIZZLECHOP.sweepEvery;
    w.mg[MG.SweepT] = GRIZZLECHOP.sweepTelegraph;
    m.events.push({ type: 'windup', tick, src: id, slot: 1, x: w.x[id], y: w.y[id], ticks: GRIZZLECHOP.sweepTelegraph });
  }
}

/**
 * Step 4 for camp monsters: aggro, leash, chase and swing, or walk home. A monster takes aggro from whoever hit it (or
 * a camp mate's target) and chases while it is within its leash of home; past the leash it drops the target and walks
 * home (`waypoint` 1 = returning: no aggro on the way), healing to full on arrival.
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
    const c = campOf(id);
    if (c === BOSS_CAMP) {
      stepBoss(m, id);
      continue;
    }
    const returning = w.waypoint[id] === 1;
    let t = returning ? -1 : w.target[id];
    if (t >= 0 && !targetable(w, t, TEAM_NEUTRAL)) t = -1;
    if (!returning && !inLeash(w, id)) {
      t = -1;
      w.waypoint[id] = 1;
    } else if (!returning && t < 0) {
      const by = w.lastHitBy[id];
      if (by >= 0 && tick - w.hurtTick[id] <= 1 && by < RANGE.towers && targetable(w, by, TEAM_NEUTRAL)) t = by;
      else {
        // A camp mate's target (Crossing: the one other rat, as in v17).
        for (let k = 0; k < CAMP_N[c] && t < 0; k++) {
          const mate = firstRat(c) + k;
          if (mate !== id && w.alive[mate] === 1 && w.waypoint[mate] === 0 && w.target[mate] >= 0 && targetable(w, w.target[mate], TEAM_NEUTRAL)) t = w.target[mate];
        }
      }
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
    const hx = homeX(id);
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

/**
 * Grizzlechop holds his pit (he never walks out to be kited): he bites the last hero that hit him while it is in reach,
 * else the nearest hero in reach, and sweeps his tail. With no hero within his leash for GRIZZLECHOP.resetTicks he
 * heals to full (the pit is a fight, not a free kill from range). `timer` counts the empty ticks.
 */
function stepBoss(m: MatchHandle, id: number): void {
  const w = m.world;
  const leash = CAMP_KINDS[w.sub[id]].leash;
  const reach = CAMP_KINDS[w.sub[id]].range + CAMP_KINDS[w.sub[id]].radius;
  let near = false;
  let best = -1;
  let bestD = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.alive[h] === 0 || !targetable(w, h, TEAM_NEUTRAL)) continue;
    const d = dist2(w.x[h], w.y[h], w.x[id], w.y[id]);
    if (d <= leash * leash) near = true;
    const r = reach + RADIUS.hero;
    if (d <= r * r && (best < 0 || d < bestD)) {
      best = h;
      bestD = d;
    }
  }
  if (near) w.timer[id] = 0;
  else if (++w.timer[id] >= GRIZZLECHOP.resetTicks) {
    w.timer[id] = 0;
    w.hp[id] = w.maxHp[id];
  }
  const by = w.lastHitBy[id];
  let t = w.target[id];
  if (by >= 0 && by < RANGE.minions && targetable(w, by, TEAM_NEUTRAL) && inAttackRange(w, id, by)) t = by;
  else if (t < 0 || !targetable(w, t, TEAM_NEUTRAL) || !inAttackRange(w, id, t)) t = best;
  w.target[id] = t;
  stepSweep(m, id);
  if (w.windup[id] > 0) return;
  if (t >= 0) {
    w.facing[id] = iatan2(w.y[t] - w.y[id], w.x[t] - w.x[id]);
    startAttack(w, id, t);
    return;
  }
  w.state[id] = UnitState.Idle;
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
