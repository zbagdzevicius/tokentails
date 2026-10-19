/**
 * Haptics gate (B62): `navigator.vibrate` only after a real user gesture (never in `?bot` runs, which start without
 * one) and only while the haptics setting is on. Android only in practice; iOS Safari has no vibrate.
 */
import { a11y } from '../ui/a11y';

let gesture = false;

/** The shell calls this from a real pointer / key event. */
export function armHaptics(): void {
  gesture = true;
}

export function vibrate(p: number | number[]): void {
  try {
    if (!gesture || !a11y().haptics || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate(p);
  } catch {
    /* ignored */
  }
}
