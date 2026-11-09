/**
 * PERF-IOS §8 Track C: cooldown sweeps without a style write on every frame. The HUD slots (`ui/hud.ts`) and the
 * touch buttons (`input/touch/touchControls.ts`) wrote `--cd` (the share of the cooldown left) on every frame while a
 * skill cooled down: 55 writes a second each, every one a style recalc and a repaint of the button.
 *
 * The sweep is now drawn in SWEEP_STEPS steps of the circle (4°: under 2 px of arc on a 56 px button), and `--cd` is
 * written only when the step changes: a 6 s cooldown writes 15 times a second, a 12 s one 7.5 times, never more than
 * once a frame. It reads the sim's cooldown each frame as before, so pauses, refunds and slow motion need no special
 * case, and it never shows "ready" early: a step is rounded up.
 *
 * Measured first, then chosen: one CSS animation of a registered `--cd` per cooldown (as `ui/abilityBar.js` does)
 * cut the DOM writes but ran a style recalc at the display rate for every running sweep, outside the JS frame:
 * Chromium's style recalcs in a fight went from ~39 to ~69 a second and style time up by a quarter (§8.13).
 */
export const SWEEP_STEPS = 90;

/** The drawn share of the cooldown left (0..1), rounded up to a step; 0 only when the cooldown is over. Pure. */
export function sweepFrac(cd: number, max: number, steps = SWEEP_STEPS): number {
  if (!(cd > 0)) return 0;
  const f = max > 0 ? Math.min(1, cd / max) : 1;
  return Math.max(1, Math.ceil(f * steps - 1e-9)) / steps;
}

/** One sweep's last written value (no `getPropertyValue` read per frame). */
export interface SweepRec {
  last: string;
}

export const newSweep = (): SweepRec => ({ last: '' });

/** Write `--cd` on `el` only when its step changed. Returns true when it wrote. */
export function applySweep(el: HTMLElement, r: SweepRec, cd: number, max: number, steps = SWEEP_STEPS): boolean {
  const v = sweepFrac(cd, max, steps).toFixed(4);
  if (v === r.last) return false;
  r.last = v;
  el.style.setProperty('--cd', v);
  return true;
}
