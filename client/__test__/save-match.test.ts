import { MatchSaveThrottledError, USER_API, type HeistMatch } from "@/api/user-api";
import { GameType } from "@/models/game";

jest.mock("@/api/api", () => ({
  ...jest.requireActual("@/api/api"),
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

// The Heist host's save (plan G2 layer 3): every outcome comes back as { ok, status, code }, with no
// waiting for a token and no retry of its own; saveMatch above is unchanged for current callers.
describe("USER_API.saveMatchDetailed", () => {
  const heist: HeistMatch = {
    type: GameType.CATNIP_HEIST,
    replay: { levelId: "heist-01", simVersion: 3, seed: 1, catIds: ["bob", "oreo"] as [string, string], ticks: 2, runs: [[0, 0, 0, 2]] as [number, number, number, number][] },
  };
  const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    clone() {
      return this;
    },
  });

  beforeEach(() => {
    Object.assign(globalThis, { sessionStorage: { getItem: jest.fn(() => "fbtoken") } });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("posts type, replay and platform with the lowercase accesstoken, and returns the body", async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply(201, { heistScore: [180] }));
    globalThis.fetch = fetchMock;
    await expect(USER_API.saveMatchDetailed(heist)).resolves.toEqual({ ok: true, status: 201, code: null, body: { heistScore: [180] } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/user/catbassadors/live");
    expect(JSON.parse(init.body)).toEqual({ ...heist, platform: "web" });
    expect(init.headers.accesstoken).toBe("fbtoken");
    expect(Object.keys(init.headers)).not.toContain("Authorization");
  });

  it.each([
    [409, { code: "HEIST_DUPLICATE" }, "HEIST_DUPLICATE"],
    [400, { code: "HEIST_SIM_VERSION" }, "HEIST_SIM_VERSION"],
    [400, { message: { code: "HEIST_REPLAY_INVALID" } }, "HEIST_REPLAY_INVALID"],
    [401, { message: "Unauthorized" }, null],
  ])("reports %i with its code", async (status, body, code) => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(status, body));
    await expect(USER_API.saveMatchDetailed(heist)).resolves.toEqual({ ok: false, status, code });
  });

  it.each([
    [{ code: "HEIST_DUPLICATE", mine: true }, true],
    [{ code: "HEIST_DUPLICATE", mine: false }, false],
  ])("passes a 409 body's mine on (%o)", async (body, mine) => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(409, body));
    await expect(USER_API.saveMatchDetailed(heist)).resolves.toEqual({ ok: false, status: 409, code: "HEIST_DUPLICATE", mine });
  });

  it("does not retry a 429 itself and passes Retry-After on", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(429, {}, { "Retry-After": "12" }));
    await expect(USER_API.saveMatchDetailed(heist)).resolves.toEqual({ ok: false, status: 429, code: null, retryAfter: 12 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("maps a network failure to status 0 instead of throwing", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(USER_API.saveMatchDetailed(heist)).resolves.toEqual({ ok: false, status: 0, code: null });
  });
});
