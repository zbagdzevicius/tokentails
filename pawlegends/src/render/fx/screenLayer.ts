/**
 * Audit GFX-10: one full-screen layer at a time (render only). Low health (the persistent red vignette), a screen
 * flash (gold, white, red: Juice.flash) and the enemy-ult red edge (UltMoment) each washed the whole screen, and
 * together they buried the fight. A transient layer asks `claimScreen` first and is skipped while another one shows;
 * the low-health vignette holds the screen while it is on (its own rail notes still say what happened).
 */
let held = false;
let busyUntil = 0;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** May a transient full-screen layer show now for `ms`? True claims the screen until then. */
export function claimScreen(ms: number, at = now()): boolean {
  if (held || at < busyUntil) return false;
  busyUntil = at + ms;
  return true;
}

/** The low-health vignette is on (`on`) or off: while on, no transient layer shows. */
export function holdScreen(on: boolean): void {
  held = on;
}

/** Tests and a new match: nothing holds the screen. */
export function resetScreen(): void {
  held = false;
  busyUntil = 0;
}
