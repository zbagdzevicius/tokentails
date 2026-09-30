import { getMatch3RunTime } from "@/components/Match3/match3.config";

// Paw Match used to save `timeLimit - timeLeft`, which went negative once a
// day-streak bonus pushed timeLeft above the limit. The scene now counts the
// seconds it actually ticked and saves that.
describe("getMatch3RunTime", () => {
  it("returns the whole seconds played", () => {
    expect(getMatch3RunTime(0)).toBe(0);
    expect(getMatch3RunTime(64)).toBe(64);
    expect(getMatch3RunTime(12.9)).toBe(12);
  });

  it("never returns a negative or non-finite time", () => {
    expect(getMatch3RunTime(-4)).toBe(0);
    expect(getMatch3RunTime(Number.NaN)).toBe(0);
    expect(getMatch3RunTime(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
