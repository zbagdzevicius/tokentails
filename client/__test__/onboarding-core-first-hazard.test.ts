import {
  arcHeightAt,
  clockScales,
  clusterTiles,
  createSlowMo,
  firstAhead,
  GUIDED_JUMP_MAX_MS,
  guidedJumpOver,
  jumpArc,
  jumpClears,
  nextTeach,
  promptFreezeX,
  PURRSUIT_JUMP,
  shouldFreeze,
  type Mechanic,
  type MechanicKind,
} from "@/components/Phaser/onboarding/first-hazard";

/** Plan G10: teach-at-hazard geometry. The first spike of 1-1 is tile (-15, -26), one tile wide. */

const FIRST_SPIKE: Mechanic = { kind: "spike", x0: -480, x1: -448, y: -832 };

/**
 * A frame-stepped model of the auto-run jump as the scene runs it: the scene picks the gravity
 * once per frame from the velocity's sign (PlayerMovement.applyAdvancedGravity), and Arcade then
 * integrates in fixed 1/240 s steps. Returns the lowest clearance (px) over the spike's body,
 * which sits in the bottom few pixels of its tile.
 */
function simulateJump(fps: number, takeoffX: number, hazard: Mechanic, halfWidth: number): number {
  const step = 1 / 240;
  const frame = 1 / fps;
  let x = takeoffX;
  let height = 0;
  let vy = PURRSUIT_JUMP.jumpVelocity; // up is positive here
  let accumulator = 0;
  let minClearance = Infinity;
  let first = true;
  while (first || height > 0) {
    first = false;
    // Gravity chosen per frame, from the velocity at the start of the frame.
    const gravity = vy > 0 ? PURRSUIT_JUMP.gravityUp : PURRSUIT_JUMP.gravityDown;
    accumulator += frame;
    while (accumulator >= step) {
      accumulator -= step;
      vy -= gravity * step;
      height += vy * step;
      x += PURRSUIT_JUMP.runSpeed * step;
      if (height <= 0) {
        height = 0;
        break;
      }
      const overlaps = x + halfWidth > hazard.x0 && x - halfWidth < hazard.x1;
      if (overlaps) minClearance = Math.min(minClearance, height);
    }
  }
  // Landed before or after the run, never on it.
  const landsOn = x + halfWidth > hazard.x0 && x - halfWidth < hazard.x1;
  return landsOn ? 0 : minClearance;
}

describe("first spike prompt", () => {
  it("clusters touching tiles into runs, per row", () => {
    const runs = clusterTiles(
      [
        { x: -6, y: -26 },
        { x: -4, y: -26 },
        { x: -3, y: -26 },
        { x: -2, y: -26 },
        { x: -15, y: -26 },
        { x: 6, y: -30 },
        { x: 7, y: -30 },
      ],
      32,
      "spike",
    );
    expect(runs).toEqual([
      { kind: "spike", x0: -480, x1: -448, y: -832 },
      { kind: "spike", x0: -192, x1: -160, y: -832 },
      { kind: "spike", x0: -128, x1: -32, y: -832 },
      { kind: "spike", x0: 192, x1: 256, y: -960 },
    ]);
    expect(firstAhead(runs, -950)).toEqual(FIRST_SPIKE);
    expect(firstAhead(runs, -100)).toEqual({ kind: "spike", x0: 192, x1: 256, y: -960 });
    expect(firstAhead(runs, 300)).toBeNull();
  });

  it("puts the apex of the answer jump over the middle of the run", () => {
    const arc = jumpArc();
    expect(arc.apexHeight).toBeCloseTo(74.5, 0);
    expect(arc.distance).toBeGreaterThan(150);
    const freezeX = promptFreezeX(FIRST_SPIKE);
    expect(freezeX + arc.apexDistance).toBeCloseTo((FIRST_SPIKE.x0 + FIRST_SPIKE.x1) / 2, 5);
    expect(FIRST_SPIKE.x0 - freezeX).toBeGreaterThanOrEqual(48);
    expect(arcHeightAt(0)).toBe(0);
    expect(arcHeightAt(arc.distance)).toBeCloseTo(0, 5);
  });

  it("clears the first spike from the freeze spot in the continuous model", () => {
    const freezeX = promptFreezeX(FIRST_SPIKE);
    expect(jumpClears(freezeX, FIRST_SPIKE, { halfWidth: 20, hazardHeight: 8 })).toBe(true);
    // Taking off right at the spike's edge does not.
    expect(jumpClears(FIRST_SPIKE.x0 - 4, FIRST_SPIKE, { halfWidth: 20, hazardHeight: 8 })).toBe(false);
  });

  it.each([30, 60, 120])("clears it at %i fps with the frame-stepped physics", (fps) => {
    const freezeX = promptFreezeX(FIRST_SPIKE);
    for (const halfWidth of [12, 16, 20]) {
      expect(simulateJump(fps, freezeX, FIRST_SPIKE, halfWidth)).toBeGreaterThan(20);
    }
  });

  it("clears two-tile runs too; longer runs rely on the guarded jump", () => {
    const run: Mechanic = { kind: "spike", x0: 0, x1: 64, y: 0 };
    const freezeX = promptFreezeX(run);
    for (const fps of [30, 60, 120]) expect(simulateJump(fps, freezeX, run, 16)).toBeGreaterThan(6);
    // The scene keeps the prompted jump safe until it lands past the run (guidedUntilX), so a
    // run longer than one arc still cannot cost a Paw Guard on the first visit.
    const long: Mechanic = { kind: "spike", x0: 0, x1: 160, y: 0 };
    expect(jumpClears(promptFreezeX(long), long, { halfWidth: 16, hazardHeight: 6 })).toBe(false);
  });

  it("freezes only on the ground, between the freeze point and the run", () => {
    const input = { armed: true, catX: -550, freezeX: -553, grounded: true, hazardX0: -480 };
    expect(shouldFreeze(input)).toBe(true);
    expect(shouldFreeze({ ...input, grounded: false })).toBe(false);
    expect(shouldFreeze({ ...input, catX: -560 })).toBe(false);
    expect(shouldFreeze({ ...input, catX: -470 })).toBe(false);
    expect(shouldFreeze({ ...input, armed: false })).toBe(false);
  });
});

