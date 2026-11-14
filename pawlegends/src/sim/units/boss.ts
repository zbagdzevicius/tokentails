/**
 * Sim v28 (docs/plans/moba/V28.md §2 to §4): the heroes a mode benches (data/mutators.ts `playing`) and Boss Weekend's
 * boss (data/boss.ts): its stats, its phases, its two telegraphed attacks (Ground Pound round itself, Meteor Paw on the
 * hero it hunts), the pups it calls at each phase change and its enrage. The boss is the enemy team's first slot, a bot
 * whose own kit the brain casts (bots/brain.ts bossThink); this module adds the boss layer on top, one step a tick.
 */
import { BOSS } from '../../data/boss';
import { MINIONS, MINION_KINDS } from '../../data/minions';
import { HERO_IDS } from '../../data/heroes';
import { SLOTS_PER_TEAM } from '../api';
import { ANGLE_STEPS, BP_ONE, TRIG_ONE, applyBp, dist2, iatan2, icos, idiv, isin } from '../fixed';
import { RADIUS, mirrorX } from '../../data/map';
import { LANE_PATHS } from '../map/lanes';
import { mutOf } from '../mutator';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, G, Kind, NEVER, RANGE, UnitState, allocMinion, type World } from '../world';
import { clearStatus } from '../effects/status';
import { stun } from '../effects/stun';
import { dealDamage } from '../combat/damage';
import { targetable } from './kinds';

/** Is hero slot `id` sitting this match out (its team plays fewer heroes, `playing`)? */
export function benched(w: World, id: number): boolean {
  const play = mutOf(w).playing;
  if (play[0] === 0 && play[1] === 0) return false;
  if (id < RANGE.heroes || id >= RANGE.minions || w.kind[id] !== Kind.Hero) return false;
  const team = w.team[id];
  const n = play[team];
  return n > 0 && id - RANGE.heroes - team * SLOTS_PER_TEAM >= n;
}

/** Boss Weekend: the boss's hero id (the enemy team's first slot), or −1 in any other match. */
export const bossOf = (w: World): number => (mutOf(w).boss ? RANGE.heroes + SLOTS_PER_TEAM : -1);
export const isBoss = (w: World, id: number): boolean => id >= 0 && id === bossOf(w);

/** The boss's arena centre (its team's side: the Sunny Lane river crossing). */
export const bossHomeX = (w: World): number => (w.team[bossOf(w)] === 0 ? BOSS.homeX : mirrorX(BOSS.homeX));
export const bossHomeY = (): number => BOSS.homeY;

/** At createMatch: benched heroes leave the map; the boss takes its hero, stats and arena. */
export function initModeHeroes(w: World): void {
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (!benched(w, id)) continue;
    w.alive[id] = 0;
    w.hp[id] = 0;
    w.timer[id] = 0;
    w.state[id] = UnitState.Dead;
    w.x[id] = w.team[id] === 0 ? BOSS.benchX : mirrorX(BOSS.benchX);
    w.y[id] = BOSS.benchY;
  }
  const b = bossOf(w);
  if (b < 0) return;
  w.sub[b] = HERO_IDS.indexOf(BOSS.hero);
  w.maxHp[b] = BOSS.hp;
  w.hp[b] = BOSS.hp;
  w.armour[b] = BOSS.armour;
  w.x[b] = bossHomeX(w);
  w.y[b] = bossHomeY();
  w.moveX[b] = w.x[b];
  w.moveY[b] = w.y[b];
  w.globals[G.BossPhase] = 0;
  w.globals[G.BossPoundAt] = BOSS.poundEvery[0];
  w.globals[G.BossMeteorAt] = NEVER;
}

/** The boss's damage (abilities, basics, its attacks) × this now: dmgBp, and enrageDmgBp from enrageAt. */
export function bossDamageBp(w: World): number {
  return w.globals[G.Tick] >= BOSS.enrageAt ? applyBp(BOSS.dmgBp, BOSS.enrageDmgBp) : BOSS.dmgBp;
}

