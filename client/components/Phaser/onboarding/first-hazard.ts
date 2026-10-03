/**
 * Teach-at-hazard geometry and timing (plan G10). Pure: the Purrsuit scene feeds it tile positions
 * and the cat's position; Jest checks the maths.
 *
 * - The first spike run on a first visit freezes the world with a "JUMP!" prompt at a fixed
 *   distance before it (`promptFreezeX`). The scene snaps the cat to exactly that x, so the jump
 *   that resumes the world takes off from the same place at every frame rate; the arc then clears
 *   the run (`jumpArc`), and the scene keeps the cat safe until it lands past it.
 * - Every other new mechanic gets a short slow-motion teach (all four clocks scaled, restored on
 *   real time), or freeze-and-prompt under reduced motion.
 */

/** A hazard or mechanic on the cat's path, in world pixels. */
export interface Mechanic {
  kind: MechanicKind;
  /** Left edge. */
  x0: number;
  /** Right edge. */
  x1: number;
  /** Top edge (for picking spikes on the run's floor). */
  y: number;
}

export type MechanicKind =
  | "spike"
  | "trampoline"
  | "gravity"
  | "flight"
  | "geometry"
  | "direction"
  | "midair"
  | "portal"
  | "speed"
  | "platform";

export interface TileRef {
  /** Tile column and row. */
  x: number;
  y: number;
}

/**
 * Groups tiles that touch on the same row into runs, sorted by x. `gapTiles` lets a one-tile gap
 * still count as one run (spikes with a hole a cat cannot land in).
 */
export function clusterTiles(tiles: readonly TileRef[], tileSize: number, kind: MechanicKind, gapTiles = 0): Mechanic[] {
  const byRow = new Map<number, number[]>();
  for (const tile of tiles) {
    const row = byRow.get(tile.y) ?? [];
    row.push(tile.x);
    byRow.set(tile.y, row);
  }
  const out: Mechanic[] = [];
  byRow.forEach((columns, row) => {
    const sorted = Array.from(new Set(columns)).sort((a, b) => a - b);
    let start = sorted[0];
    let previous = sorted[0];
    const flush = () => out.push({ kind, x0: start * tileSize, x1: (previous + 1) * tileSize, y: row * tileSize });
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - previous <= gapTiles + 1) {
        previous = sorted[i];
        continue;
      }
      flush();
      start = previous = sorted[i];
    }
    if (sorted.length) flush();
  });
  return out.sort((a, b) => a.x0 - b.x0 || a.y - b.y);
}

/** The first mechanic of `kind` whose left edge is ahead of `fromX`. */
export function firstAhead(mechanics: readonly Mechanic[], fromX: number, kind: MechanicKind = "spike"): Mechanic | null {
  let best: Mechanic | null = null;
  for (const item of mechanics) {
    if (item.kind !== kind || item.x0 <= fromX) continue;
    if (!best || item.x0 < best.x0) best = item;
  }
  return best;
}

/** Physics of an auto-run jump. Purrsuit: run 265 px/s, jump 440 px/s, gravity 600 + 700 up, 600 + 1450 down. */
export interface JumpPhysics {
  runSpeed: number;
  jumpVelocity: number;
  /** Total downward acceleration while rising (world + base), px/s². */
  gravityUp: number;
  /** Total downward acceleration while falling (world + falling), px/s². */
  gravityDown: number;
}

export const PURRSUIT_JUMP: JumpPhysics = Object.freeze({
  runSpeed: 265,
  jumpVelocity: 440,
  gravityUp: 600 + 700,
  gravityDown: 600 + 1450,
});

export interface JumpArc {
  /** Seconds from take-off to the apex. */
  apexTime: number;
  /** Apex height above the take-off floor, px. */
  apexHeight: number;
  /** Seconds in the air, back to the take-off floor height. */
  airtime: number;
  /** Horizontal distance covered in the air, px. */
  distance: number;
  /** Horizontal distance from take-off to the apex, px. */
  apexDistance: number;
}

export function jumpArc(physics: JumpPhysics = PURRSUIT_JUMP): JumpArc {
  const apexTime = physics.jumpVelocity / physics.gravityUp;
  const apexHeight = (physics.jumpVelocity * physics.jumpVelocity) / (2 * physics.gravityUp);
  const fallTime = Math.sqrt((2 * apexHeight) / physics.gravityDown);
  const airtime = apexTime + fallTime;
  return {
    apexTime,
    apexHeight,
    airtime,
    distance: physics.runSpeed * airtime,
    apexDistance: physics.runSpeed * apexTime,
  };
}

