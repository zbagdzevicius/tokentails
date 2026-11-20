/**
 * The party ticket under a limit (founder, 2026-11-20: "lift such restrictions please, it'll result in many bugs"): a
 * 429 on `POST /pawlegends/party/ticket` sent a signed-in player into the relay as a guest. It is retried quietly
 * within the game's ticket wait; any other answer is returned at once.
 */
const mockApiFetch = jest.fn();
jest.mock("@/api/api", () => ({
  ApiError: class extends Error {},
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  apiUrl: "https://api.test",
  currentAccessToken: () => "fbtoken",
  rawApiFetch: jest.fn(),
  readError: jest.fn(),
  readErrorCode: async () => null,
}));
jest.mock("@/analytics/platform", () => ({ getPlatform: () => "web" }));

import { PARTY_TICKET_429_RETRIES, USER_API } from "@/api/user-api";

const answer = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe("party ticket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("a 429 is retried quietly and the ticket still arrives", async () => {
    mockApiFetch.mockResolvedValueOnce(answer(429)).mockResolvedValueOnce(answer(200, { ticket: "t-1" }));
    const p = USER_API.pawlegendsPartyTicket();
    await jest.advanceTimersByTimeAsync(PARTY_TICKET_429_RETRIES[0] + 250);
    await expect(p).resolves.toEqual({ ticket: "t-1", status: 200, code: null });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retries (the game then waits for its own reconnect)", async () => {
    mockApiFetch.mockResolvedValue(answer(429));
    const p = USER_API.pawlegendsPartyTicket();
    await jest.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toMatchObject({ ticket: null, status: 429 });
    expect(mockApiFetch).toHaveBeenCalledTimes(PARTY_TICKET_429_RETRIES.length + 1);
  });

  it("any other failure answers at once", async () => {
    mockApiFetch.mockResolvedValue(answer(503));
    await expect(USER_API.pawlegendsPartyTicket()).resolves.toMatchObject({ ticket: null, status: 503 });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
