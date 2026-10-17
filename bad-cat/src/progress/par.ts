/**
 * Par paws (GDD 8): bronze / silver / gold per room from `content/par.json` thresholds.
 * 0 = none, 1 bronze, 2 silver, 3 gold. No par for a room = no paws (never a fake medal).
 */
export interface Par {
  bronze: number;
  silver: number;
  gold: number;
}

export const PAW_NAMES = ['', 'Bronze paw', 'Silver paw', 'Gold paw'] as const;

export function parPaws(score: number, par?: Par | null): 0 | 1 | 2 | 3 {
  if (!par || !Number.isFinite(score)) return 0;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (ok(par.gold) && score >= par.gold) return 3;
  if (ok(par.silver) && score >= par.silver) return 2;
  if (ok(par.bronze) && score >= par.bronze) return 1;
  return 0;
}