/** Height above the take-off floor `dx` px after take-off (negative once below it). */
export function arcHeightAt(dx: number, physics: JumpPhysics = PURRSUIT_JUMP): number {
  const t = dx / physics.runSpeed;
  const apexTime = physics.jumpVelocity / physics.gravityUp;
  if (t <= apexTime) return physics.jumpVelocity * t - 0.5 * physics.gravityUp * t * t;
  const apexHeight = (physics.jumpVelocity * physics.jumpVelocity) / (2 * physics.gravityUp);
  const fall = t - apexTime;
  return apexHeight - 0.5 * physics.gravityDown * fall * fall;
}

/**
 * Where the cat's centre is frozen for the "JUMP!" prompt: the apex sits over the middle of the
 * run, so the cat clears it with margin on both sides. Never closer than `minLead` px to the run's
 * left edge.
 */
export function promptFreezeX(hazard: Mechanic, physics: JumpPhysics = PURRSUIT_JUMP, minLead = 48): number {
  const arc = jumpArc(physics);
  const centre = (hazard.x0 + hazard.x1) / 2;
  return Math.min(centre - arc.apexDistance, hazard.x0 - minLead);
}

/**
 * Whether a jump from `takeoffX` keeps a body of `halfWidth` and the given clearance above a run
 * of height `hazardHeight` along its whole width. Used by the tests and by the scene to decide if
 * the prompt can promise a clean jump (long runs need the guarded jump's protection).
 */
export function jumpClears(
  takeoffX: number,
  hazard: Mechanic,
  options: { halfWidth: number; hazardHeight: number; physics?: JumpPhysics },
): boolean {
  const physics = options.physics ?? PURRSUIT_JUMP;
  for (let x = hazard.x0 - options.halfWidth; x <= hazard.x1 + options.halfWidth; x += 2) {
    if (arcHeightAt(x - takeoffX, physics) < options.hazardHeight) return false;
  }
  return true;
}

/**
 * The prompted jump's protection lasts at most this long on the scene clock (about 2.5 airtimes),
 * so a cat that never lands past the run (flight, a gravity flip, a fall) does not stay
 * invulnerable for the rest of the attempt (5a review #8).
 */
export const GUIDED_JUMP_MAX_MS = 1500;

/** Whether the prompted jump's protection ends: past the run (in the air or not), or timed out. */
export function guidedJumpOver(input: { catX: number; untilX: number; nowMs: number; untilMs: number }): boolean {
  return input.catX > input.untilX || input.nowMs >= input.untilMs;
}

/** The scene should freeze for the prompt this frame. */
export function shouldFreeze(input: { armed: boolean; catX: number; freezeX: number; grounded: boolean; hazardX0: number }): boolean {
  return input.armed && input.grounded && input.catX >= input.freezeX && input.catX < input.hazardX0;
}

/**
 * Picks the next mechanic to teach: the nearest one ahead within `lead` px whose kind has not
 * been taught. With `everyHazard` (the "Slow-mo on every hazard" assist) spikes are taught every
 * time; `done` holds the mechanics already handled this attempt (by reference).
 */
export function nextTeach(input: {
  mechanics: readonly Mechanic[];
  catX: number;
  lead: number;
  taught: ReadonlySet<MechanicKind>;
  done: ReadonlySet<Mechanic>;
  everyHazard?: boolean;
}): Mechanic | null {
  let best: Mechanic | null = null;
  for (const item of input.mechanics) {
    if (input.done.has(item)) continue;
    if (item.x0 < input.catX || item.x0 - input.catX > input.lead) continue;
    const fresh = !input.taught.has(item.kind) || (input.everyHazard === true && item.kind === "spike");
    if (!fresh) continue;
    if (!best || item.x0 < best.x0) best = item;
  }
  return best;
}

/** Slow-motion factor of a teach (0.35x speed) and how long it lasts in real time. */
export const TEACH_SPEED = 0.35;
export const TEACH_REAL_MS = 1100;

/**
 * The four clocks of a Phaser scene at a speed factor (`1` is real time). Arcade physics counts
 * the other way: its `timeScale` 2 runs at half speed.
 */
export function clockScales(speed: number): { time: number; tweens: number; anims: number; physics: number } {
  const s = Math.min(1, Math.max(0.05, speed));
  return { time: s, tweens: s, anims: s, physics: 1 / s };
}

/**
 * Real-time bookkeeping for one slow-motion teach: it ends after `durationMs` of wall time, no
 * matter how the scaled clocks run.
 */
export function createSlowMo(now: () => number, durationMs = TEACH_REAL_MS) {
  let until = 0;
  return {
    start() {
      until = now() + durationMs;
    },
    /** True while the teach is on. */
    active() {
      return until > 0 && now() < until;
    },
    /** True once, on the first check after the teach ran out. */
    expired() {
      if (until > 0 && now() >= until) {
        until = 0;
        return true;
      }
      return false;
    },
    cancel() {
      until = 0;
    },
  };
}
