/**
 * @jest-environment jsdom
 */
process.env.NEXT_PUBLIC_BE_URL = "https://api.test";

/**
 * The `/yourcat` API client (bet #3, docs/plans/yourcat-v2.md §2.2, §8 B): lowercase `accesstoken`,
 * a limited-use App Check token in `x-firebase-appcheck`, the guest session made sure of before the
 * upload, and error bodies mapped to the §1 copy (a plain 429 to the burst copy, not the network copy).
 */
import { setAuthBridge } from "@/api/api";
import { __resetAppCheckForTests, prefetchAppCheck, takeAppCheckToken, toRequestError, YOURCAT_API, YourcatRequestError } from "@/api/yourcat-api";
import { ERROR_TEXT, S1, uploadErrorCopy } from "@/components/yourcat/copy";

const mockLimitedUse = jest.fn(async () => "appcheck-1");
jest.mock("@/context/auth/appCheck", () => ({
  getLimitedUseAppCheckToken: () => mockLimitedUse(),
}));
jest.mock("firebase/app", () => ({ getApp: () => ({ name: "[DEFAULT]" }) }));

type Reply = { status: number; body?: unknown };

/** A fake XMLHttpRequest that records each request and answers from a queue. */
class FakeXhr {
  static replies: Reply[] = [];
  static sent: FakeXhr[] = [];
  static order: string[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  responseText = "";
  upload: { onload: null | (() => void) } = { onload: null };
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  onabort: null | (() => void) = null;
  ontimeout: null | (() => void) = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
    FakeXhr.sent.push(this);
    FakeXhr.order.push("upload");
    const reply = FakeXhr.replies.shift() ?? { status: 0 };
    setTimeout(() => {
      if (reply.status === 0) {
        this.onerror?.();
        return;
      }
      this.upload.onload?.();
      this.status = reply.status;
      this.responseText = JSON.stringify(reply.body ?? {});
      this.onload?.();
    }, 0);
  }
}

const VIEW = { id: "64e2e0000000000000000c01", name: "My cat", named: false, avatar: { status: "pending", url: null } };

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

beforeEach(() => {
  sessionStorage.setItem("accesstoken", "fbGuestToken");
  FakeXhr.replies = [];
  FakeXhr.sent = [];
  FakeXhr.order = [];
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  mockLimitedUse.mockClear();
  mockLimitedUse.mockImplementation(async () => "appcheck-1");
  __resetAppCheckForTests();
});

afterEach(() => setAuthBridge({}));

