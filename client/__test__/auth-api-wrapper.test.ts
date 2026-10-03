/**
 * @jest-environment jsdom
 */
process.env.NEXT_PUBLIC_BE_URL = "https://api.test";

import {
  ApiError,
  apiFetch,
  installApiInterceptor,
  interceptOptions,
  setAuthBridge,
  type AuthBridge,
} from "@/api/api";
import { USER_API } from "@/api/user-api";
import { __resetSessionsForTests, ensureGuestSessionOnce } from "@/context/auth/sessions";

jest.mock("@/analytics/platform", () => ({ getPlatform: () => "web" }));

type Reply = { status: number; body?: unknown };

const response = ({ status, body = {} }: Reply) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    clone() {
      return response({ status, body });
    },
  }) as unknown as Response;

const code = (status: number, value: string): Reply => ({ status, body: { statusCode: status, code: value } });

function fetchSequence(...replies: Reply[]) {
  const mock = jest.fn();
  replies.forEach((reply) => mock.mockResolvedValueOnce(response(reply)));
  mock.mockResolvedValue(response({ status: 200 }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

let token = "fbANON";
let removeBridge: () => void = () => undefined;

beforeEach(() => {
  token = "fbANON";
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => (key === "accesstoken" ? token : null));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  __resetSessionsForTests();
});
afterEach(() => {
  removeBridge();
  jest.restoreAllMocks();
});

function bridge(next: AuthBridge) {
  removeBridge = setAuthBridge(next);
}

const write = { method: "POST", headers: { accesstoken: "fbANON" }, body: '{"points":3}' };

describe("apiFetch (F5.7 status handling)", () => {
  it("428 GUEST_SESSION_REQUIRED: creates the guest session once, then retries once with the same body", async () => {
    const fetchMock = fetchSequence(code(428, "GUEST_SESSION_REQUIRED"), { status: 201, body: { ok: true } });
    const ensureGuestSession = jest.fn(async () => true);
    bridge({ ensureGuestSession });
    const result = await apiFetch("https://api.test/user/catbassadors/live", write);
    expect(result.status).toBe(201);
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(write.body);
  });

  it("428 on a GET never creates a session (reading the lobby writes nothing)", async () => {
    const fetchMock = fetchSequence(code(428, "GUEST_SESSION_REQUIRED"));
    const ensureGuestSession = jest.fn(async () => true);
    bridge({ ensureGuestSession });
    const result = await apiFetch("https://api.test/user/leaderboard/position", { headers: { accesstoken: "fbANON" } });
    expect(result.status).toBe(428);
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("428 when the session cannot be created: returns the 428 without a retry", async () => {
    const fetchMock = fetchSequence(code(428, "GUEST_SESSION_REQUIRED"));
    bridge({ ensureGuestSession: async () => false });
    const result = await apiFetch("https://api.test/user/catbassadors/live", write);
    expect(result.status).toBe(428);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("concurrent first writes share one POST /user/guest/session", async () => {
    const create = jest.fn(async () => undefined);
    bridge({ ensureGuestSession: () => ensureGuestSessionOnce("uid-1", create) });
    const mock = jest.fn(async () =>
      response(create.mock.calls.length ? { status: 201 } : code(428, "GUEST_SESSION_REQUIRED"))
    );
    globalThis.fetch = mock as unknown as typeof fetch;
    const results = await Promise.all([
      apiFetch("https://api.test/user/catbassadors/live", write),
      apiFetch("https://api.test/cat/abc", { ...write, method: "PUT" }),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
  });

  it("403 GUEST_FORBIDDEN on a write: requireAccount, then one retry carrying the new token", async () => {
    const fetchMock = fetchSequence(code(403, "GUEST_FORBIDDEN"), { status: 200, body: { claimed: true } });
    const requireAccount = jest.fn(async () => {
      token = "fbACCOUNT";
      return "signed-in" as const;
    });
    bridge({ requireAccount });
    const result = await apiFetch("https://api.test/user/airdrop/claim/T1", write);
    expect(requireAccount).toHaveBeenCalledWith("claim-rewards");
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).accesstoken).toBe("fbACCOUNT");
  });

  it("403 GUEST_FORBIDDEN and the player closes the sheet: the 403 comes back, no retry", async () => {
    const fetchMock = fetchSequence(code(403, "GUEST_FORBIDDEN"));
    bridge({ requireAccount: async () => "dismissed" });
    const result = await apiFetch("https://api.test/user/airdrop/claim/T1", write);
    expect(result.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("403 GUEST_FORBIDDEN on a plain GET does not open the sheet unless the call asks for it", async () => {
    const requireAccount = jest.fn(async () => "signed-in" as const);
    bridge({ requireAccount });
    fetchSequence(code(403, "GUEST_FORBIDDEN"));
    await apiFetch("https://api.test/user/quests", { headers: {} });
    expect(requireAccount).not.toHaveBeenCalled();

    fetchSequence(code(403, "GUEST_FORBIDDEN"), { status: 200, body: { tails: 5 } });
    const spin = await apiFetch("https://api.test/user/catbassadors/lives/redeem", { headers: {} }, { requireAccount: "claim-rewards" });
    expect(requireAccount).toHaveBeenCalledWith("claim-rewards");
    expect(spin.status).toBe(200);
  });

  it("403 EMAIL_UNVERIFIED and 409 ACCOUNT_CONFLICT report to the auth runtime and return as is", async () => {
    const onEmailUnverified = jest.fn();
    const onAccountConflict = jest.fn();
    bridge({ onEmailUnverified, onAccountConflict });
    fetchSequence(code(403, "EMAIL_UNVERIFIED"));
    expect((await apiFetch("https://api.test/user/profile", { headers: {} })).status).toBe(403);
    fetchSequence(code(409, "ACCOUNT_CONFLICT"));
    expect((await apiFetch("https://api.test/user/codex", { headers: {} })).status).toBe(409);
    expect(onEmailUnverified).toHaveBeenCalledTimes(1);
    expect(onAccountConflict).toHaveBeenCalledTimes(1);
  });

  it("leaves every other status untouched, with one request", async () => {
    const handlers = { ensureGuestSession: jest.fn(), requireAccount: jest.fn() };
    bridge(handlers as unknown as AuthBridge);
    for (const status of [200, 400, 401, 403, 404, 409, 428, 429, 500]) {
      const fetchMock = fetchSequence({ status, body: { message: "x" } });
      expect((await apiFetch("https://api.test/x", write)).status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    expect(handlers.ensureGuestSession).not.toHaveBeenCalled();
    expect(handlers.requireAccount).not.toHaveBeenCalled();
  });
});

describe("installApiInterceptor", () => {
  it("routes plain fetch calls to the backend through the same handling, and nothing else", async () => {
    const original: jest.Mock = jest.fn(async (url: string): Promise<Response> =>
      response(String(url).includes("/live") && original.mock.calls.length === 1 ? code(428, "GUEST_SESSION_REQUIRED") : { status: 200 })
    );
    const target = { fetch: original } as unknown as typeof globalThis;
    globalThis.fetch = original as unknown as typeof fetch;
    const ensureGuestSession = jest.fn(async () => true);
    bridge({ ensureGuestSession });
    const uninstall = installApiInterceptor(target);
    // Idempotent: a second install keeps the first.
    installApiInterceptor(target)();
    expect((target.fetch as unknown as { __ttOriginal?: unknown }).__ttOriginal).toBe(original);

    // jsdom's globalThis is the same object the wrapper reads its raw fetch from.
    globalThis.fetch = target.fetch;
    const live = await target.fetch("https://api.test/user/catbassadors/live", write);
    expect(live.status).toBe(200);
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledTimes(2);

    await target.fetch("https://cdn.example/file.json");
    await target.fetch("https://api.test/upload", { method: "POST", body: new Blob(["x"]) });
    expect(original).toHaveBeenCalledTimes(4);
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);

    uninstall();
    expect(target.fetch).toBe(original);
  });
});

describe("interceptOptions (opt-in handling for plain fetch calls)", () => {
  const post = { method: "POST" };
  it("creates a guest session only for the guest writes", () => {
    expect(interceptOptions("/user/catbassadors/live", post)).toEqual({ guestSession: true, requireAccount: false });
    expect(interceptOptions("/user/starter", post).guestSession).toBe(true);
    expect(interceptOptions("/cat/64e2e0000000000000000c01", { method: "PUT" }).guestSession).toBe(true);
    expect(interceptOptions("/cat/64e2e0000000000000000c01/name", { method: "PUT" }).guestSession).toBe(true);
    expect(interceptOptions("/user/following/b1", { method: "DELETE" }).guestSession).toBe(true);
    // Background writes: neither a session nor the sheet.
    expect(interceptOptions("/user/entity-metadata", post)).toEqual({ guestSession: false, requireAccount: false });
    expect(interceptOptions("/quest/search", post)).toEqual({ guestSession: false, requireAccount: false });
    expect(interceptOptions("/user/codex", post)).toEqual({ guestSession: false, requireAccount: false });
    expect(interceptOptions("/cat/sale", post).guestSession).toBe(false);
  });

  it("names the sheet by the action (decision #64) and leaves GETs alone", () => {
    expect(interceptOptions("/image/create-checkout-session", post).requireAccount).toBe("purchase");
    expect(interceptOptions("/image/create-checkout-session-signed", post).requireAccount).toBe("purchase");
    expect(interceptOptions("/web3/create-payment", post).requireAccount).toBe("purchase");
    expect(interceptOptions("/shelter/donate", post).requireAccount).toBe("give-treat");
    expect(interceptOptions("/cat/adopt/64e2e0000000000000000c01", post).requireAccount).toBe("adopt");
    expect(interceptOptions("/ticket", post).requireAccount).toBe("support");
    expect(interceptOptions("/comment?x=1", post).requireAccount).toBe("sign-in");
    expect(interceptOptions("/shelter/donate/status", undefined)).toEqual({ guestSession: false, requireAccount: false });
  });

  it("a forbidden background write on an optional page opens nothing and creates nothing", async () => {
    const original = jest.fn(async (): Promise<Response> =>
      response(code(403, "GUEST_FORBIDDEN"))
    );
    const target = { fetch: original } as unknown as typeof globalThis;
    globalThis.fetch = original as unknown as typeof fetch;
    const handlers = { ensureGuestSession: jest.fn(async () => true), requireAccount: jest.fn(async () => "signed-in" as const) };
    bridge(handlers);
    const uninstall = installApiInterceptor(target);
    globalThis.fetch = target.fetch;
    const result = await target.fetch("https://api.test/user/entity-metadata", write);
    expect(result.status).toBe(403);
    expect(handlers.requireAccount).not.toHaveBeenCalled();
    expect(handlers.ensureGuestSession).not.toHaveBeenCalled();

    original.mockResolvedValueOnce(response(code(428, "GUEST_SESSION_REQUIRED")));
    expect((await target.fetch("https://api.test/user/entity-metadata", write)).status).toBe(428);
    expect(handlers.ensureGuestSession).not.toHaveBeenCalled();

    // A player action opens the sheet with its own reason.
    await target.fetch("https://api.test/shelter/donate", write);
    expect(handlers.requireAccount).toHaveBeenCalledWith("give-treat");
    uninstall();
  });
});

describe("USER_API identity methods", () => {
  it("profile throws ApiError with the F5.6 code", async () => {
    fetchSequence(code(403, "EMAIL_UNVERIFIED"));
    await expect(USER_API.profile()).rejects.toEqual(expect.objectContaining({ status: 403, code: "EMAIL_UNVERIFIED" }));
    fetchSequence({ status: 500 });
    const error = await USER_API.profile().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBeNull();
  });

  it("guestSession sends the App Check token in the lowercase x-firebase-appcheck header", async () => {
    const fetchMock = fetchSequence({ status: 201, body: { _id: "g" } });
    await USER_API.guestSession("app-check-token");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/user/guest/session");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(expect.objectContaining({ accesstoken: "fbANON", "x-firebase-appcheck": "app-check-token" }));
  });

  it("guestMerge names the guest by its fb-prefixed token in x-guest-token", async () => {
    token = "fbACCOUNT";
    const fetchMock = fetchSequence({ status: 201, body: { success: true, merged: true, gamesMoved: 2 } });
    await expect(USER_API.guestMerge("RAWGUEST")).resolves.toEqual(expect.objectContaining({ merged: true }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/user/guest/merge");
    expect(init.headers).toEqual(expect.objectContaining({ accesstoken: "fbACCOUNT", "x-guest-token": "fbRAWGUEST" }));
    // Never double-prefixed.
    fetchSequence({ status: 201, body: {} });
    await USER_API.guestMerge("fbRAWGUEST");
    expect((globalThis.fetch as jest.Mock).mock.calls[0][1].headers["x-guest-token"]).toBe("fbRAWGUEST");
  });

  it("referral, deleteGuest and deleteMe hit their routes", async () => {
    const fetchMock = fetchSequence({ status: 201 }, { status: 200 }, { status: 200 });
    await USER_API.referral("64e2e0000000000000000aaa");
    await USER_API.deleteGuest();
    await USER_API.deleteMe("apple-code");
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      "POST https://api.test/user/catbassadors/referral",
      "DELETE https://api.test/user/guest",
      "DELETE https://api.test/user/me",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ referrerId: "64e2e0000000000000000aaa" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ appleAuthorizationCode: "apple-code" });
  });

  it("redeem (the Daily Spin) opens the sheet for a guest and retries after sign-in", async () => {
    const requireAccount = jest.fn(async () => "signed-in" as const);
    bridge({ requireAccount });
    fetchSequence(code(403, "GUEST_FORBIDDEN"), { status: 200, body: { tails: 7 } });
    await expect(USER_API.redeem()).resolves.toEqual({ tails: 7 });
    expect(requireAccount).toHaveBeenCalledWith("claim-rewards");
  });

  it("a claim with no Firebase user opens the sheet instead of waiting for a token", async () => {
    token = "";
    const requireAccount = jest.fn(async () => "dismissed" as const);
    bridge({ requireAccount });
    const fetchMock = fetchSequence({ status: 200, body: { tails: 7 } });
    await expect(USER_API.redeem()).resolves.toEqual({ tails: 0 });
    await expect(USER_API.claimAirdropTier("t1")).resolves.toEqual(expect.objectContaining({ success: false }));
    expect(requireAccount).toHaveBeenCalledWith("claim-rewards");
    expect(fetchMock).not.toHaveBeenCalled();

    // Signed in from the sheet: the claim goes out with the new token.
    requireAccount.mockImplementation(async () => {
      token = "fbACCOUNT";
      return "signed-in" as never;
    });
    await expect(USER_API.redeem()).resolves.toEqual({ tails: 7 });
    expect(fetchMock.mock.calls[0][1].headers.accesstoken).toBe("fbACCOUNT");
  });
});
