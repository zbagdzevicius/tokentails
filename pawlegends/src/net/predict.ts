/**
 * Cosmetic prediction for party play (MULTIPLAYER.md §4.3). Never touches the sim: it only moves where your own hero
 * is DRAWN. It runs per render frame (NetHost.present) on the interpolated own hero, not per snapshot.
 *
 * The drawn hero is a local walker. A Move starts it on the next frame: it walks its own path (the same A* on the
 * client's wall grid that the sim runs, so it turns the same corners and stops where the sim's path stops, never in a
 * straight line past a corner or past a goal the sim cannot reach) at the authoritative move speed. The
 * authoritative hero walks the same path one input latency later, so the walker is where the authoritative hero is
 * going to be. Any other command (Stop, a cast, an attack) and arrival hold the walker where it is drawn: the
 * authoritative hero walks up to it during the latency, and nothing is pulled back.
 *
 * Reconciliation: the walker keeps a trail of where it was drawn. Where it was one input latency ago is where the
 * authoritative hero should be now; the difference (a wrong latency estimate, a slow, a bump, a path the sim saw
 * differently) moves the walker and its trail by an exponential share (CORRECT_MS), so it converges without ever
 * surging at a multiple of the move speed. Once the walker has stood still for the latency, nothing is in flight:
 * the hero is drawn at the authoritative position plus a residual that decays (FOLLOW_MS), so a bot-piloted or pushed
 * hero is drawn where the sim has it. No walking while the snapshot shows stun, root, fear (charm), forced movement or
 * a dash, or while dead; a blink or a respawn is drawn at once. A Move the sim never started (blocked, channeling)
 * stops the walker once the authoritative hero has stood still for the input latency plus STALL_MS.
 */
/** Time constant (ms) of the drift correction while a predicted move is in flight. */
export const CORRECT_MS = 200;
/** Time constant (ms) of the residual's decay once nothing is in flight. */
export const FOLLOW_MS = 100;
/** Under crowd control the residual decays faster (ms). */
export const LOCKED_MS = 60;
/** A residual longer than this (mm) is a teleport (blink, respawn, Nap home): drawn at once, not slid. */
export const SNAP_MM = 2500;
/** An authoritative jump longer than this (mm) in one frame is a blink or a teleport. */
export const JUMP_MM = 1500;
/** mm per tick at which the hero is assumed to move when no speed is known. */
export const DEFAULT_SPEED = 160;
/** Grace after the expected start of the authoritative move before a walk with no movement behind it is dropped. */
export const STALL_MS = 150;
/** A frame gap longer than this (ms: a hidden tab) starts the walker again at the authoritative hero. */
const RESET_MS = 500;
/** Trail kept (ms): the latency is capped at 600 ms. */
const TRAIL_MS = 800;
const TICK_MS = 1000 / 30;

export interface PredictInput {
  x: number;
  y: number;
  /** Crowd control or a dash: no walking. */
  locked: boolean;
  /** Move speed, mm per tick (30 Hz). */
  speed: number;
  /** The authoritative hero is moving now (absent: assume it is). */
  moving?: boolean;
  /** The sim's gate barrier before it drops: the hero's x stays within [lo, hi]. */
  xLimit?: readonly [number, number];
}

/** Waypoints from (sx, sy) toward (tx, ty), the last one where the walk ends (it may stop short of the target). */
export type Planner = (sx: number, sy: number, tx: number, ty: number) => { x: number; y: number }[];

const straight: Planner = (_sx, _sy, tx, ty) => [{ x: tx, y: ty }];

