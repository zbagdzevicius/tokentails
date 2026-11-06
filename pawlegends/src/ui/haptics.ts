/**
 * Haptics (FUN-PROGRESSION-V12 C11c): short vibrations on a phone for the moments the thumb should feel. Touch only
 * (`data-touch` set by the touch controls), guarded: no `navigator.vibrate` (iOS Safari, desktop) means nothing
 * happens and nothing throws. Durations in ms; a pattern is vibrate, pause, vibrate.
 */
export const HAPTIC = Object.freeze({
  cast: 8,
  lastHit: 10,
  takedown: 15,
  toy: Object.freeze([10, 40, 10]) as readonly number[],
  levelUp: 12,
  cc: 25,
});

export type HapticKind = keyof typeof HAPTIC;

/** The pattern sent for `kind` (a number or a vibrate-pause-vibrate list). */
export function hapticPattern(kind: HapticKind): number | number[] {
  const p = HAPTIC[kind];
  return typeof p === 'number' ? p : [...p];
}

interface VibrateNav {
  vibrate?: (p: number | number[]) => boolean;
}

/** Minimum gap (ms) between two buzzes, so a teamfight is not one long rattle. */
const GAP_MS = 60;
let lastAt = -1e9;

/**
 * Buzz for `kind` when on a touch device that can vibrate. Returns whether a vibration was asked for. `nav`, `touch`
 * and `now` are injectable for tests.
 */
export function haptic(
  kind: HapticKind,
  nav: VibrateNav | undefined = typeof navigator !== 'undefined' ? (navigator as VibrateNav) : undefined,
  touch: boolean = typeof document !== 'undefined' && document.documentElement?.dataset?.touch === '1',
  now: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
): boolean {
  if (!touch || !nav || typeof nav.vibrate !== 'function') return false;
  if (now - lastAt < GAP_MS && kind !== 'toy' && kind !== 'takedown') return false;
  lastAt = now;
  try {
    return nav.vibrate(hapticPattern(kind)) !== false;
  } catch {
    return false;
  }
}

/** Tests: forget the last buzz time. */
export function resetHaptics(): void {
  lastAt = -1e9;
}
