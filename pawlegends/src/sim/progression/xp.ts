/**
 * Kill and minion XP, takedowns and assists (POC.md §6.1).
 *
 * - Hero kill: 100 + 20 × victim level + 25 per victim kill-streak step (max +100), shared equally among the enemy
 *   heroes within 10 m and those who hit the victim in the last 6 s (assists). The killer is the last hero to hit it
 *   (a tower or minion last hit credits the most recent hero who hit it in the window).
 * - Minion: melee 30, ranged 25, siege 60, shared among enemy heroes within 10 m; +20% when the team's total level
 *   is behind.
 */
import { WAVE } from '../../data/minions';
import { RAT_CAMP_STATS } from '../../data/camps';
import { XP } from '../../data/xp';
import { applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, NEVER, RANGE, type World } from '../world';
import { minionData } from '../units/kinds';
import { kitOf } from '../heroes/kit';
import { grantXp } from './levels';

const HEROES_N = RANGE.minions - RANGE.heroes;
const share = new Int32Array(HEROES_N);

function teamLevel(w: World, team: number): number {
  let sum = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.kind[h] === Kind.Hero && w.team[h] === team) sum += w.level[h];
  return sum;
}

/** Did hero `h` hit `victim` within the assist window? */
export function assisted(w: World, victim: number, h: number): boolean {
  const t = w.assistTick[victim * HEROES_N + h];
  return t !== NEVER && w.globals[G.Tick] - t <= XP.assistWindow;
}

/** Enemy hero `victim` died (step 7). Credits the kill, the assists, XP and the takedown hooks. */
export function heroKilled(m: MatchHandle, victim: number): void {
  const w = m.world;
  const enemy = 1 - w.team[victim];
  const last = w.lastHitBy[victim];
  let killer = last >= 0 && last < RANGE.minions && w.team[last] === enemy ? last : -1;
  if (killer < 0) {
    let best = NEVER;
    for (let h = RANGE.heroes; h < RANGE.minions; h++) {
      if (w.team[h] !== enemy || !assisted(w, victim, h)) continue;
      const t = w.assistTick[victim * HEROES_N + h];
      if (t > best) {
        best = t;
        killer = h;
      }
    }
  }
  const bounty = XP.killBase + XP.killPerLevel * w.level[victim] + Math.min(XP.killPerStreak * w.killStreak[victim], XP.killStreakMax);
  const r2 = XP.shareRange * XP.shareRange;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== enemy) continue;
    const near = w.alive[h] === 1 && dist2(w.x[h], w.y[h], w.x[victim], w.y[victim]) <= r2;
    const helped = h === killer || assisted(w, victim, h);
    if (helped && h !== killer) m.stats[h].assists++;
    if (near || helped) share[n++] = h;
  }
  if (killer >= 0) {
    m.stats[killer].kills++;
    w.killStreak[killer]++;
  }
  w.killStreak[victim] = 0;
  if (n > 0) {
    const each = idiv(bounty, n);
    for (let i = 0; i < n; i++) grantXp(m, share[i], each);
  }
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== enemy) continue;
    if (h === killer || assisted(w, victim, h)) kitOf(w, h).onTakedown?.(m, h, victim);
  }
  for (let h = 0; h < HEROES_N; h++) w.assistTick[victim * HEROES_N + h] = NEVER;
}

/** Lane minion `id` died: its XP goes to the enemy heroes within 10 m. */
export function minionKilled(m: MatchHandle, id: number): void {
  const w = m.world;
  const enemy = 1 - w.team[id];
  const r2 = WAVE.xpRange * WAVE.xpRange;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== enemy || w.alive[h] === 0 || w.hp[h] <= 0) continue;
    if (dist2(w.x[h], w.y[h], w.x[id], w.y[id]) <= r2) share[n++] = h;
  }
  if (n === 0) return;
  let xp: number = minionData(w, id).xp;
  if (teamLevel(w, enemy) < teamLevel(w, 1 - enemy)) xp = applyBp(xp, XP.catchUpBp);
  const each = idiv(xp, n);
  for (let i = 0; i < n; i++) grantXp(m, share[i], each);
}

/**
 * Rat `id` died: its share of the camp's XP (70 for the camp, 35 a rat) goes to the heroes of the killer's team
 * within XP.shareRange. The killer is the last unit that hit it (heroes, or a minion that wandered in).
 */
export function campKilled(m: MatchHandle, id: number): void {
  const w = m.world;
  const by = w.lastHitBy[id];
  if (by < 0 || w.team[by] > 1) return;
  const team = w.team[by];
  const r2 = XP.shareRange * XP.shareRange;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== team || w.alive[h] === 0 || w.hp[h] <= 0) continue;
    if (dist2(w.x[h], w.y[h], w.x[id], w.y[id]) <= r2) share[n++] = h;
  }
  if (n === 0) return;
  const each = idiv(idiv(RAT_CAMP_STATS.xpTotal, RAT_CAMP_STATS.rats), n);
  for (let i = 0; i < n; i++) grantXp(m, share[i], each);
}
