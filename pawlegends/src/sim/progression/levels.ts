/**
 * Levels (POC.md §6.1): 1 to 10 by cumulative XP; each level adds the hero's per-level HP and armour (attack and
 * ability damage read the level directly). Talent tiers unlock at levels 3, 6 and 9; the ultimate at level 4.
 */
import { HERO_IDS, HEROES } from '../../data/heroes';
import { XP } from '../../data/xp';
import type { MatchHandle } from '../state';
import { G } from '../world';
import { offerTalent } from '../heroes/talents';

/** Level for a cumulative XP total. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < XP.maxLevel && xp >= XP.toLevel[level]) level++;
  return level;
}

/** Give `amount` XP to hero `id`; levels up as often as it reaches. */
export function grantXp(m: MatchHandle, id: number, amount: number): void {
  const w = m.world;
  if (amount <= 0 || w.alive[id] === 0 || w.hp[id] <= 0) return;
  w.xp[id] += amount;
  const target = levelForXp(w.xp[id]);
  while (w.level[id] < target) levelUp(m, id);
}

export function levelUp(m: MatchHandle, id: number): void {
  const w = m.world;
  if (w.level[id] >= XP.maxLevel) return;
  const b = HEROES[HERO_IDS[w.sub[id]]].base;
  w.level[id]++;
  w.maxHp[id] += b.hpPerLevel;
  w.hp[id] += b.hpPerLevel;
  w.armour[id] += b.armourPerLevel;
  m.stats[id].level = w.level[id];
  m.events.push({ type: 'levelup', tick: w.globals[G.Tick], id, level: w.level[id] });
  const tier = XP.talentLevels.indexOf(w.level[id]);
  if (tier >= 0) offerTalent(m, id, tier);
}