/** The hero the boss hunts: the nearest targetable hero within BOSS.aggro of its arena, or −1. */
export function bossPrey(w: World): number {
  const b = bossOf(w);
  const hx = bossHomeX(w);
  const hy = bossHomeY();
  let best = -1;
  let bestD = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.alive[h] === 0 || w.team[h] === w.team[b] || !targetable(w, h, w.team[b])) continue;
    if (dist2(w.x[h], w.y[h], hx, hy) > BOSS.aggro * BOSS.aggro) continue;
    const d = dist2(w.x[h], w.y[h], w.x[b], w.y[b]);
    if (best < 0 || d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** Step 3 (Boss Weekend): phases, pups, the pound and meteor clocks, phase 3's faster cooldowns. */
export function stepBoss(m: MatchHandle): void {
  const w = m.world;
  const b = bossOf(w);
  if (b < 0 || w.alive[b] === 0) return;
  const tick = w.globals[G.Tick];
  // phases by HP share (they never go back)
  const share = idiv(w.hp[b] * BP_ONE, Math.max(1, w.maxHp[b]));
  const phase = w.globals[G.BossPhase];
  const next = share < BOSS.phaseBp[1] ? 2 : share < BOSS.phaseBp[0] ? 1 : 0;
  if (next > phase) {
    w.globals[G.BossPhase] = next;
    for (let k = 0; k < BOSS.pups[next - 1]; k++) spawnPup(w, b, k, BOSS.pups[next - 1]);
    if (w.globals[G.BossMeteorAt] === NEVER) w.globals[G.BossMeteorAt] = tick + idiv(BOSS.meteorEvery, 2);
    m.events.push({ type: 'bossPhase', tick, id: b, phase: next });
  }
  const ph = w.globals[G.BossPhase];
  // phase 3: cooldowns run faster (two extra ticks in every five: × 0.6)
  if (ph === 2 && tick % 5 < 2) for (let s = 0; s < COOLDOWN_SLOTS; s++) if (w.cooldowns[b * COOLDOWN_SLOTS + s] > 0) w.cooldowns[b * COOLDOWN_SLOTS + s]--;
  stepPound(m, b, ph, tick);
  stepMeteor(m, b, tick);
}

/** Ground Pound: a ring round the boss after its telegraph (the boss stands still while it winds up). */
function stepPound(m: MatchHandle, b: number, ph: number, tick: number): void {
  const w = m.world;
  if (w.globals[G.BossPoundT] > 0) {
    if (--w.globals[G.BossPoundT] > 0) return;
    hitCircle(m, b, w.x[b], w.y[b], BOSS.poundRadius, BOSS.poundDamage, BOSS.poundStun);
    return;
  }
  if (tick < w.globals[G.BossPoundAt]) return;
  if (bossPrey(w) < 0) {
    w.globals[G.BossPoundAt] = tick + BOSS.retryTicks;
    return;
  }
  w.globals[G.BossPoundAt] = tick + BOSS.poundEvery[ph];
  w.globals[G.BossPoundT] = BOSS.poundTelegraph;
  m.events.push({ type: 'windup', tick, src: b, slot: BOSS.poundSlot, x: w.x[b], y: w.y[b], ticks: BOSS.poundTelegraph });
}

/** Meteor Paw (phase 2 on): a circle where the hunted hero stood when the telegraph began. */
function stepMeteor(m: MatchHandle, b: number, tick: number): void {
  const w = m.world;
  if (w.globals[G.BossMeteorT] > 0) {
    if (--w.globals[G.BossMeteorT] > 0) return;
    hitCircle(m, b, w.globals[G.BossMeteorX], w.globals[G.BossMeteorY], BOSS.meteorRadius, BOSS.meteorDamage, 0);
    return;
  }
  if (tick < w.globals[G.BossMeteorAt]) return;
  const prey = bossPrey(w);
  if (prey < 0) {
    w.globals[G.BossMeteorAt] = tick + BOSS.retryTicks;
    return;
  }
  w.globals[G.BossMeteorAt] = tick + BOSS.meteorEvery;
  w.globals[G.BossMeteorT] = BOSS.meteorTelegraph;
  w.globals[G.BossMeteorX] = w.x[prey];
  w.globals[G.BossMeteorY] = w.y[prey];
  m.events.push({ type: 'windup', tick, src: b, slot: BOSS.meteorSlot, x: w.x[prey], y: w.y[prey], ticks: BOSS.meteorTelegraph, dst: prey });
}

/** Damage (combat/damage.ts scales it × bossDamageBp; armour applies) and an optional stun to every enemy hero within `r` of (x, y). */
function hitCircle(m: MatchHandle, b: number, x: number, y: number, r: number, damage: number, stunTicks: number): void {
  const w = m.world;
  const team = w.team[b];
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.alive[h] === 0 || w.team[h] === team) continue;
    const reach = r + RADIUS.hero;
    if (dist2(w.x[h], w.y[h], x, y) > reach * reach) continue;
    dealDamage(m, b, team, Kind.Hero, h, damage, 'ability');
    if (stunTicks > 0 && w.alive[h] === 1) stun(w, h, stunTicks);
  }
}

/** One pup (a melee minion of the boss's team) on a ring round the boss, walking Sunny Lane toward the heroes' core. */
function spawnPup(w: World, b: number, k: number, n: number): void {
  const id = allocMinion(w);
  if (id < 0) return;
  const team = w.team[b];
  const data = MINIONS.melee;
  const turn = idiv(k * ANGLE_STEPS, n);
  const x = w.x[b] + idiv(BOSS.pupRing * icos(turn), TRIG_ONE);
  const y = w.y[b] + idiv(BOSS.pupRing * isin(turn), TRIG_ONE);
  const path = LANE_PATHS[team][0];
  // the next path point ahead: the end of the path segment nearest to the pup
  let seg = 0;
  let segD = -1;
  for (let i = 0; i + 1 < path.length; i++) {
    const mx = (path.x[i] + path.x[i + 1]) >> 1;
    const my = (path.y[i] + path.y[i + 1]) >> 1;
    const d = dist2(x, y, mx, my);
    if (segD < 0 || d < segD) {
      seg = i;
      segD = d;
    }
  }
  w.kind[id] = Kind.Minion;
  w.team[id] = team;
  w.alive[id] = 1;
  w.sub[id] = MINION_KINDS.indexOf('melee');
  w.lane[id] = 0;
  w.wave[id] = w.globals[G.Wave];
  w.waypoint[id] = seg + 1;
  w.level[id] = 0;
  w.state[id] = UnitState.Moving;
  w.facing[id] = iatan2(path.y[seg + 1] - y, path.x[seg + 1] - x);
  w.buffs[id] = 0;
  w.x[id] = x;
  w.y[id] = y;
  w.hp[id] = data.hp * 2;
  w.maxHp[id] = data.hp * 2;
  w.shield[id] = 0;
  w.armour[id] = data.armour;
  w.xp[id] = 0;
  w.moveCarry[id] = 0;
  w.moveX[id] = path.x[seg + 1];
  w.moveY[id] = path.y[seg + 1];
  w.target[id] = -1;
  w.attackTimer[id] = 0;
  w.windup[id] = 0;
  w.timer[id] = 0;
  w.lastHitBy[id] = -1;
  w.hurtTick[id] = NEVER;
  clearStatus(w, id);
}
