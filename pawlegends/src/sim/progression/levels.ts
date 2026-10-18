/**
 * Levels (POC.md §6.1): 1 to 10 by cumulative XP; each level adds the hero's per-level HP and armour (attack and
 * ability damage read the level directly). Talent tiers unlock at levels 3, 6 and 9; the ultimate at level 4.
 *
 * Sim v4: every XP grant gets the per-hero catch-up (+25% per level below the enemy team's average level, at most
 * +75%) and sends an `xp` event to the hero's team; a level-up heals 15% of max HP.
 */
import { HERO_HP_BP, HERO_IDS, HEROES } from '../../data/heroes';
import { XP } from '../../data/xp';
import type { SimEvent } from '../api';
import { BP_ONE, applyBp, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, type World } from '../world';
import { offerTalent } from '../heroes/talents';
import { HUMAN_SLOT, teamOfSlot } from '../api';
import { rulesOf } from '../rules';

export type XpReason = Extract<SimEvent, { type: 'xp' }>['reason'];

/** Level for a cumulative XP total. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < XP.maxLevel && xp >= XP.toLevel[level]) level++;
  return level;
}

/** Catch-up bonus (bp) for hero `id`: XP.catchUpPerLevelBp per level below the enemy average beyond the first, capped. */
export function catchUpBp(w: World, id: number): number {
  let sum = 0;
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] === w.team[id]) continue;
    sum += w.level[h];
    n++;
  }
  if (n === 0) return 0;
  // Sim v4: only the part beyond XP.catchUpFreeLevels behind counts, so a team that is a little ahead keeps its lead
  // while a hero far behind (a new player) still catches up.
  const behind = sum - n * (w.level[id] + XP.catchUpFreeLevels);
  if (behind <= 0) return 0;
  return Math.min(XP.catchUpMaxBp, idiv(XP.catchUpPerLevelBp * behind, n));
}

/** Give `amount` XP (before catch-up; `exact`: no catch-up) to hero `id`; levels up as often as it reaches. */
export function grantXp(m: MatchHandle, id: number, amount: number, reason: XpReason = 'minion', exact = false): void {
  const w = m.world;
  if (amount <= 0 || w.alive[id] === 0 || w.hp[id] <= 0) return;
  const bonus = exact ? 0 : catchUpBp(w, id);
  let total = bonus > 0 ? applyBp(amount, BP_ONE + bonus) : amount;
  // Sim v7 rubber band (DifficultyRules.enemyAheadXpBp, Rookie): an enemy hero XP.aheadLevels or more above the human
  // earns less XP, so a first-timer who feeds is not facing level 10s at 5:00 with level 7 allies.
  const rules = rulesOf(m);
  if (rules.enemyAheadXpBp < BP_ONE && w.team[id] !== teamOfSlot(HUMAN_SLOT) && w.level[id] >= w.level[HUMAN_SLOT] + XP.aheadLevels) {
    total = Math.max(1, applyBp(total, rules.enemyAheadXpBp));
  }
  w.xp[id] += total;
  m.events.push({ type: 'xp', tick: w.globals[G.Tick], id, amount: total, reason });
  const target = levelForXp(w.xp[id]);
  while (w.level[id] < target) levelUp(m, id);
}

/** Max HP of a hero at level 1 and per level (data/heroes HERO_HP_BP). */
export const heroHp = (hp: number): number => applyBp(hp, HERO_HP_BP);

export function levelUp(m: MatchHandle, id: number): void {
  const w = m.world;
  if (w.level[id] >= XP.maxLevel) return;
  const b = HEROES[HERO_IDS[w.sub[id]]].base;
  const per = heroHp(b.hpPerLevel);
  w.level[id]++;
  w.maxHp[id] += per;
  w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + per + applyBp(w.maxHp[id], XP.levelUpHealBp));
  w.armour[id] += b.armourPerLevel;
  m.stats[id].level = w.level[id];
  m.events.push({ type: 'levelup', tick: w.globals[G.Tick], id, level: w.level[id] });
  const tier = XP.talentLevels.indexOf(w.level[id]);
  if (tier >= 0) offerTalent(m, id, tier);
}