describe("slow-motion teach", () => {
  const trampoline: Mechanic = { kind: "trampoline", x0: 500, x1: 532, y: 0 };
  const gravity: Mechanic = { kind: "gravity", x0: 300, x1: 332, y: 0 };
  const spike: Mechanic = { kind: "spike", x0: 320, x1: 352, y: 0 };

  it("teaches the nearest new mechanic once", () => {
    const mechanics = [trampoline, gravity, spike];
    expect(nextTeach({ mechanics, catX: 100, lead: 230, taught: new Set<MechanicKind>(["spike"]), done: new Set() })).toBe(gravity);
    expect(nextTeach({ mechanics, catX: 100, lead: 230, taught: new Set<MechanicKind>(["spike", "gravity"]), done: new Set() })).toBeNull();
    expect(nextTeach({ mechanics, catX: 100, lead: 150, taught: new Set<MechanicKind>(["spike"]), done: new Set() })).toBeNull();
    expect(nextTeach({ mechanics, catX: 100, lead: 230, taught: new Set<MechanicKind>(["spike"]), done: new Set([gravity]) })).toBeNull();
  });

  it("re-teaches every spike run with the assist", () => {
    expect(nextTeach({ mechanics: [spike], catX: 200, lead: 230, taught: new Set<MechanicKind>(["spike"]), done: new Set(), everyHazard: true })).toBe(spike);
  });

  it("scales all four clocks, physics inverted, and returns to real time", () => {
    expect(clockScales(0.35)).toEqual({ time: 0.35, tweens: 0.35, anims: 0.35, physics: 1 / 0.35 });
    expect(clockScales(1)).toEqual({ time: 1, tweens: 1, anims: 1, physics: 1 });
    expect(clockScales(0).time).toBeGreaterThan(0);
  });

  it("ends on real time, whatever the scaled clocks do", () => {
    let t = 1000;
    const slowMo = createSlowMo(() => t, 1100);
    slowMo.start();
    expect(slowMo.active()).toBe(true);
    t += 1099;
    expect(slowMo.expired()).toBe(false);
    t += 1;
    expect(slowMo.expired()).toBe(true);
    expect(slowMo.expired()).toBe(false);
    expect(slowMo.active()).toBe(false);
  });
});

describe("the prompted jump's protection (5a review #8)", () => {
  it("ends once the cat is past the run, grounded or not", () => {
    expect(guidedJumpOver({ catX: -420, untilX: -424, nowMs: 100, untilMs: 1600 })).toBe(true);
    expect(guidedJumpOver({ catX: -430, untilX: -424, nowMs: 100, untilMs: 1600 })).toBe(false);
  });

  it("ends after GUIDED_JUMP_MAX_MS even if the cat never gets past (flight, a gravity flip, a fall)", () => {
    expect(guidedJumpOver({ catX: -500, untilX: -424, nowMs: GUIDED_JUMP_MAX_MS, untilMs: GUIDED_JUMP_MAX_MS })).toBe(true);
    // Long enough for the jump itself: well over one airtime.
    expect(GUIDED_JUMP_MAX_MS / 1000).toBeGreaterThan(2 * jumpArc().airtime);
  });

  it("the jump from the freeze spot clears the 1-1 first run without the protection", () => {
    // jumpClears is pure arc geometry: no invulnerability is involved.
    expect(jumpClears(promptFreezeX(FIRST_SPIKE), FIRST_SPIKE, { halfWidth: 20, hazardHeight: 8 })).toBe(true);
  });
});
