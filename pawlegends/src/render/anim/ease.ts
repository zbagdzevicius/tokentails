/** Ease curves for clip keys (ANIM-SPEC §3): u in 0..1 → 0..1 (back / elastic overshoot past 1). Pure, no allocation. */
import type { Ease } from './types';

export const EASE_NAMES: readonly Ease[] = Object.freeze(['lin', 'in', 'out', 'inOut', 'back', 'backBig', 'expoIn', 'expoOut', 'elastic', 'step', 'hold']);
export const EASE_INDEX: Readonly<Record<Ease, number>> = Object.freeze(Object.fromEntries(EASE_NAMES.map((e, i) => [e, i])) as Record<Ease, number>);

const backOut = (u: number, s: number): number => {
  const v = u - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
};

/** Evaluate ease `i` (EASE_INDEX) at u. */
export function ease(i: number, u: number): number {
  if (u <= 0) return i === 9 ? (u < 0 ? 0 : 1) : 0;
  if (u >= 1) return 1;
  switch (i) {
    case 1:
      return u * u * u;
    case 2: {
      const v = 1 - u;
      return 1 - v * v * v;
    }
    case 3:
      return u * u * (3 - 2 * u);
    case 4:
      return backOut(u, 1.70158);
    case 5:
      return backOut(u, 2.6);
    case 6:
      return Math.pow(2, 10 * (u - 1));
    case 7:
      return 1 - Math.pow(2, -10 * u);
    case 8:
      return Math.pow(2, -9 * u) * Math.sin((u - 0.075) * ((2 * Math.PI) / 0.3)) + 1;
    case 9:
      return 1;
    case 10:
      return 0;
    default:
      return u;
  }
}

export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
