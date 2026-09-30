import { MatchSaveThrottledError, USER_API } from "@/api/user-api";
import { GameType } from "@/models/game";

jest.mock("@/api/api", () => ({
  apiUrl: "https://api.test",
  waitForLocalStorageKey: jest.fn(async () => undefined),
}));
jest.mock("@/analytics/platform", () => ({ getPlatform: () => "web" }));

// POST /user/catbassadors/live is rate limited. A throttled save must be
// retried once after Retry-After, then reported as throttled, never as a
// generic failure.
describe("USER_API.saveMatch", () => {
  const match = { type: GameType.MATCH_3, points: 3, time: 10, level: "1" };

  const response = (status: number, retryAfter?: string, body: unknown = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === "Retry-After" ? retryAfter ?? null : null) },
    json: async () => body,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    Object.assign(globalThis, { sessionStorage: { getItem: jest.fn(() => null) } });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("retries once after Retry-After and returns the saved profile", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(429, "3"))
      .mockResolvedValueOnce(response(201, undefined, { match3: [] }));
    globalThis.fetch = fetchMock;

    const saved = USER_API.saveMatch(match);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(saved).resolves.toEqual({ match3: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });

  it("throws MatchSaveThrottledError when the retry is throttled too", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(429, "1"));
    const saved = USER_API.saveMatch(match);
    const assertion = expect(saved).rejects.toBeInstanceOf(MatchSaveThrottledError);
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("does not wait when Retry-After is missing", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(429));
    await expect(USER_API.saveMatch(match)).rejects.toBeInstanceOf(MatchSaveThrottledError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("still resolves null on other failures", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(500));
    await expect(USER_API.saveMatch(match)).resolves.toBeNull();
  });
});
