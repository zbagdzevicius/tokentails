import {
  cloneSnapshot,
  createCheckpointTracker,
  guardsAccessibleLabel,
  guardsLabel,
  isCheckpointSpot,
  pawGuardAllowance,
  spendGuard,
  type SceneSnapshot,
} from "@/components/Phaser/onboarding/checkpoint";

// PlayerMovement imports Phaser and the cat class only for types and two helpers; stub them.
jest.mock("phaser", () => ({
  __esModule: true,
  default: {
    Math: { Linear: (a: number, b: number, t: number) => a + (b - a) * t, Clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)) },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));
jest.mock("@/components/catbassadors/objects/Catbassador", () => ({
  PlayerAnimation: { RUNNING: "RUNNING", JUMPING_UP: "JUMPING_UP", HIT: "HIT", SITTING: "SITTING", IDLE: "IDLE" },
}));

import { PlayerMovement } from "@/components/Phaser/PlayerMovement/PlayerMovement";
import type { IPlayer } from "@/components/Phaser/PlayerMovement/IPlayer";

/** Plan G10: Paw Guard checkpoints. */

function fakePlayer() {
  const body = {
    velocity: { x: 0, y: 0 },
    allowGravity: true,
    blocked: { down: true, up: false, left: false, right: false },
    setAllowGravity(value: boolean) {
      this.allowGravity = value;
    },
  };
  const sprite = {
    body,
    flipY: false,
    gravityY: 0,
    angle: 0,
    setMaxVelocity: jest.fn(),
    setFlipY(value: boolean) {
      this.flipY = value;
    },
    setGravityY(value: number) {
      this.gravityY = value;
    },
    setVelocity(x: number, y: number) {
      body.velocity.x = x;
      body.velocity.y = y;
    },
    setVelocityY(y: number) {
      body.velocity.y = y;
    },
    setVelocityX(x: number) {
      body.velocity.x = x;
    },
    setAcceleration: jest.fn(),
    setAngle(value: number) {
      this.angle = value;
    },
  };
  const player = { sprite, walkSpeed: 265, jumpSpeed: 440, justJumped: false, hasDoubleJumped: true, isJumping: true, isSliding: true } as unknown as IPlayer;
  return { player, sprite, body };
}

describe("PlayerMovement snapshot and restore", () => {
  it("round-trips gravity, geometry-dash, flight, the mid-air zone, speeds and velocity", () => {
    const { player, sprite, body } = fakePlayer();
    const movement = new PlayerMovement(player);
    movement.setAutoRunMode(true, 265, 440);
    // Geometry-dash mode resets gravity to normal when it starts, so it goes first.
    movement.setGeometryDashMode(true);
    movement.setGravityReversed(true);
    movement.setGravitySettings({ baseGravity: 700, fallingGravity: 1500, reversedBaseGravity: -2000, reversedFallingGravity: -3000 });
    movement.setFlightMode(true);
    movement.setMidAirJump(true);
    movement.flightXSpeed = 310;
    body.velocity.x = 123;
    body.velocity.y = -45;
    const snapshot = movement.snapshot();

    // Everything changes after the checkpoint...
    movement.setFlightMode(false);
    movement.setGeometryDashMode(false);
    movement.setGravityReversed(false);
    movement.setMidAirJump(false);
    movement.flightXSpeed = 270;
    movement.setGravitySettings({ baseGravity: 1, fallingGravity: 2, reversedBaseGravity: 3, reversedFallingGravity: 4 });
    movement.setAutoRunMode(true, -265, 440);
    body.velocity.x = 0;
    body.velocity.y = 999;

    // ...and restore puts it back.
    movement.restore(snapshot);
    expect(movement.snapshot()).toEqual(snapshot);
    expect(sprite.flipY).toBe(true);
    expect(body.allowGravity).toBe(false);
    // A held key does not jump on the respawn.
    expect(player.justJumped).toBe(true);
    expect(player.hasDoubleJumped).toBe(false);
  });

  it("restores a grounded, normal-gravity snapshot", () => {
    const { player, body } = fakePlayer();
    const movement = new PlayerMovement(player);
    movement.setAutoRunMode(true, 265, 440);
    body.velocity.x = 265;
    const snapshot = movement.snapshot();
    movement.setFlightMode(true);
    movement.setGravityReversed(true);
    movement.restore(snapshot);
    expect(movement.snapshot()).toEqual(snapshot);
    expect(body.allowGravity).toBe(true);
    expect(movement.isGravityReversed).toBe(false);
  });
});

