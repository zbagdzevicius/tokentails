/**
 * Basic attacks and bolts (POC.md §4.3 steps 5 and 6). A unit starts a swing with `startAttack` (windup ticks,
 * then the attack timer); `resolveAttacks` lands the swings whose windup ends this tick: melee hits at once, ranged
 * units, towers and cores fire a homing bolt that `stepProjectiles` moves and lands.
 */
import { HERO_RULES } from '../../data/xp';
import { MINIONS } from '../../data/minions';
import { RAT_CAMP_STATS } from '../../data/camps';
import { SUNSET, TIMELINE } from '../../data/timeline';
import { CORE_STATS, PROJECTILE_KIND, TOWERS } from '../../data/towers';
import { BP_ONE, applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, UnitState, allocProjectile, type World } from '../world';
import { dealDamage } from './damage';
import { disabled } from '../effects/status';
import { kitOf } from '../heroes/kit';
import { attackDamage, attackEvery, attackRange, heroData, minionData, radiusOf, targetable } from '../units/kinds';

export { stepProjectiles } from './projectile';

/** Is `dst` within `id`'s attack range (+ `slack` mm)? */
export function inAttackRange(w: World, id: number, dst: number, slack = 0): boolean {
  const reach = attackRange(w, id) + radiusOf(w, dst) + radiusOf(w, id) + slack;
  return dist2(w.x[id], w.y[id], w.x[dst], w.y[dst]) <= reach * reach;
}

function windupOf(w: World, id: number): number {
  if (w.kind[id] === Kind.Minion) return minionData(w, id).windup;
  if (w.kind[id] === Kind.Hero) return HERO_RULES.attackWindup;
  if (w.kind[id] === Kind.Camp) return RAT_CAMP_STATS.windup;
  return 0;
}

/** Start a swing at `target` if the attack timer is ready. Returns true when a swing started. */
export function startAttack(w: World, id: number, target: number): boolean {
  if (w.attackTimer[id] > 0 || w.windup[id] > 0) return false;
  w.target[id] = target;
  w.windup[id] = windupOf(w, id);
  w.attackTimer[id] = attackEvery(w, id);
  w.state[id] = UnitState.Attacking;
  return true;
}

/** Spawn a homing bolt. Damage is fixed when it fires; armour and structure rules apply when it lands. */
export function fireBolt(w: World, src: number, dst: number, dmg: number, speed: number, kind: number): void {
  const p = allocProjectile(w);
  if (p < 0) return;
  w.pAlive[p] = 1;
  w.pTeam[p] = w.team[src];
  w.pKind[p] = kind;
  w.pOwner[p] = src;
  w.pTarget[p] = dst;
  w.pX[p] = w.x[src];
  w.pY[p] = w.y[src];
  w.pVx[p] = 0;
  w.pVy[p] = 0;
  w.pTtl[p] = 0;
  w.pSpeed[p] = speed;
  w.pDmg[p] = dmg;
  w.pFlags[p] = 0;
  w.pRadius[p] = 0;
  w.pEffect[p] = 0;
}

/** Swing damage of a hero or minion against `dst`, before armour (Sunset +25% for minions, siege ×2 vs towers). */
function swingDamage(w: World, id: number, dst: number): number {
  let dmg = attackDamage(w, id);
  if (w.kind[id] === Kind.Minion) {
    if (w.globals[G.Tick] >= TIMELINE.sunset) dmg = applyBp(dmg, SUNSET.minionDamageBp);
    if (w.kind[dst] === Kind.Tower) dmg = applyBp(dmg, minionData(w, id).towerBp);
  }
  return dmg;
}

/** Step 5: timers tick down; swings whose windup ends now land (melee) or fire (ranged). Heroes, minions, rats. */
export function resolveAttacks(m: MatchHandle): void {
  for (let id = 0; id < RANGE.towers; id++) resolveSwing(m, id);
  for (let id = RANGE.camps; id < RANGE.pudding; id++) resolveSwing(m, id);
}

function resolveSwing(m: MatchHandle, id: number): void {
  const w = m.world;
  if (w.alive[id] === 0) return;
  if (w.attackTimer[id] > 0) w.attackTimer[id]--;
  if (w.windup[id] === 0) return;
  if (disabled(w, id)) {
    w.windup[id] = 0;
    return;
  }
  if (--w.windup[id] > 0) return;
  const dst = w.target[id];
  if (dst < 0 || !targetable(w, dst, w.team[id]) || !inAttackRange(w, id, dst, radiusOf(w, dst))) return;
  const dmg = swingDamage(w, id, dst);
  if (w.kind[id] === Kind.Camp) {
    dealDamage(m, id, w.team[id], Kind.Camp, dst, dmg, 'basic');
    return;
  }
  if (w.kind[id] === Kind.Minion) {
    const md = minionData(w, id);
    if (md.projectile > 0) fireBolt(w, id, dst, dmg, md.projectile, md === MINIONS.siege ? PROJECTILE_KIND.siege : PROJECTILE_KIND.ranged);
    else dealDamage(m, id, w.team[id], Kind.Minion, dst, dmg, 'basic');
    return;
  }
  const kit = kitOf(w, id);
  if (kit.basic?.(m, id, dst, dmg) === true) {
    // The kit fired it (Sage's Steady Paw pierce shot).
  } else if (heroData(w, id).base.range > HERO_RULES.meleeMaxRange) {
    fireBolt(w, id, dst, dmg, HERO_RULES.projectile, PROJECTILE_KIND.hero);
  } else {
    dealDamage(m, id, w.team[id], Kind.Hero, dst, dmg, 'basic');
  }
  kit.afterBasic?.(m, id, dst);
}

/** Tower / core shot damage at `dst` (§5): heroes 150 with the ramp, minions 110; cores 120 at anything. */
export function structureShot(w: World, id: number, dst: number): number {
  if (w.kind[id] === Kind.Core) return CORE_STATS.damage;
  if (w.kind[dst] !== Kind.Hero) return TOWERS.minionDamage;
  const ramp = Math.min(w.streak[id] * TOWERS.rampBp, TOWERS.rampCapBp);
  return applyBp(TOWERS.heroDamage, BP_ONE + ramp);
}
