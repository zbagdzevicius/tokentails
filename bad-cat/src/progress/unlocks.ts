/**
 * Unlock ids (GDD 8) for UI badges: season tiers reached (limited by the allowance: free 15, Club 30) and
 * streak milestones. Ids are opaque strings ("s1:t7", "streak:7"); cosmetics themselves come from
 * `ownedCosmetics` (cosmetics.ts).
 */
import { FREE_SEASON_TIERS, type Store } from '../types';
import { readSeason, seasonFor, tierFor } from './season';
import { readStreak } from './streak';

export { FREE_SEASON_TIERS };
export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const;

export function unlocksFor(store: Store, now: Date = new Date(), seasonTiers = FREE_SEASON_TIERS): string[] {
  try {
    const out: string[] = [];
    const s = readSeason(store, now);
    const tier = Math.min(tierFor(s.xp), seasonTiers);
    const id = seasonFor(now).id;
    for (let t = 1; t <= tier; t++) out.push(`${id}:t${t}`);
    const best = readStreak(store).best;
    for (const m of STREAK_MILESTONES) if (best >= m) out.push(`streak:${m}`);
    return out;
  } catch {
    return [];
  }
}