const snapshotAt = (x: number, collected = 0): SceneSnapshot => ({
  player: {
    x,
    y: -800,
    flipX: false,
    flipY: false,
    rotation: 0,
    facingLeft: false,
    walkSpeed: 265,
    jumpSpeed: 440,
    movement: {
      gravityReversed: false,
      geometryDash: false,
      flight: false,
      midAirJump: false,
      flightXSpeed: 270,
      autoRun: { enabled: true, speed: 265, jumpSpeed: 440 },
      gravity: { base: 700, falling: 1450, reversedBase: -1150, reversedFalling: -1200 },
      velocity: { x: 265, y: 0 },
    },
  },
  collected,
  pickupsTaken: [],
  powerUpsTaken: [],
  flags: { gravityReversed: false },
});

describe("checkpoint tracker", () => {
  it("respawns pickups and power-ups taken after the checkpoint, and the score with them", () => {
    const tracker = createCheckpointTracker();
    expect(tracker.respawn()).toBeNull();
    tracker.pickup(0);
    tracker.take(snapshotAt(100, 1));
    tracker.pickup(3);
    tracker.pickup(4);
    tracker.pickup(4);
    tracker.powerUp(1);
    const first = tracker.respawn()!;
    expect(first.snapshot.collected).toBe(1);
    expect(first.respawnPickups).toEqual([3, 4]);
    expect(first.respawnPowerUps).toEqual([1]);
    // A second slip right away has nothing new to respawn.
    expect(tracker.respawn()!.respawnPickups).toEqual([]);
    expect(tracker.x).toBe(100);
  });

  it("keeps its own copy of a checkpoint", () => {
    const tracker = createCheckpointTracker();
    const live = snapshotAt(10);
    tracker.take(live);
    live.player.x = 999;
    live.player.movement.velocity.x = 0;
    expect(tracker.current!.player.x).toBe(10);
    expect(tracker.respawn()!.snapshot.player.movement.velocity.x).toBe(265);
    expect(cloneSnapshot(live)).toEqual(live);
    tracker.reset();
    expect(tracker.current).toBeNull();
  });

  it("only takes checkpoints on safe ground, spaced out", () => {
    const hazards = [{ x0: 400, x1: 432 }];
    const spot = { x: 200, grounded: true, stable: true, hazards };
    expect(isCheckpointSpot(spot, null)).toBe(true);
    expect(isCheckpointSpot({ ...spot, grounded: false }, null)).toBe(false);
    expect(isCheckpointSpot({ ...spot, stable: false }, null)).toBe(false);
    expect(isCheckpointSpot({ ...spot, x: 300 }, null)).toBe(false); // 100 px before a run
    expect(isCheckpointSpot({ ...spot, x: 440 }, null)).toBe(false); // just past it
    expect(isCheckpointSpot({ ...spot, x: 490 }, null)).toBe(true);
    expect(isCheckpointSpot(spot, 100)).toBe(false); // too close to the last one
  });
});

describe("Paw Guard allowance (decisions #66, #68)", () => {
  it("is unlimited on uncleared 1-1, three on other uncleared levels, none on cleared ones", () => {
    expect(pawGuardAllowance({ isFirstLevel: true, cleared: false })).toBeNull();
    expect(pawGuardAllowance({ isFirstLevel: false, cleared: false })).toBe(3);
    expect(pawGuardAllowance({ isFirstLevel: false, cleared: true })).toBe(0);
    expect(pawGuardAllowance({ isFirstLevel: true, cleared: true })).toBe(0);
    expect(pawGuardAllowance({ isFirstLevel: false, cleared: false, infinite: true })).toBe(0);
  });

  it("adds three with the Extra guards assist", () => {
    expect(pawGuardAllowance({ isFirstLevel: false, cleared: false, extraGuards: true })).toBe(6);
    // None on cleared levels or INFINITE, assist or not (G10; 5a review #2).
    expect(pawGuardAllowance({ isFirstLevel: false, cleared: true, extraGuards: true })).toBe(0);
    expect(pawGuardAllowance({ isFirstLevel: false, cleared: false, infinite: true, extraGuards: true })).toBe(0);
    expect(pawGuardAllowance({ isFirstLevel: true, cleared: true, extraGuards: true })).toBe(0);
    expect(pawGuardAllowance({ isFirstLevel: true, cleared: false, extraGuards: true })).toBeNull();
  });

  it("spends guards down to a hard death; unlimited never runs out", () => {
    expect(spendGuard(3)).toBe(2);
    expect(spendGuard(1)).toBe(0);
    expect(spendGuard(0)).toBe(false);
    expect(spendGuard(null)).toBeNull();
  });

  it("labels the HUD with text for screen readers", () => {
    expect(guardsLabel(3)).toBe("×3");
    expect(guardsLabel(null)).toBe("×∞");
    expect(guardsAccessibleLabel(1)).toBe("1 Paw Guard left");
    expect(guardsAccessibleLabel(2)).toBe("2 Paw Guards left");
    expect(guardsAccessibleLabel(null)).toMatch(/unlimited/);
  });
});
