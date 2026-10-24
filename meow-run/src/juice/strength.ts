// Pure: how strong the speed lines are for a player state (0..1). Vitest checks the curve.

export interface SpeedState {
  speed: number;
  mode: string;
  ability: string | null;
  sincePounce: number;
  boostT: number;
  boostMul: number;
  sinceHit: number;
}

export function speedLineStrength(p: Readonly<SpeedState>, reducedMotion: boolean): number {
  let s = Math.max(0, Math.min(1, (p.speed - 21) / 9)) * 0.55;
  if (p.boostT > 0 && p.boostMul > 1) s += 0.45;
  if (p.sincePounce < 0.35) s += 0.45 * (1 - p.sincePounce / 0.35);
  if (p.ability === 'vault') s += 0.5;
  else if (p.ability === 'cloud') s += 0.35;
  if (p.mode === 'finish') s *= 0.3;
  if (p.sinceHit < 0.6) s *= 0.4;
  s = Math.min(1, s);
  return reducedMotion ? s * 0.35 : s;
}

/** STYLE: extra speed-line strength from the combo tier (0..6): +0.25 x tier / 6 (softened for reduced motion). */
export function styleLineBoost(tier: number, reducedMotion: boolean): number {
  const t = Math.max(0, Math.min(6, Number.isFinite(tier) ? tier : 0));
  const s = (0.25 * t) / 6;
  return reducedMotion ? s * 0.35 : s;
}
/** combo tier 3 (CLAW-SOME!) and up turns the lines gold */
export const GOLD_TIER = 3;
export const isGoldTier = (tier: number): boolean => tier >= GOLD_TIER;
