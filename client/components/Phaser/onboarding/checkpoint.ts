/**
 * Checkpoints and Paw Guard soft deaths (plan G10, decisions #66 and #68). Pure.
 *
 * A soft death spends one Paw Guard: the cat goes back to its last checkpoint with the movement
 * state it had there (`PlayerMovement.snapshot()` / `restore()`: gravity, geometry-dash, flight,
 * velocity) plus the scene state, and every pickup taken after the checkpoint respawns, so the
 * run's score is exactly what it was at the checkpoint. A hard death (no guard left) ends the run.
 *
 * Paw Guards per attempt:
 * - uncleared 1-1 (the first level of the mode): unlimited, so it cannot be failed (#68);
 * - other uncleared levels: three;
 * - cleared levels and the endless run: none;
 * - the "Extra guards" assist adds three on uncleared levels other than 1-1 (never on cleared levels
 *   or INFINITE: G10 says none on cleared levels, and INFINITE catnip is saved).
 */

/** The movement state of `PlayerMovement` a checkpoint keeps. */
export interface MovementSnapshot {
  gravityReversed: boolean;
  geometryDash: boolean;
  flight: boolean;
  midAirJump: boolean;
  flightXSpeed: number;
  autoRun: { enabled: boolean; speed: number; jumpSpeed: number };
  gravity: { base: number; falling: number; reversedBase: number; reversedFalling: number };
  velocity: { x: number; y: number };
}

/** The player sprite and cat fields around the movement state. */
export interface PlayerSnapshot {
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  /** `Cat.currentRotation`: running left after a direction tile. */
  facingLeft: boolean;
  walkSpeed: number;
  jumpSpeed: number;
  movement: MovementSnapshot;
}

/** Scene state a checkpoint keeps besides the player. */
export interface SceneSnapshot {
  player: PlayerSnapshot;
  /** Score at the checkpoint. */
  collected: number;
  /** Indices of pickups taken before the checkpoint (they stay taken on respawn). */
  pickupsTaken: number[];
  /** Indices of power-ups taken before the checkpoint. */
  powerUpsTaken: number[];
  /** Scene-level copies of mode flags (`isGravityReversed` and friends). */
  flags: Record<string, boolean>;
}

/** A deep copy, so a later change to the live state can never alter a stored checkpoint. */
export function cloneSnapshot<T>(snapshot: T): T {
  return JSON.parse(JSON.stringify(snapshot)) as T;
}

export interface CheckpointPolicy {
  /** Minimum distance between two checkpoints, px. */
  minSpacing: number;
  /** A checkpoint needs this much hazard-free run ahead, px. */
  safeAhead: number;
  /** ...and this much behind (so the respawn is not inside a run of spikes), px. */
  safeBehind: number;
}

export const PURRSUIT_CHECKPOINTS: CheckpointPolicy = Object.freeze({
  minSpacing: 160,
  safeAhead: 120,
  safeBehind: 48,
});

export interface CheckpointCandidate {
  x: number;
  /** On the floor (or ceiling with gravity reversed), not mid-air. */
  grounded: boolean;
  /** Not in flight mode or a teleport cooldown. */
  stable: boolean;
  /** Left edges and right edges of the hazards near the cat, px. */
  hazards: readonly { x0: number; x1: number }[];
}

/** Whether `candidate` is a good place for a new checkpoint after one at `lastX`. */
export function isCheckpointSpot(
  candidate: CheckpointCandidate,
  lastX: number | null,
  policy: CheckpointPolicy = PURRSUIT_CHECKPOINTS,
): boolean {
  if (!candidate.grounded || !candidate.stable) return false;
  if (lastX !== null && Math.abs(candidate.x - lastX) < policy.minSpacing) return false;
  return candidate.hazards.every(
    (hazard) => hazard.x0 - candidate.x >= policy.safeAhead || candidate.x - hazard.x1 >= policy.safeBehind,
  );
}

/**
 * Keeps the latest checkpoint and what was picked up since. The scene calls `take` at good spots,
 * `pickup` / `powerUp` when something is collected, and `respawn` on a soft death.
 */
export function createCheckpointTracker<T extends SceneSnapshot = SceneSnapshot>() {
  let current: T | null = null;
  let pickupsSince: number[] = [];
  let powerUpsSince: number[] = [];

  return {
    take(snapshot: T) {
      current = cloneSnapshot(snapshot);
      pickupsSince = [];
      powerUpsSince = [];
    },
    pickup(index: number) {
      if (!pickupsSince.includes(index)) pickupsSince.push(index);
    },
    powerUp(index: number) {
      if (!powerUpsSince.includes(index)) powerUpsSince.push(index);
    },
    /** The checkpoint to restore and the pickups and power-ups that respawn, or null without one. */
    respawn(): { snapshot: T; respawnPickups: number[]; respawnPowerUps: number[] } | null {
      if (!current) return null;
      const out = {
        snapshot: cloneSnapshot(current),
        respawnPickups: [...pickupsSince],
        respawnPowerUps: [...powerUpsSince],
      };
      pickupsSince = [];
      powerUpsSince = [];
      return out;
    },
    get current(): T | null {
      return current ? cloneSnapshot(current) : null;
    },
    get x(): number | null {
      return current ? current.player.x : null;
    },
    reset() {
      current = null;
      pickupsSince = [];
      powerUpsSince = [];
    },
  };
}

export type CheckpointTracker<T extends SceneSnapshot = SceneSnapshot> = ReturnType<typeof createCheckpointTracker<T>>;

/** Paw Guards per attempt: a count, or `null` for unlimited. */
export type PawGuards = number | null;

export const PAW_GUARD_NAME = "Paw Guard";
export const PAW_GUARDS_PER_ATTEMPT = 3;
export const EXTRA_GUARDS = 3;

export function pawGuardAllowance(input: {
  /** The level is the mode's first level (Purrsuit 1-1). */
  isFirstLevel: boolean;
  cleared: boolean;
  /** The endless INFINITE run: it has no end to protect. */
  infinite?: boolean;
  /** The "Extra guards" assist: only on uncleared, non-infinite levels (G10, 5a review #2). */
  extraGuards?: boolean;
}): PawGuards {
  // No guards on cleared levels or the endless run, assist or not: the endless run's catnip is
  // saved, so guards there would only make farming it cheaper.
  if (input.infinite || input.cleared) return 0;
  if (input.isFirstLevel) return null;
  return PAW_GUARDS_PER_ATTEMPT + (input.extraGuards ? EXTRA_GUARDS : 0);
}

/** Spends one guard. Returns the guards left, or `false` when none was left (a hard death). */
export function spendGuard(guards: PawGuards): PawGuards | false {
  if (guards === null) return null;
  if (guards <= 0) return false;
  return guards - 1;
}

/** HUD text: "×3", "×∞" for unlimited. */
export const guardsLabel = (guards: PawGuards): string => (guards === null ? "×∞" : `×${guards}`);

/** Screen-reader text for the HUD. */
export const guardsAccessibleLabel = (guards: PawGuards): string =>
  guards === null
    ? `${PAW_GUARD_NAME}: unlimited on this level`
    : `${guards} ${PAW_GUARD_NAME}${guards === 1 ? "" : "s"} left`;
