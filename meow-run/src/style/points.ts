// STYLE lane, pure: trick and combo point values, chain weights and the combo tiers. Style points are RAW
// (score.addPoints(n, true), never x G.mult), so the campaign star targets stay fair (see balance.test.ts).

export type TrickId = 'SPIN' | 'DOUBLE' | 'TRIPLE' | 'FLIP' | 'CORKSCREW' | 'PAW-DIVE';
export const TRICK_IDS: readonly TrickId[] = ['SPIN', 'DOUBLE', 'TRIPLE', 'FLIP', 'CORKSCREW', 'PAW-DIVE'];

/** base raw points of a landed trick (times the combo tier multiplier) */
export const TRICK_POINTS: Readonly<Record<TrickId, number>> = { SPIN: 250, DOUBLE: 600, TRIPLE: 1200, FLIP: 200, CORKSCREW: 700, 'PAW-DIVE': 300 };
/** what the popup says */
export const TRICK_NAMES: Readonly<Record<TrickId, string>> = {
  SPIN: 'SPIN',
  DOUBLE: 'DOUBLE SPIN',
  TRIPLE: 'TRIPLE SPIN',
  FLIP: 'FLIP',
  CORKSCREW: 'CORKSCREW',
  'PAW-DIVE': 'PAW-DIVE',
};
/** a set piece cleared in style: vault landed, wall-run left, cloud ride or river finished, chase escaped (no hit) */
export const SETPIECE_POINTS = 400;
/** banked chain = round(BANK_PER_LINK x n x tierMul) */
export const BANK_PER_LINK = 15;

/** what each event adds to the chain */
export const WEIGHTS = {
  fish: 0.25, // a full fish line is about 2-3 links
  pickup: 1, // yarn, treat, food, ring
  nearMiss: 2,
  bell: 3,
  trick: 2,
  double: 3,
  triple: 4,
  setPiece: 3,
} as const;

/** chain length that reaches each tier (tier 1..6) */
export const TIER_AT: readonly number[] = [5, 10, 20, 35, 50, 75];
/** index = tier (0 = no tier yet) */
// (tier 2 is not PURRFECT!: that is core's landing callout and the results title)
export const TIER_NAMES: readonly string[] = ['', 'NICE!', 'PAWSOME!', 'CLAW-SOME!', 'FUR-OCIOUS!', 'NINE LIVES!', 'CAT-ASTROPHIC!'];
/** index = tier */
export const TIER_MUL: readonly number[] = [1, 1, 1.25, 1.5, 2, 2.5, 3];
export const MAX_TIER = TIER_AT.length;

/** 0 (below 5) .. 6 (75 and up) */
export function tierFor(n: number): number {
  let t = 0;
  while (t < TIER_AT.length && n >= TIER_AT[t]) t++;
  return t;
}
export const tierMul = (tier: number): number => TIER_MUL[Math.max(0, Math.min(MAX_TIER, Math.floor(tier) || 0))];

export const trickPoints = (id: TrickId, tier: number): number => Math.round(TRICK_POINTS[id] * tierMul(tier));
export const setPiecePoints = (tier: number): number => Math.round(SETPIECE_POINTS * tierMul(tier));
/** points for banking a chain of n links (at the chain's tier; by default the tier n alone reaches) */
export const bankPoints = (n: number, tier = tierFor(n)): number => (n > 0 ? Math.round(BANK_PER_LINK * n * tierMul(tier)) : 0);

export function trickWeight(id: TrickId): number {
  if (id === 'DOUBLE') return WEIGHTS.double;
  if (id === 'TRIPLE') return WEIGHTS.triple;
  return WEIGHTS.trick;
}
