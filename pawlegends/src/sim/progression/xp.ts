/**
 * Kill and minion XP, takedowns, assists, bounties (POC.md §6.1; sim v4 numbers in data/xp.ts).
 *
 * - Hero kill: 80 + 15 × victim level, +50% when the victim is more than one level above its killer, plus the
 *   victim's bounty (a takedown streak of 3+: +40 × streak, max +160). Shared equally among the enemy heroes within
 *   10 m and those who hit the victim in the last 10 s (assists). On Rookie and Easy (DIFFICULTY_RULES.nearAssists)
 *   every ally within 10 m counts as an assist too. The killer is the last hero to hit it (a tower or minion last
 *   hit credits the most recent hero who hit it in the window).
 * - Takedown heal: every credited hero alive gets TAKEDOWN_HEAL.healBp of its max HP back (a `buff` 'takedown').
 * - Takedown streak: every takedown (kill or assist) adds one, a death resets it. Reaching 3+ sends `bounty`;
 *   ending one sends `shutdown`. The match's first takedown sends `firstBlood`.
 * - Minion: melee 30, ranged 25, siege 60, shared among enemy heroes within 10 m. Every grant gets the per-hero
 *   catch-up (progression/levels.ts).
 */
import { WAVE } from '../../data/minions';
import { RAT_CAMP_STATS } from '../../data/camps';
import { TAKEDOWN_HEAL, XP } from '../../data/xp';
import { applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, NEVER, RANGE, type World } from '../world';
import { minionData } from '../units/kinds';
import { kitOf } from '../heroes/kit';
import { rulesOf } from '../rules';
import { HUMAN_SLOT } from '../api';
import { grantXp } from './levels';

const HEROES_N = RANGE.minions - RANGE.heroes;
const share = new Int32Array(HEROES_N);
const helpedBy = new Uint8Array(HEROES_N);

/** Did hero `h` hit `victim` within the assist window? */
export function assisted(w: World, victim: number, h: number): boolean {
  const t = w.assistTick[victim * HEROES_N + h];
  return t !== NEVER && w.globals[G.Tick] - t <= XP.assistWindow;
}

/** Bounty XP on a hero with takedown streak `streak` (0 below XP.bountyStreak). */
export const bountyOf = (streak: number): number => (streak >= XP.bountyStreak ? Math.min(XP.killPerStreak * streak, XP.killStreakMax) : 0);

/** Enemy hero `victim` died (step 7). Credits the kill, the assists, XP and the takedown hooks. */
export function heroKilled(m: MatchHandle, victim: number): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
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
  const bounty = bountyOf(w.killStreak[victim]);
  let reward = XP.killBase + XP.killPerLevel * w.level[victim];
  if (killer >= 0 && w.level[victim] > w.level[killer] + 1) reward = applyBp(reward, XP.upsetBp);
  reward += bounty;
  const nearAssists = rulesOf(m).nearAssists;
  const r2 = XP.shareRange * XP.shareRange;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    helpedBy[h] = 0;
    if (w.kind[h] !== Kind.Hero || w.team[h] !== enemy) continue;
    const near = w.alive[h] === 1 && dist2(w.x[h], w.y[h], w.x[victim], w.y[victim]) <= r2;
    const helped = h === killer || assisted(w, victim, h) || (nearAssists && near);
    if (helped) {
      helpedBy[h] = 1;
      if (h !== killer) m.stats[h].assists++;
    }
    if (near || helped) share[n++] = h;
  }
  if (killer >= 0) m.stats[killer].kills++;
  const rules = rulesOf(m);
  if (helpedBy[HUMAN_SLOT] === 1 && w.globals[G.Rally] < rules.rallyCap) w.globals[G.Rally]++;
  if (w.globals[G.FirstBlood] === 0) {
    w.globals[G.FirstBlood] = 1;
    m.events.push({ type: 'firstBlood', tick, killer, victim });
  }
  if (bounty > 0) m.events.push({ type: 'shutdown', tick, killer, victim, value: bounty });
  w.killStreak[victim] = 0;
  if (n > 0) {
    const each = idiv(reward, n);
    for (let i = 0; i < n; i++) grantXp(m, share[i], each, share[i] === killer ? 'kill' : 'assist');
  }
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (helpedBy[h] === 0) continue;
    const before = bountyOf(w.killStreak[h]);
    w.killStreak[h]++;
    // Only when the bounty appears or grows (it is capped at XP.killStreakMax).
    if (bountyOf(w.killStreak[h]) > before) m.events.push({ type: 'bounty', tick, id: h, value: bountyOf(w.killStreak[h]) });
    if (w.alive[h] === 1 && w.hp[h] > 0 && TAKEDOWN_HEAL.healBp > 0) {
      w.hp[h] = Math.min(w.maxHp[h], w.hp[h] + applyBp(w.maxHp[h], TAKEDOWN_HEAL.healBp));
      m.events.push({ type: 'buff', tick, id: h, kind: 'takedown', ticks: 0 });
    }
    kitOf(w, h).onTakedown?.(m, h, victim);
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
  const xp = minionData(w, id).xp;
  const each = idiv(xp, n);
  for (let i = 0; i < n; i++) grantXp(m, share[i], each, 'minion');
  // Sim v5: the hero who landed the last hit gets XP.lastHitBp of the minion's XP on top (last-hitting is a skill).
  const by = w.lastHitBy[id];
  if (by >= RANGE.heroes && by < RANGE.minions && w.kind[by] === Kind.Hero && w.team[by] === enemy) {
    for (let i = 0; i < n; i++) if (share[i] === by) grantXp(m, by, applyBp(xp, XP.lastHitBp), 'lastHit');
  }
}

/**
 * Rat `id` died: its share of the camp's XP (70 for the camp, 35 a rat) goes to the heroes of the killer's team
 * within XP.shareRange. The killer is the last unit that hit it (heroes, or a minion that wandered in). Returns the
 * killer's team, or −1.
 */
export function campKilled(m: MatchHandle, id: number): number {
  const w = m.world;
  const by = w.lastHitBy[id];
  if (by < 0 || w.team[by] > 1) return -1;
  const team = w.team[by];
  const r2 = XP.shareRange * XP.shareRange;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== team || w.alive[h] === 0 || w.hp[h] <= 0) continue;
    if (dist2(w.x[h], w.y[h], w.x[id], w.y[id]) <= r2) share[n++] = h;
  }
  if (n === 0) return team;
  let each = idiv(idiv(RAT_CAMP_STATS.xpTotal, RAT_CAMP_STATS.rats), n);
  // Sim v8: the team behind on levels gets XP.campBehindBp of the camp's XP.
  let ours = 0;
  let theirs = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero) continue;
    if (w.team[h] === team) ours += w.level[h];
    else theirs += w.level[h];
  }
  if (ours < theirs) each = applyBp(each, XP.campBehindBp);
  for (let i = 0; i < n; i++) grantXp(m, share[i], each, 'camp');
  return team;
}

/** XP trickle (per second from the first wave): every living hero. */
export function trickleXp(m: MatchHandle): void {
  const w = m.world;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] === Kind.Hero && w.alive[h] === 1) grantXp(m, h, XP.trickleXpPerSecond, 'trickle');
  }
}
