/**
 * Wave C (C3): the player's motion settings for combat VFX. Screen shake Full / Low / Off (Settings), and the OS
 * "reduce motion" switch (`prefers-reduced-motion: reduce`), which caps shake at the Low level, cuts particle counts
 * and turns off the moving extras (slash sweep, lightning flicker, aura motes). Render only: never feeds the sim.
 */
export type ShakePref = 'full' | 'low' | 'off';

const KEY = 'pawlegends.shake';
/** Camera shake multiplier per setting (Juice.shakeScale). */
export const SHAKE_SCALE: Readonly<Record<ShakePref, number>> = Object.freeze({ full: 1, low: 0.4, off: 0 });
/** Reduce motion: shake never above this, and every VFX burst count × REDUCED_COUNT. */
export const REDUCED_SHAKE = 0.4;
export const REDUCED_COUNT = 0.6;

let mem: ShakePref | null = null;

export function shakePref(): ShakePref {
  if (mem) return mem;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'full' || v === 'low' || v === 'off') return (mem = v);
  } catch {
    /* storage blocked */
  }
  return 'full';
}

export function setShakePref(p: ShakePref): void {
  mem = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage blocked */
  }
}

/** Tests: forget the in-memory copy. */
export function resetShakePref(): void {
  mem = null;
}

/** The OS asks for less motion. */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The shake multiplier for a setting, capped under reduce motion. */
export function shakeScaleFor(p: ShakePref, reduced: boolean): number {
  const s = SHAKE_SCALE[p];
  return reduced ? Math.min(s, REDUCED_SHAKE) : s;
}
