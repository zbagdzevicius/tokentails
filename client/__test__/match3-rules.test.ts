/**
 * Paw Match run rules (plan G10 "Paw Match", F6, section 2.13 #38): the clock starts on the first
 * valid swap, the last chance fires once, an uncleared level 1 gets the +15 s grace automatically
 * and only once, and level select reads the server's cleared array with START HERE on a first visit.
 */
import { MATCH3_LEVELS } from "@/components/Match3/match3.config";
import {
  LAST_CHANCE_SECONDS,
  LEVEL_ONE_GRACE_SECONDS,
  isFirstLevel,
  isMatch3LevelCleared,
  lastChanceGrant,
  legacyUnlockRequirement,
  match3LevelProgress,
  shouldStartClock,
  type LastChanceInput,
} from "@/components/Match3/match3Rules";

const LEVEL_1 = MATCH3_LEVELS[0];
const LEVEL_2 = MATCH3_LEVELS[1];

const base = (over: Partial<LastChanceInput> = {}): LastChanceInput => ({
  levelId: LEVEL_1.id,
  levelCleared: false,
  used: false,
  ended: false,
  score: 0,
  targetScore: LEVEL_1.targetScore,
  objectiveTarget: LEVEL_1.objectiveTarget,
  objectiveCollected: 0,
  gate: LEVEL_1.lastChanceProgressGate,
  ...over,
});

describe("timer start rule", () => {
  it("starts on the first valid swap only", () => {
    expect(shouldStartClock(false, { valid: true })).toBe(true);
    expect(shouldStartClock(false, { valid: false })).toBe(false);
  });

  it("never starts twice", () => {
    expect(shouldStartClock(true, { valid: true })).toBe(false);
    expect(shouldStartClock(true, { valid: false })).toBe(false);
  });

  it("a run of invalid swaps and taps leaves the clock stopped until a valid one", () => {
    let started = false;
    const swaps = [false, false, false, true, true];
    const starts: number[] = [];
    swaps.forEach((valid, i) => {
      if (shouldStartClock(started, { valid })) {
        started = true;
        starts.push(i);
      }
    });
    expect(starts).toEqual([3]);
  });
});

describe("last chance and level-1 grace", () => {
  it("an uncleared level 1 gets the +15 s grace whatever the progress", () => {
    expect(lastChanceGrant(base())).toEqual({ seconds: LEVEL_ONE_GRACE_SECONDS, kind: "grace" });
    expect(LEVEL_ONE_GRACE_SECONDS).toBe(15);
  });

  it("the grace fires once per run", () => {
    let used = false;
    const grants = [0, 1, 2].map(() => {
      const grant = lastChanceGrant(base({ used }));
      if (grant) used = true;
      return grant;
    });
    expect(grants.filter(Boolean)).toHaveLength(1);
  });

  it("a cleared level 1 falls back to the usual rule", () => {
    expect(lastChanceGrant(base({ levelCleared: true }))).toBeNull();
    expect(lastChanceGrant(base({ levelCleared: true, score: LEVEL_1.targetScore }))).toEqual({
      seconds: LAST_CHANCE_SECONDS,
      kind: "close",
    });
  });

  it("other uncleared levels get no automatic grace", () => {
    const level2 = base({
      levelId: LEVEL_2.id,
      targetScore: LEVEL_2.targetScore,
      objectiveTarget: LEVEL_2.objectiveTarget,
      gate: LEVEL_2.lastChanceProgressGate,
    });
    expect(lastChanceGrant(level2)).toBeNull();
    expect(lastChanceGrant({ ...level2, objectiveCollected: LEVEL_2.objectiveTarget - 2 })?.kind).toBe("close");
    expect(lastChanceGrant({ ...level2, score: Math.ceil(LEVEL_2.targetScore * LEVEL_2.lastChanceProgressGate) })?.kind).toBe(
      "close",
    );
  });

  it("an ended run gets nothing", () => {
    expect(lastChanceGrant(base({ ended: true }))).toBeNull();
  });

  it("level 1 is the first config level", () => {
    expect(isFirstLevel(LEVEL_1.id)).toBe(true);
    expect(isFirstLevel(LEVEL_2.id)).toBe(false);
  });
});

describe("level select progress", () => {
  it("a first visit points at level 1 only (START HERE)", () => {
    const p = match3LevelProgress({ match3Cleared: [] });
    expect(p.source).toBe("server");
    expect(p.firstVisit).toBe(true);
    expect(p.unlocked[0]).toBe(true);
    expect(p.unlocked.slice(1).some(Boolean)).toBe(false);
  });

  it("server rule: unlocked(i) = i === 0 || cleared[i - 1]", () => {
    const p = match3LevelProgress({ match3Cleared: [1, 0, 1], match3: [0, 99, 99] });
    expect(p.cleared.slice(0, 3)).toEqual([true, false, true]);
    expect(p.unlocked.slice(0, 4)).toEqual([true, true, false, true]);
    expect(p.firstVisit).toBe(false);
  });

  it("server rule ignores catnip: a death with catnip unlocks nothing", () => {
    const p = match3LevelProgress({ match3Cleared: [0], match3: [50] });
    expect(p.unlocked[1]).toBe(false);
  });

  it("legacy rule (no server field yet) keeps old unlocks", () => {
    const need = legacyUnlockRequirement(1);
    expect(need).toBe(Math.max(1, Math.round(LEVEL_1.catnipCap * 0.2)));
    expect(match3LevelProgress({ match3: [need] }).unlocked[1]).toBe(true);
    expect(match3LevelProgress({ match3: [need - 1] }).unlocked[1]).toBe(false);
    expect(match3LevelProgress({ match3: [need] }).source).toBe("legacy");
  });

  it("no profile is a first visit", () => {
    expect(match3LevelProgress(null).firstVisit).toBe(true);
    expect(match3LevelProgress(undefined).unlocked[0]).toBe(true);
  });

  it("isMatch3LevelCleared reads the same flags", () => {
    expect(isMatch3LevelCleared({ match3Cleared: [1] }, LEVEL_1.id)).toBe(true);
    expect(isMatch3LevelCleared({ match3Cleared: [0] }, LEVEL_1.id)).toBe(false);
    expect(isMatch3LevelCleared({ match3Cleared: [1] }, "nope")).toBe(false);
  });

  it("junk values never unlock", () => {
    const p = match3LevelProgress({ match3Cleared: ["x", null, Number.NaN] });
    expect(p.cleared.slice(0, 3)).toEqual([false, false, false]);
  });
});
