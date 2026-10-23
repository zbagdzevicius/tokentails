// Pure scoring rules (no DOM, no three). FROZEN. Unit-tested in scoring.test.ts.

export const RANKS: [number, string][] = [
  [0, 'Lap Kitten'],
  [60, 'Curtain Climber'],
  [200, 'Vase Assassin'],
  [600, 'Alley Menace'],
  [1500, 'CAT-ASTROPHE'],
  [3000, 'ULTRA CAT'],
];

/** Combo multiplier: x1, +1 every 8 hits, capped at x5. */
export function comboMult(combo: number): number {
  return 1 + Math.min(4, Math.floor(combo / 8));
}

/** Points actually banked for a raw $M hit. */
export function scoredValue(m: number, combo: number, frenzy: boolean, valueMul = 1): number {
  return m * comboMult(combo) * (frenzy ? 2 : 1) * valueMul;
}

/** $ per segment multiplier: the city gets pricier as the round goes on, and the WANTED landmark pays 3x. */
export function segValueMul(elapsed: number, isWanted: boolean): number {
  return (1 + elapsed / 45) * (isWanted ? 3 : 1);
}

/** ULTRA meter gain for a raw hit: big hits capped so the meter takes ~20 s. */
export function ultraGain(m: number, charge = 1): number {
  return Math.min(m, 3) * charge;
}

/** $M formatting: $250K, $3.4M, $1.25B. */
export function money(m: number): string {
  return m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : m >= 1 ? `$${m.toFixed(1)}M` : m <= 0 ? '$0' : `$${Math.round(m * 1000)}K`;
}

export function rankOf(d: number, ranks: [number, string][] = RANKS): number {
  let r = 0;
  ranks.forEach(([t], i) => {
    if (d >= t) r = i;
  });
  return r;
}