describe("upload", () => {
  it("makes sure of the guest session first, then sends lowercase accesstoken and the App Check token", async () => {
    const ensureGuestSession = jest.fn(async () => {
      FakeXhr.order.push("session");
      return true;
    });
    setAuthBridge({ ensureGuestSession });
    FakeXhr.replies.push({ status: 201, body: VIEW });
    const onSent = jest.fn();
    const view = await YOURCAT_API.upload(new Blob(["x"], { type: "image/jpeg" }), "photo.jpg", { noticeVersion: "2026-10-11", onSent });
    expect(view).toEqual(VIEW);
    expect(FakeXhr.order).toEqual(["session", "upload"]);
    const [xhr] = FakeXhr.sent;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("https://api.test/yourcat");
    expect(xhr.headers.accesstoken).toBe("fbGuestToken");
    expect(Object.keys(xhr.headers)).toContain("accesstoken");
    expect(Object.keys(xhr.headers).some((name) => name !== name.toLowerCase() && name.toLowerCase() === "accesstoken")).toBe(false);
    expect(xhr.headers["x-firebase-appcheck"]).toBe("appcheck-1");
    expect(xhr.body?.get("consent")).toBe("true");
    expect(xhr.body?.get("noticeVersion")).toBe("2026-10-11");
    expect((xhr.body?.get("file") as File).name).toBe("photo.jpg");
    expect(xhr.body?.get("name")).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("sends no App Check header when there is no token (App Check not configured)", async () => {
    mockLimitedUse.mockImplementation(async () => null as unknown as string);
    FakeXhr.replies.push({ status: 201, body: VIEW });
    await YOURCAT_API.upload(new Blob(["x"]), "photo.jpg", { noticeVersion: "v" });
    expect(FakeXhr.sent[0].headers["x-firebase-appcheck"]).toBeUndefined();
  });

  it("retries once after 428 GUEST_SESSION_REQUIRED with a fresh token", async () => {
    const ensureGuestSession = jest.fn(async () => true);
    setAuthBridge({ ensureGuestSession });
    mockLimitedUse.mockImplementationOnce(async () => "appcheck-1").mockImplementationOnce(async () => "appcheck-2");
    FakeXhr.replies.push({ status: 428, body: { statusCode: 428, code: "GUEST_SESSION_REQUIRED" } }, { status: 201, body: VIEW });
    await expect(YOURCAT_API.upload(new Blob(["x"]), "photo.jpg", { noticeVersion: "v" })).resolves.toEqual(VIEW);
    expect(ensureGuestSession).toHaveBeenCalledTimes(2);
    expect(FakeXhr.sent.map((xhr) => xhr.headers["x-firebase-appcheck"])).toEqual(["appcheck-1", "appcheck-2"]);
  });

  it.each([
    [{ status: 429, body: { statusCode: 429, code: "YOURCAT_IP_DAILY_CAP", message: "cap" } }, ERROR_TEXT.ownCap, ["manual"]],
    [{ status: 503, body: { statusCode: 503, code: "YOURCAT_BUDGET_EXHAUSTED" } }, ERROR_TEXT.budget, ["manual"]],
    [{ status: 422, body: { statusCode: 422, code: "YOURCAT_NO_CAT" } }, ERROR_TEXT.noCat, ["another", "manual"]],
    [{ status: 422, body: { statusCode: 422, code: "YOURCAT_PERSON_VISIBLE" } }, ERROR_TEXT.person, ["another"]],
    [{ status: 502, body: { statusCode: 502, code: "YOURCAT_CLASSIFY_FAILED" } }, ERROR_TEXT.classify, ["retry", "manual"]],
    [{ status: 413, body: { statusCode: 413, code: "YOURCAT_FILE_TOO_LARGE" } }, S1.fileSize, ["back"]],
    [{ status: 400, body: { statusCode: 400, code: "YOURCAT_NOT_DECODABLE" } }, S1.notDecodable, ["back"]],
    [{ status: 401, body: { statusCode: 401, code: "YOURCAT_APP_CHECK_INVALID" } }, ERROR_TEXT.appCheck, ["reload"]],
    [{ status: 400, body: { statusCode: 400, code: "YOURCAT_CONSENT_REQUIRED" } }, ERROR_TEXT.consent, ["reload"]],
    [{ status: 503, body: { statusCode: 503, code: "YOURCAT_NO_CLIENT_IP" } }, ERROR_TEXT.disabled, []],
    [{ status: 503, body: { statusCode: 503, code: "YOURCAT_DISABLED" } }, ERROR_TEXT.disabled, []],
    [{ status: 500, body: { statusCode: 500, message: "boom" } }, ERROR_TEXT.generic, ["retry"]],
  ])("maps %j to the §1 copy", async (reply, message, actions) => {
    FakeXhr.replies.push(reply as Reply);
    const error = await YOURCAT_API.upload(new Blob(["x"]), "photo.jpg", { noticeVersion: "v" }).catch((e) => e);
    expect(error).toBeInstanceOf(YourcatRequestError);
    expect(uploadErrorCopy(error.failure)).toMatchObject({ message, actions });
  });

  it("maps a plain 429 (no code) to the burst copy, not the network copy", async () => {
    FakeXhr.replies.push({ status: 429, body: { statusCode: 429, message: "ThrottlerException: Too Many Requests" } });
    const error = await YOURCAT_API.upload(new Blob(["x"]), "photo.jpg", { noticeVersion: "v" }).catch((e) => e);
    expect(error.kind).toBe("rate-limited");
    const copy = uploadErrorCopy(error.failure);
    expect(copy.message).toBe(ERROR_TEXT.burst);
    expect(copy.message).not.toBe(ERROR_TEXT.generic);
    expect(copy.retryAfterSeconds).toBe(10);
  });

  it("maps no answer at all to the network copy", async () => {
    FakeXhr.replies.push({ status: 0 });
    const error = await YOURCAT_API.upload(new Blob(["x"]), "photo.jpg", { noticeVersion: "v" }).catch((e) => e);
    expect(error.kind).toBe("network");
    expect(uploadErrorCopy(error.failure).message).toBe(ERROR_TEXT.generic);
  });
});

describe("App Check prefetch", () => {
  it("uses a prefetched token once, and a fresh one when it is older than 4 minutes", async () => {
    mockLimitedUse.mockImplementationOnce(async () => "early").mockImplementation(async () => "fresh");
    prefetchAppCheck(1_000);
    await expect(takeAppCheckToken(2_000)).resolves.toBe("early");
    await expect(takeAppCheckToken(3_000)).resolves.toBe("fresh"); // already used
    prefetchAppCheck(10_000);
    await expect(takeAppCheckToken(10_000 + 4 * 60 * 1000 + 1)).resolves.toBe("fresh");
  });
});

describe("JSON routes", () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn(async () => response({ status: 200, body: { item: VIEW } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("send lowercase accesstoken to the right paths", async () => {
    await YOURCAT_API.me();
    fetchMock.mockResolvedValueOnce(response({ status: 200, body: VIEW }));
    await YOURCAT_API.rename(VIEW.id, "Mochi");
    fetchMock.mockResolvedValueOnce(response({ status: 201, body: { checkoutUrl: "https://x", orderId: "o" } }));
    await YOURCAT_API.portraitCheckout(VIEW.id, "monarch");
    fetchMock.mockResolvedValueOnce(response({ status: 200, body: { success: true, photoKeptUntilDelivery: false } }));
    await YOURCAT_API.remove(VIEW.id);
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.headers.accesstoken, init.body ?? null]);
    expect(calls).toEqual([
      ["https://api.test/yourcat/me", "GET", "fbGuestToken", null],
      ["https://api.test/yourcat/64e2e0000000000000000c01", "PATCH", "fbGuestToken", JSON.stringify({ name: "Mochi" })],
      ["https://api.test/yourcat/64e2e0000000000000000c01/portrait-checkout", "POST", "fbGuestToken", JSON.stringify({ style: "monarch" })],
      ["https://api.test/yourcat/64e2e0000000000000000c01", "DELETE", "fbGuestToken", null],
    ]);
  });

  it("maps a refused name to its code and server message", async () => {
    fetchMock.mockResolvedValueOnce(response({ status: 400, body: { statusCode: 400, code: "YOURCAT_NAME_INVALID", message: "Rename your cat in the game." } }));
    const error = await YOURCAT_API.rename(VIEW.id, "Mochi").catch((e) => e);
    expect(error.code).toBe("YOURCAT_NAME_INVALID");
    expect(error.serverMessage).toBe("Rename your cat in the game.");
  });

  it("publicCat is an unauthenticated GET: no accesstoken, no guest session", async () => {
    const ensureGuestSession = jest.fn(async () => true);
    setAuthBridge({ ensureGuestSession });
    const PUBLIC = { name: "Biscuit", familyLabel: "Ginger", avatarUrl: null, spriteImg: "https://cdn/assets/YELLOW/base.png" };
    fetchMock.mockResolvedValueOnce(response({ status: 200, body: PUBLIC }));
    await expect(YOURCAT_API.publicCat("foptpG3xHIZo")).resolves.toEqual(PUBLIC);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/yourcat/public/foptpG3xHIZo");
    expect(init.method).toBe("GET");
    expect(Object.keys(init.headers).map((name) => name.toLowerCase())).not.toContain("accesstoken");
    expect(ensureGuestSession).not.toHaveBeenCalled();
  });

  it("publicCat does not retry a 428 with a guest session", async () => {
    const ensureGuestSession = jest.fn(async () => true);
    setAuthBridge({ ensureGuestSession });
    fetchMock.mockResolvedValueOnce(response({ status: 428, body: { statusCode: 428, code: "GUEST_SESSION_REQUIRED" } }));
    await expect(YOURCAT_API.publicCat("foptpG3xHIZo")).rejects.toBeInstanceOf(YourcatRequestError);
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("publicCat maps 404 to YOURCAT_NOT_FOUND and refuses a malformed id without a request", async () => {
    fetchMock.mockResolvedValueOnce(response({ status: 404, body: { statusCode: 404, code: "YOURCAT_NOT_FOUND", message: "Not found" } }));
    const unknown = await YOURCAT_API.publicCat("AAAAAAAAAAAA").catch((e) => e);
    expect(unknown).toMatchObject({ status: 404, code: "YOURCAT_NOT_FOUND" });
    for (const bad of [VIEW.id, "short", "../me", "abc/defghijk"]) {
      const error = await YOURCAT_API.publicCat(bad).catch((e) => e);
      expect(error).toBeInstanceOf(YourcatRequestError);
      expect(error).toMatchObject({ status: 404, code: "YOURCAT_NOT_FOUND" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("toRequestError reads codes only from the yourcat vocabulary", () => {
    expect(toRequestError(403, { code: "GUEST_FORBIDDEN" }).kind).toBe("server");
    expect(toRequestError(429, {}).kind).toBe("rate-limited");
    expect(toRequestError(0, null).kind).toBe("network");
  });
});
