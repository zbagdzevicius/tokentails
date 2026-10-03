import { clampPoints, decideSave, isHardDeath, isSoftStop, resolveOutcome, wasCleared } from "@/components/Phaser/onboarding/save-policy";
import { CATNIP_CHAOS_LEVELS } from "@/shared-contracts/caps";
import { GameType } from "@/models/game";

/** Plan G10 / F6: when a run is saved through /live, and what is sent. */

const CC = GameType.CATNIP_CHAOS;
const clearedOn = (...levels: string[]) => CATNIP_CHAOS_LEVELS.map((level) => (levels.includes(level) ? 1 : 0));
const base = { mode: CC, level: "11", points: 5, canSave: true };

describe("save policy", () => {
  it("always saves a win and reports a first clear", () => {
    const decision = decideSave({ ...base, outcome: "won", profile: { catnipChaos: [0, 9], catnipChaosCleared: clearedOn() } });
    expect(decision).toMatchObject({ save: true, reason: "won", clearedNow: true, points: 5 });
  });

  it("does not call a repeat win a first clear", () => {
    const decision = decideSave({ ...base, outcome: "won", profile: { catnipChaosCleared: clearedOn("11") } });
    expect(decision).toMatchObject({ save: true, clearedNow: false });
  });

  it("saves a hard death only when it beats the best", () => {
    expect(decideSave({ ...base, outcome: "died", profile: { catnipChaos: [0, 5] } })).toMatchObject({ save: false, reason: "not-better" });
    expect(decideSave({ ...base, outcome: "died", profile: { catnipChaos: [0, 4] } })).toMatchObject({ save: true, reason: "new-best" });
    expect(decideSave({ ...base, outcome: "timeout", points: 1, profile: null, canSave: true })).toMatchObject({ save: true });
  });

  it("never saves a soft stop (quit)", () => {
    expect(decideSave({ ...base, outcome: "quit", profile: { catnipChaos: [] } })).toMatchObject({ save: false, reason: "soft-stop" });
  });

  it("never saves without a session, but still reports the clear for the panel", () => {
    expect(decideSave({ ...base, outcome: "won", profile: null, canSave: false })).toMatchObject({ save: false, reason: "no-session", clearedNow: true });
    expect(decideSave({ ...base, outcome: "won", profile: { catnipChaosCleared: clearedOn() }, canSave: false })).toMatchObject({ save: false, clearedNow: true });
  });

  it("clamps an endless run to the cap instead of sending a value the backend refuses (1a bug #4)", () => {
    expect(clampPoints(CC, "01", 731)).toBe(500);
    const decision = decideSave({ ...base, level: "01", outcome: "died", points: 731, profile: { catnipChaos: [120] } });
    expect(decision).toMatchObject({ save: true, points: 500, clearedNow: false });
    expect(clampPoints(CC, "11", 12)).toBe(10);
    expect(clampPoints(CC, "11", -3)).toBe(0);
    expect(clampPoints(CC, "11", Number.NaN)).toBe(0);
    expect(clampPoints("HOME", null, 7.8)).toBe(7);
  });

  it("compares the Paw Match raw score too", () => {
    const decision = decideSave({
      mode: GameType.MATCH_3,
      level: "1",
      outcome: "timeout",
      points: 3,
      score: 900,
      profile: { match3: [5], match3Score: [800] },
      canSave: true,
    });
    expect(decision).toMatchObject({ save: true, reason: "new-best" });
  });

  it("ignores modes and levels it does not score", () => {
    expect(decideSave({ ...base, mode: GameType.HOME, outcome: "won", profile: null })).toMatchObject({ save: false, reason: "unscored-mode" });
    expect(decideSave({ ...base, level: "999", outcome: "won", profile: null })).toMatchObject({ save: false, reason: "unknown-level" });
  });

  it("infers an outcome for scenes that predate it", () => {
    expect(resolveOutcome(undefined, "3")).toBe("won");
    expect(resolveOutcome(undefined, null)).toBe("died");
    expect(resolveOutcome("timeout", null)).toBe("timeout");
    expect(isSoftStop("quit")).toBe(true);
    expect(isHardDeath("timeout")).toBe(true);
    expect(isHardDeath("won")).toBe(false);
  });

  it("reads cleared state with the grandfathering fallback", () => {
    expect(wasCleared({ catnipChaos: [0, 3] }, CC, "11")).toBe(true);
    expect(wasCleared({ catnipChaos: [0, 3], catnipChaosCleared: [] }, CC, "11")).toBe(false);
  });
});
