/**
 * PERF-IOS P1-1: the frame pacer. `requestAnimationFrame` keeps running (input, the loop stays alive), but a frame
 * is only simulated and drawn once `1000 / fps` ms have passed since the last drawn one, with a TOLERANCE_MS slack so
 * a 60 Hz display never drops a 60 fps target to 30 by jitter, and a 120 Hz display draws every second refresh.
 *
 * Targets (`paceTarget`): the match 60, or the player's Frame rate setting (30 / 90 / 120; 30 with Battery saver or
 * when the governor reached its 30 fps step, whatever the setting); every
 * menu, the lobby turntable, the pick and results screens 30; a paused match and a full-screen panel over the lobby
 * PAUSED_FPS. Animation speed never changes: the caller passes the real time since the last drawn frame as `dt`.
 * Pure (no globals), unit-tested.
 */
export const TOLERANCE_MS = 2;
export const MATCH_FPS = 60;
export const SAVER_FPS = 30;
export const MENU_FPS = 30;
export const PAUSED_FPS = 15;

export interface PaceInput {
  inMatch: boolean;
  paused: boolean;
  /** A full-screen panel covers the 3D view (settings, store, a modal). */
  covered: boolean;
  /** Battery saver on, or the thermal governor's 30 fps step. */
  saver: boolean;
  /** Gaps round 3: the player's match frame rate (Settings "Frame rate": 30, 60, 90, 120); MATCH_FPS when unset. */
  matchFps?: number;
}

export function paceTarget(p: PaceInput): number {
  if (p.inMatch) {
    if (p.paused || p.covered) return PAUSED_FPS;
    return p.saver ? SAVER_FPS : (p.matchFps ?? MATCH_FPS);
  }
  return p.covered ? PAUSED_FPS : MENU_FPS;
}

export class FramePacer {
  /**
   * The next frame's due time (ms) on a fixed grid of `1000 / fps` steps, so a jittery or fast display averages the
   * target exactly; after a stall the grid restarts from now (no burst of catch-up frames).
   */
  private next = -Infinity;
  /** Frames skipped since the last drawn one (perf readout). */
  skipped = 0;

  /** True when this rAF callback should draw at `fps`. Records it as drawn. */
  due(now: number, fps: number): boolean {
    const interval = 1000 / Math.max(1, fps);
    if (now < this.next - TOLERANCE_MS) {
      this.skipped++;
      return false;
    }
    this.next = this.next === -Infinity ? now + interval : Math.max(this.next + interval, now + interval * 0.5);
    this.skipped = 0;
    return true;
  }

  /** The next frame draws whatever the time (resume from the background, a new target). */
  reset(): void {
    this.next = -Infinity;
  }
}

/**
 * PERF-IOS §8 Track C: how long the loading veil waits for the match's programs. `rosterMs`: the most it waits for
 * the welcome (the roster) before giving up on the warm-up; `totalMs`: the most the veil stays up in all (the VS card
 * and the countdown run under it, and the sim starts only on "Ready!"); `minMs`: the veil's old minimum; `settleMs`:
 * frames drawn after the warm-up, still under the veil (anything first drawn there links there).
 */
export const WARM = Object.freeze({ rosterMs: 1500, totalMs: 2400, minMs: 250, pollMs: 30, settleMs: 120 });

export interface WarmResult {
  /** Time from the session start to the veil drop (ms); -1 when the session ended first. */
  ms: number;
  /** The warm-up finished inside the cap. */
  warmed: boolean;
}

/**
 * Keep the veil up until the warm-up resolves, with time caps (pure orchestration, unit-tested with fake clocks).
 * `ready()`: true once the roster is known, false while waiting, null when the session is gone.
 */
export async function warmMatch(
  ready: () => boolean | null,
  warm: () => Promise<unknown>,
  wait: (ms: number) => Promise<void>,
  elapsed: () => number,
  W: { rosterMs: number; totalMs: number; minMs: number; pollMs: number; settleMs: number } = WARM,
): Promise<WarmResult> {
  for (;;) {
    const r = ready();
    if (r === null) return { ms: -1, warmed: false };
    if (r) break;
    if (elapsed() >= W.rosterMs) return { ms: elapsed(), warmed: false };
    await wait(W.pollMs);
  }
  let warmed = false;
  const job = Promise.resolve()
    .then(warm)
    .then(
      () => {
        warmed = true;
      },
      () => undefined,
    );
  await Promise.race([job, wait(Math.max(0, W.totalMs - elapsed()))]);
  if (warmed && W.settleMs > 0) await wait(Math.min(W.settleMs, Math.max(0, W.totalMs - elapsed())));
  if (elapsed() < W.minMs) await wait(W.minMs - elapsed());
  return { ms: elapsed(), warmed };
}