export class Predictor {
  /** The drawn position (null: no frame yet). */
  private d: { x: number; y: number } | null = null;
  private path: { x: number; y: number }[] = [];
  private target: { x: number; y: number } | null = null;
  /** A Move issued before the first frame: planned on that frame. */
  private pending = false;
  /** When the current walk started (re-issued Moves keep it), for the stall check. */
  private walkFromMs = 0;
  /** The walker last advanced at this time: a prediction is in flight until the latency has passed. */
  private walkedAtMs = -Infinity;
  private trail: { t: number; x: number; y: number }[] = [];
  private lastMs = 0;
  private lastA: { x: number; y: number } | null = null;
  /** Drawn minus authoritative once nothing is in flight. */
  private residual = { dx: 0, dy: 0 };
  private inFlight = false;
  private walkingNow = false;
  private lastDir: number | null = null;
  private speedShown = 0;

  constructor(private readonly plan: Planner = straight) {}

  /** The player issued a Move to (x, y): the walker heads there from where it is drawn, on the next frame. */
  move(x: number, y: number, nowMs: number): void {
    if (!this.walking()) this.walkFromMs = nowMs;
    this.target = { x, y };
    if (this.d) this.replan();
    else this.pending = true;
  }

  /** Any other command: the walker holds where it is drawn (the authoritative hero walks up to it). */
  stop(): void {
    this.target = null;
    this.path = [];
    this.pending = false;
  }

  /** Forget everything (death): the next frame draws the authoritative hero. */
  reset(): void {
    this.stop();
    this.d = null;
  }

  /** The last frame walked the drawn hero along its path (its feet should move). */
  get leading(): boolean {
    return this.walkingNow;
  }

  /** The move target being walked toward, or null. */
  get heading(): { x: number; y: number } | null {
    return this.target;
  }

  /** While a prediction is in flight: the direction (rad) the drawn hero last walked; otherwise null. */
  get direction(): number | null {
    return this.inFlight ? this.lastDir : null;
  }

  /** A prediction is in flight (the drawn hero is the walker, not the authoritative hero plus a residual). */
  get predicting(): boolean {
    return this.inFlight;
  }

  /** While a prediction is in flight: where the walker is drawn (where the authoritative hero is headed); else null. */
  get position(): { x: number; y: number } | null {
    return this.inFlight && this.d ? { x: this.d.x, y: this.d.y } : null;
  }

  /** The drawn hero's speed over the last frames, mm per tick. */
  get drawnSpeed(): number {
    return this.speedShown;
  }

  /** The offset to draw now, given the authoritative position and the measured input latency. */
  offset(a: PredictInput, latencyMs: number, nowMs: number): { dx: number; dy: number } {
    const gap = nowMs - this.lastMs;
    const jumped = this.lastA !== null && Math.hypot(a.x - this.lastA.x, a.y - this.lastA.y) > Math.max(JUMP_MM, (2 * a.speed * gap) / TICK_MS);
    if (!this.d || gap > RESET_MS || gap < 0 || jumped) {
      // a first frame, a hidden tab, a blink or a respawn: draw the authoritative hero
      if (this.d && jumped) this.stop();
      this.d = { x: a.x, y: a.y };
      this.trail = [];
      this.residual = { dx: 0, dy: 0 };
      this.inFlight = false;
      this.lastMs = nowMs;
      this.speedShown = 0;
    }
    this.lastA = { x: a.x, y: a.y };
    const dt = Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;
    const d = this.d;
    const px = d.x;
    const py = d.y;
    if (this.pending) {
      this.pending = false;
      if (this.target) this.replan();
    }
    if (a.locked) {
      this.stop();
      if (this.inFlight) this.follow(a);
    }
    if (this.walking() && a.moving === false && nowMs - this.walkFromMs > latencyMs + STALL_MS) this.stop();

    // 1. the walker
    this.walkingNow = false;
    if (this.walking()) {
      if (!this.inFlight) {
        // from a follow: the walk starts where the hero is drawn (the follow trail stays: where the drawn hero was)
        this.inFlight = true;
        this.lastDir = null;
      }
      let step = (a.speed * dt) / TICK_MS;
      while (step > 0 && this.path.length > 0) {
        const w = this.path[0];
        const tx = clampX(w.x, a.xLimit, d.x);
        const dx = tx - d.x;
        const dy = w.y - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          this.lastDir = Math.atan2(dy, dx);
          this.walkingNow = true;
        }
        if (dist <= step) {
          d.x = tx;
          d.y = w.y;
          step -= dist;
          if (tx !== w.x) break; // held at the gate line, as the sim's hero is
          this.path.shift();
        } else {
          d.x += (dx / dist) * step;
          d.y += (dy / dist) * step;
          step = 0;
        }
      }
      if (this.walkingNow) this.walkedAtMs = nowMs;
      if (this.path.length === 0) this.target = null; // arrived: hold
    }
    // the authoritative hero has had the latency to catch up: draw it, plus what is left
    if (this.inFlight && !this.walking() && nowMs - this.walkedAtMs > latencyMs + 2 * TICK_MS) this.follow(a);

