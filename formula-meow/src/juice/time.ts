/**
 * Time warp (GDD 11 juice): hit-stop (a few frames near-frozen when a hit lands) and the finish slow-mo.
 * The shell multiplies its frame dt by `scale(dt)` before feeding the fixed-step accumulator, so the sim still runs
 * whole 60 Hz ticks and replays stay exact: only how fast real time feeds the ticks changes. Pure, unit-tested.
 */
export class TimeWarp {
  private stopLeft = 0;
  private stopScale = 1;
  private slowLeft = 0;
  private slowDur = 0;
  private slowMin = 1;
  /** disabled for e2e speed runs and bots */
  enabled = true;

  /** Freeze to `scale` for `seconds` of real time (the longer one wins). */
  hitStop(seconds: number, scale = 0.05): void {
    if (seconds > this.stopLeft) {
      this.stopLeft = seconds;
      this.stopScale = scale;
    }
  }

  /** Drop to `min` and ease back to 1 over `seconds`. */
  slowMo(seconds: number, min: number): void {
    this.slowLeft = seconds;
    this.slowDur = seconds;
    this.slowMin = min;
  }

  /** Advance by a real frame dt; returns the time scale for this frame. */
  scale(dt: number): number {
    if (!this.enabled) return 1;
    let s = 1;
    if (this.stopLeft > 0) {
      this.stopLeft -= dt;
      s = this.stopScale;
    }
    if (this.slowLeft > 0) {
      this.slowLeft = Math.max(0, this.slowLeft - dt);
      const k = this.slowLeft / this.slowDur; // 1 → 0
      s = Math.min(s, this.slowMin + (1 - this.slowMin) * (1 - k) * (1 - k));
    }
    return s;
  }

  reset(): void {
    this.stopLeft = 0;
    this.slowLeft = 0;
  }
}
