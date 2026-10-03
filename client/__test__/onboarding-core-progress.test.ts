import {
  allCleared,
  bestFor,
  clearedFlags,
  firstTimeLevel,
  isUnlocked,
  levelIndex,
  MODE_LEVELS,
  startHere,
} from "@/components/Phaser/onboarding/progress";
import { CATNIP_CHAOS_LEVELS } from "@/shared-contracts/caps";
import { GameType } from "@/models/game";

/** Plan G10: the unlock rule over the full list, server cleared state, INFINITE after 1-1 (#69). */

const CC = GameType.CATNIP_CHAOS;
const cleared = (...levels: string[]) => CATNIP_CHAOS_LEVELS.map((level) => (levels.includes(level) ? 1 : 0));

describe("Purrsuit unlock rule", () => {
  it("opens 1-1 and nothing else for a new player", () => {
    const flags = clearedFlags({ catnipChaos: [], catnipChaosCleared: [] }, CC);
    expect(isUnlocked(CC, "11", flags)).toBe(true);
    expect(isUnlocked(CC, "12", flags)).toBe(false);
    expect(isUnlocked(CC, "01", flags)).toBe(false);
  });

  it("keeps INFINITE locked until 1-1 is cleared, however much INFINITE catnip there is", () => {
    // The old rule counted any score, so INFINITE catnip unlocked 1-2 (known bug).
    const flags = clearedFlags({ catnipChaos: [400], catnipChaosCleared: cleared() }, CC);
    expect(isUnlocked(CC, "01", flags)).toBe(false);
    expect(isUnlocked(CC, "12", flags)).toBe(false);
    const after = clearedFlags({ catnipChaos: [400, 3], catnipChaosCleared: cleared("11") }, CC);
    expect(isUnlocked(CC, "01", after)).toBe(true);
    expect(isUnlocked(CC, "12", after)).toBe(true);
    expect(isUnlocked(CC, "13", after)).toBe(false);
  });

  it("a death with catnip unlocks nothing: only a clear does", () => {
    // 1-1 lost with one catnip (points 1, cleared 0): 1-2 stays shut.
    const flags = clearedFlags({ catnipChaos: [0, 1], catnipChaosCleared: cleared() }, CC);
    expect(isUnlocked(CC, "12", flags)).toBe(false);
  });

  it("walks the full list across world boundaries (1-6 -> 2-1, 9-6 -> 10-1)", () => {
    expect(isUnlocked(CC, "21", clearedFlags({ catnipChaosCleared: cleared("16") }, CC))).toBe(true);
    expect(isUnlocked(CC, "21", clearedFlags({ catnipChaosCleared: cleared("15") }, CC))).toBe(false);
    expect(isUnlocked(CC, "101", clearedFlags({ catnipChaosCleared: cleared("96") }, CC))).toBe(true);
  });

  it("grandfathers points > 0 when the profile has no cleared array (older backend)", () => {
    const flags = clearedFlags({ catnipChaos: [0, 4, 2] }, CC);
    expect(flags[levelIndex(CC, "11")]).toBe(true);
    expect(isUnlocked(CC, "13", flags)).toBe(true);
    expect(isUnlocked(CC, "14", flags)).toBe(false);
  });

  it("over a server array, honours only pending clears (a save in flight), not the local cache", () => {
    // Another player's clear on this device, or one the server refused: ignored (5a review #1).
    expect(isUnlocked(CC, "12", clearedFlags({ catnipChaosCleared: cleared() }, CC, ["11"], []))).toBe(false);
    // The won run whose save has not answered yet still unlocks the next level.
    expect(isUnlocked(CC, "12", clearedFlags({ catnipChaosCleared: cleared() }, CC, ["11"], ["11"]))).toBe(true);
  });

  it("a caller without pending clears keeps the older cache rule (Cupid Cat, task 5b)", () => {
    expect(isUnlocked(CC, "12", clearedFlags({ catnipChaosCleared: cleared() }, CC, ["11"]))).toBe(true);
  });

  it("without a server array (signed out, older backend), local clears count", () => {
    expect(isUnlocked(CC, "12", clearedFlags(null, CC, ["11"]))).toBe(true);
    expect(isUnlocked(CC, "12", clearedFlags({ catnipChaos: [] }, CC, ["11"]))).toBe(true);
  });

  it("a death with catnip unlocks nothing (points alone are not a clear over a server array)", () => {
    const flags = clearedFlags({ catnipChaos: [0, 5], catnipChaosCleared: cleared() }, CC);
    expect(isUnlocked(CC, "12", flags)).toBe(false);
    expect(isUnlocked(CC, "01", flags)).toBe(false);
  });

  it("never marks the endless run cleared", () => {
    const flags = clearedFlags({ catnipChaos: [500], catnipChaosCleared: [1] }, CC, ["01"], ["01"]);
    expect(flags[0]).toBe(false);
  });
});

describe("level map markers and routing", () => {
  const map = ["11", "12", "13"];
  it("puts START HERE on the first uncleared level", () => {
    expect(startHere(CC, clearedFlags({ catnipChaosCleared: cleared() }, CC), map)).toBe("11");
    expect(startHere(CC, clearedFlags({ catnipChaosCleared: cleared("11") }, CC), map)).toBe("12");
    expect(startHere(CC, clearedFlags({ catnipChaosCleared: cleared("11", "12", "13") }, CC), map)).toBeNull();
  });

  it("shows the all-cleared notice only when every level is cleared", () => {
    expect(allCleared(CC, clearedFlags({ catnipChaosCleared: cleared("11", "12") }, CC), map)).toBe(false);
    expect(allCleared(CC, clearedFlags({ catnipChaosCleared: cleared("11", "12", "13") }, CC), map)).toBe(true);
    expect(allCleared(CC, [], [])).toBe(false);
  });

  it("routes a player with no clears straight to the first level", () => {
    expect(firstTimeLevel(CC, clearedFlags(null, CC))).toBe("11");
    expect(firstTimeLevel(CC, clearedFlags({ catnipChaosCleared: cleared("11") }, CC))).toBeNull();
    expect(firstTimeLevel(GameType.PIXEL_RESCUE, clearedFlags(null, GameType.PIXEL_RESCUE))).toBe("1");
    expect(firstTimeLevel(GameType.MATCH_3, clearedFlags(null, GameType.MATCH_3))).toBe("1");
  });

  it("reads the best points and Paw Match score of a level", () => {
    expect(bestFor({ catnipChaos: [0, 7] }, CC, "11")).toEqual({ points: 7, score: 0 });
    expect(bestFor({ match3: [9], match3Score: [1200] }, GameType.MATCH_3, "1")).toEqual({ points: 9, score: 1200 });
    expect(bestFor(null, CC, "11")).toEqual({ points: 0, score: 0 });
    expect(bestFor({ catnipChaos: [1] }, CC, "nope")).toEqual({ points: 0, score: 0 });
  });

  it("mirrors the backend level tables", () => {
    expect(MODE_LEVELS[CC].levels).toBe(CATNIP_CHAOS_LEVELS);
    expect(MODE_LEVELS[CC].caps[0]).toBe(500);
    expect(MODE_LEVELS[CC].caps[1]).toBe(10);
  });
});