    // 2. reconciliation
    if (this.inFlight) {
      this.record(nowMs);
      const h = this.at(nowMs - latencyMs);
      const k = 1 - Math.exp(-dt / CORRECT_MS);
      const sx = (a.x - h.x) * k;
      const sy = (a.y - h.y) * k;
      d.x = clampX(d.x + sx, a.xLimit, d.x);
      d.y += sy;
      for (const p of this.trail) {
        p.x += sx;
        p.y += sy;
      }
    } else {
      const r = this.residual;
      if (Math.hypot(r.dx, r.dy) > SNAP_MM) r.dx = r.dy = 0;
      const k = Math.exp(-dt / (a.locked ? LOCKED_MS : FOLLOW_MS));
      r.dx *= k;
      r.dy *= k;
      if (Math.hypot(r.dx, r.dy) < 1) r.dx = r.dy = 0;
      d.x = a.x + r.dx;
      d.y = a.y + r.dy;
      this.record(nowMs);
    }
    if (dt > 0) {
      const v = (Math.hypot(d.x - px, d.y - py) / dt) * TICK_MS;
      this.speedShown = this.walkingNow ? a.speed : this.speedShown * 0.6 + v * 0.4;
    }
    return { dx: d.x - a.x, dy: d.y - a.y };
  }

  private walking(): boolean {
    return this.path.length > 0 || this.pending;
  }

  /** Nothing in flight from here: the drawn hero is the authoritative one plus a decaying residual. */
  private follow(a: PredictInput): void {
    this.inFlight = false;
    this.lastDir = null;
    this.residual = { dx: this.d!.x - a.x, dy: this.d!.y - a.y };
  }

  private replan(): void {
    const t = this.target;
    const d = this.d;
    if (!t || !d) return;
    this.path = this.plan(d.x, d.y, t.x, t.y).map((p) => ({ x: p.x, y: p.y }));
    if (this.path.length === 0) this.target = null;
  }

  private record(nowMs: number): void {
    this.trail.push({ t: nowMs, x: this.d!.x, y: this.d!.y });
    while (this.trail.length > 2 && nowMs - this.trail[1].t > TRAIL_MS) this.trail.shift();
  }

  /** Where the hero was drawn at time `t` (before the trail starts: its oldest point). */
  private at(t: number): { x: number; y: number } {
    const tr = this.trail;
    if (tr.length === 0) return { x: this.d!.x, y: this.d!.y };
    if (t <= tr[0].t) return tr[0];
    for (let i = tr.length - 1; i > 0; i--) {
      const b = tr[i - 1];
      if (b.t <= t) {
        const c = tr[i];
        const k = c.t > b.t ? (t - b.t) / (c.t - b.t) : 1;
        return { x: b.x + (c.x - b.x) * k, y: b.y + (c.y - b.y) * k };
      }
    }
    return tr[tr.length - 1];
  }
}

/** The gate line stops a crossing (a hero already past it, which the sim never has, is not pulled back). */
const clampX = (x: number, lim: readonly [number, number] | undefined, from: number): number => {
  if (!lim) return x;
  if (from <= lim[1] && x > lim[1]) return lim[1];
  if (from >= lim[0] && x < lim[0]) return lim[0];
  return x;
};
