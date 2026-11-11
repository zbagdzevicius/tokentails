/**
 * Legends Pass, game side (docs/plans/moba/STORE-PASS.md §5): the season table is the catalogue mirror
 * (money/catalog.ts, pinned against the backend by tests/unit/store-pass.test.ts); the progress itself is the
 * server's (`GET /pawlegends/me` through the host's `store` message). Season XP is paid only by the backend's one
 * score writer after a verified match: the game never adds it locally and never claims a reward on its own.
 *
 * Copy rules (CLAIMS R8): it is "Season XP", never Tails, coins or money; every reward is listed up front.
 */
import { claimable, CURRENT_SEASON_ID, SEASON_XP, SEASONS, seasonDef, seasonTier, type PassRow, type SeasonDef } from '../money/catalog';

export { claimable, claimKey, rewardAt, SEASON_XP, seasonTier, seasonXpFor, type PassRow, type SeasonDef, type SeasonReward } from '../money/catalog';

export type Premium = 'none' | 'pass' | 'plus';

/** The server's pass row for the current season (host `store.season`). */
export interface PassState {
  id: string;
  xp: number;
  tier: number;
  premium: Premium;
  skips: number;
  claimed: string[];
  endsAt: string;
}

export const currentSeason = (): SeasonDef => seasonDef(CURRENT_SEASON_ID)!;

/** A typical match pays about this much Season XP (a loss with a few takedowns); used for "about N matches". */
export const TYPICAL_MATCH_XP = SEASON_XP.loss + 6 * SEASON_XP.perTakedown;

/** XP still needed for the next tier (0 at the last tier). */
export function xpToNext(def: SeasonDef, s: Pick<PassState, 'xp' | 'skips'>): number {
  const tier = seasonTier(def, s.xp, s.skips);
  if (tier >= def.tiers) return 0;
  return def.xpPerTier - (Math.max(0, s.xp) % def.xpPerTier);
}

/** "about N matches to tier X" for the pass header, or null at the last tier. */
export function matchesToNextText(def: SeasonDef, s: Pick<PassState, 'xp' | 'skips'>): string | null {
  const need = xpToNext(def, s);
  if (!need) return null;
  const n = Math.max(1, Math.ceil(need / TYPICAL_MATCH_XP));
  const next = seasonTier(def, s.xp, s.skips) + 1;
  return `about ${n} ${n === 1 ? 'match' : 'matches'} to tier ${next}`;
}

/** Rewards ready to claim for this state. */
export const readyRewards = (def: SeasonDef, s: PassState): { row: PassRow; tier: number; item: string }[] => claimable(def, s);

/** The free-row items of every season: the only pass items an app build draws (STORE-PASS.md §7, founder item 1). */
export const FREE_ROW_ITEMS: ReadonlySet<string> = new Set(SEASONS.flatMap((s) => s.free.map((r) => r.item)));

/** A readable season end date ("5 Jan 2027"), from the server's real date (no countdown timer). */
export function seasonEndText(endsAt: string): string {
  const d = new Date(endsAt);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
