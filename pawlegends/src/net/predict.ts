/**
 * Cosmetic prediction for party play (MULTIPLAYER.md §4.3). Never touches the sim: it only moves where your own hero
 * is DRAWN. After a Move, the hero gets a visual lead toward the target at its snapshot speed, by at most the measured
 * input latency; the shown offset blends to the new value over 120 ms whenever a snapshot disagrees, so the drawn
 * hero converges on the authoritative one within 150 ms. No lead while the snapshot shows stun, root, fear (charm),
 * forced movement or a dash, or while dead.
 */
export const BLEND_MS = 120;
/** mm per tick at which the hero is assumed to move when no speed is known. */
export const DEFAULT_SPEED = 120;

export interface PredictInput {
  x: number;
  y: number;
  /** Crowd control or a dash: no lead. */
  locked: boolean;
  /** Snapshot speed, mm per tick (30 Hz). */
  speed: number;
}

export class Predictor {
  private target: { x: number; y: number; atMs: number } | null = null;
  private shown = { dx: 0, dy: 0, atMs: 0 };
  private from = { dx: 0, dy: 0 };
  private want = { dx: 0, dy: 0 };

  /** The player issued a Move to (x, y). */
  move(x: number, y: number, nowMs: number): void {
    this.target = { x, y, atMs: nowMs };
  }

  /** Any other command (or arrival): stop leading. */
  stop(): void {
    this.target = null;
  }

  /** The offset to draw now, given the latest authoritative position and the measured input latency. */
  offset(a: PredictInput, latencyMs: number, nowMs: number): { dx: number; dy: number } {
    let wx = 0;
    let wy = 0;
    if (this.target && !a.locked) {
      const tx = this.target.x - a.x;
      const ty = this.target.y - a.y;
      const dist = Math.hypot(tx, ty);
      const leadMs = Math.max(0, Math.min(latencyMs, nowMs - this.target.atMs));
      const lead = Math.min(dist, (a.speed * leadMs) / (1000 / 30));
      if (dist > 1) {
        wx = (tx / dist) * lead;
        wy = (ty / dist) * lead;
      } else this.target = null;
    }
    if (wx !== this.want.dx || wy !== this.want.dy) {
      // a disagreement: blend from what is shown now
      const cur = this.current(nowMs);
      this.from = cur;
      this.want = { dx: wx, dy: wy };
      this.shown.atMs = nowMs;
    }
    return this.current(nowMs);
  }

  private current(nowMs: number): { dx: number; dy: number } {
    const k = Math.max(0, Math.min(1, (nowMs - this.shown.atMs) / BLEND_MS));
    return { dx: this.from.dx + (this.want.dx - this.from.dx) * k, dy: this.from.dy + (this.want.dy - this.from.dy) * k };
  }
}
