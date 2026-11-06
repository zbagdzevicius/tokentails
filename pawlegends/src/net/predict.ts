/**
 * Cosmetic prediction for party play (MULTIPLAYER.md §4.3). Never touches the sim: it only moves where your own hero
 * is DRAWN. After a Move, the hero gets a visual lead toward the target, speed × min(time since the click, measured
 * input latency), so it starts walking on the next frame instead of a full round trip later. It runs per render frame
 * (NetHost.present) on the interpolated own hero, not per snapshot.
 *
 * The shown offset follows the wanted lead exactly while the lead changes smoothly (it grows frame by frame); a jump
 * (a new target, a stop, crowd control, the authoritative hero arriving) blends over BLEND_MS, so the drawn hero
 * converges on the authoritative one within 150 ms. No lead while the snapshot shows stun, root, fear (charm), forced
 * movement or a dash, or while dead. A Move the sim never started (blocked, channeling) stops leading once the
 * authoritative hero has stood still for the input latency plus STALL_MS.
 */
export const BLEND_MS = 120;
/** mm per tick at which the hero is assumed to move when no speed is known. */
export const DEFAULT_SPEED = 160;
/** A change of the wanted lead larger than this (mm) between two frames blends instead of snapping. */
export const JUMP_MM = 150;
/** Grace after the expected start of the authoritative move before a lead with no movement behind it is dropped. */
export const STALL_MS = 150;

export interface PredictInput {
  x: number;
  y: number;
  /** Crowd control or a dash: no lead. */
  locked: boolean;
  /** Move speed, mm per tick (30 Hz). */
  speed: number;
  /** The authoritative hero is moving now (absent: assume it is). */
  moving?: boolean;
}

export class Predictor {
  private target: { x: number; y: number; atMs: number } | null = null;
  private from = { dx: 0, dy: 0 };
  private want = { dx: 0, dy: 0 };
  private blendAt = -Infinity;

  /** The player issued a Move to (x, y). */
  move(x: number, y: number, nowMs: number): void {
    this.target = { x, y, atMs: nowMs };
  }

  /** Any other command (or arrival): stop leading. */
  stop(): void {
    this.target = null;
  }

  /** The move target being led toward, or null. */
  get heading(): { x: number; y: number } | null {
    return this.target;
  }

  /** The offset to draw now, given the authoritative position and the measured input latency. */
  offset(a: PredictInput, latencyMs: number, nowMs: number): { dx: number; dy: number } {
    let wx = 0;
    let wy = 0;
    if (this.target && a.moving === false && nowMs - this.target.atMs > latencyMs + STALL_MS) this.target = null;
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
    if (Math.hypot(wx - this.want.dx, wy - this.want.dy) > JUMP_MM) {
      // a disagreement: blend from what is shown now
      this.from = this.current(nowMs);
      this.blendAt = nowMs;
    }
    this.want = { dx: wx, dy: wy };
    return this.current(nowMs);
  }

  private current(nowMs: number): { dx: number; dy: number } {
    const k = Math.max(0, Math.min(1, (nowMs - this.blendAt) / BLEND_MS));
    return { dx: this.from.dx + (this.want.dx - this.from.dx) * k, dy: this.from.dy + (this.want.dy - this.from.dy) * k };
  }
}
