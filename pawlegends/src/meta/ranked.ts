/**
 * Ranked tiers (docs/plans/moba/SOCIAL-RANKED.md §7.2, §11.1): the game's copy of
 * `backend/src/pawlegends/ranked/tiers.ts` (names, anchors, protection and the point constants), deep-compared by
 * tests/unit/ranked-tiers.test.ts. The server computes every number; the game only labels them. The liquidity gate's
 * thresholds are shown from the server's answer (`RANKED_OPEN_FALLBACK` only before it arrives).
 *
 * Naming: "Kitten" and "Legend" are also card awaken words, so a ranked label always carries its division or points
 * ("Kitten III", "Legend · 240 pts").
 */

export interface RankedTierDef {
  id: 'kitten' | 'tabby' | 'alley' | 'lion' | 'legend';
  name: string;
  anchors: number[];
  protected: boolean;
}

export const RANKED_TIERS: readonly RankedTierDef[] = Object.freeze([
  { id: 'kitten', name: 'Kitten', anchors: [1000, 1075, 1150], protected: true },
  { id: 'tabby', name: 'Tabby', anchors: [1225, 1300, 1375], protected: true },
  { id: 'alley', name: 'Alley', anchors: [1450, 1525, 1600], protected: false },
  { id: 'lion', name: 'Lion', anchors: [1675, 1750, 1825], protected: false },
  { id: 'legend', name: 'Legend', anchors: [1900], protected: false },
]);

export const DIVISION_NUMERALS = Object.freeze(['III', 'II', 'I']);

export const RANKED_POINTS = Object.freeze({
  win: 20,
  loss: 15,
  span: 400,
  cMin: 0.5,
  cMax: 1.5,
  division: 100,
  shield: 1,
  demotedTo: 75,
  dodge: 3,
  decayAfterDays: 14,
  decayPerDay: 20,
});

export const PLACEMENTS = Object.freeze({ first: 5, season: 3 });
export const LEGEND_IDX = 12;
/** Shown only until the server's `ranked/status` answers. */
export const RANKED_OPEN_FALLBACK = 24;

/** "Tabby II", or "Legend · 240 pts". Pure. */
export function rankedLabel(tierIdx: number, points?: number): string {
  if (tierIdx >= LEGEND_IDX) return `Legend · ${Math.max(0, Math.floor(points ?? 0))} pts`;
  const t = RANKED_TIERS[Math.max(0, Math.min(3, Math.floor(tierIdx / 3)))];
  const div = DIVISION_NUMERALS[Math.max(0, tierIdx) % 3];
  return points === undefined ? `${t.name} ${div}` : `${t.name} ${div} · ${Math.max(0, Math.floor(points))} / 100`;
}
