import { MatchSaveThrottledError } from "@/api/user-api";
import {
  SAVE_FAILED_MESSAGE,
  SAVE_THROTTLED_MESSAGE,
  saveFailureMessage,
} from "@/context/game-save-feedback";

jest.mock("@/api/api", () => ({
  apiUrl: "https://api.test",
  waitForLocalStorageKey: jest.fn(async () => undefined),
}));
jest.mock("@/analytics/platform", () => ({ getPlatform: () => "web" }));

// POST /user/catbassadors/live has no lives check, so a failed save must never
// be reported as "out of lives".
describe("saveFailureMessage", () => {
  it("reports a throttled save as throttled", () => {
    expect(saveFailureMessage(new MatchSaveThrottledError())).toBe(
      SAVE_THROTTLED_MESSAGE,
    );
  });

  it("reports any other failure as a generic retry", () => {
    expect(saveFailureMessage(null)).toBe(SAVE_FAILED_MESSAGE);
    expect(saveFailureMessage(new TypeError("Failed to fetch"))).toBe(
      SAVE_FAILED_MESSAGE,
    );
    expect(SAVE_FAILED_MESSAGE).toBe("Could not save your score, try again");
    expect(SAVE_FAILED_MESSAGE).not.toMatch(/lives/i);
  });
});
