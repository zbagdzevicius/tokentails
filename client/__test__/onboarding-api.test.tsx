/**
 * @jest-environment jsdom
 */
import { setAuthBridge } from "@/api/api";
import { STARTER_API } from "@/api/starter-api";
import { commitStarterChoice, isRetryable } from "@/components/onboarding/commit";
import { clearDraft, readDraft } from "@/components/onboarding/draft";
import { renameFailureMessage } from "@/components/onboarding/RenameSheet";
import { StarterBreed } from "@/shared-contracts/enums";

/** The Meet your cat API (plan G3, task 3c routes) and the offline fallback. */

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return respond(status, body);
    },
  } as unknown as Response;
}

const CAT = { _id: "c1", name: "Nimbus", starterBreed: StarterBreed.MISTY, isStarter: true };
const DONE = { state: "done", version: 1, skipped: false };

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = jest.fn() as FetchMock;
  (globalThis as unknown as { fetch: FetchMock }).fetch = fetchMock;
  sessionStorage.setItem("accesstoken", "fbtoken-123");
  clearDraft();
  setAuthBridge({});
});

describe("POST /user/starter", () => {
  it("commits with the lowercase fb-prefixed accesstoken header and the choice as JSON", async () => {
    fetchMock.mockResolvedValueOnce(respond(201, { success: true, cat: CAT, onboarding: DONE }));
    const result = await STARTER_API.commitStarter({ breed: StarterBreed.MISTY, name: "Nimbus" });
    expect(result).toEqual({ status: "committed", cat: CAT, onboarding: DONE });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/user\/starter$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ breed: "MISTY", name: "Nimbus" });
    const headers = init?.headers as Record<string, string>;
    expect(Object.keys(headers)).toContain("accesstoken");
    expect(headers.accesstoken).toBe("fbtoken-123");
    expect(Object.keys(headers).some((name) => /authorization/i.test(name))).toBe(false);
  });

  it("treats 409 STARTER_LOCKED as done", async () => {
    fetchMock.mockResolvedValueOnce(respond(409, { statusCode: 409, code: "STARTER_LOCKED", message: "x" }));
    await expect(STARTER_API.commitStarter({ breed: StarterBreed.SCOUT, skipped: true })).resolves.toEqual({ status: "locked" });
  });

  it("returns a server NAME_* refusal for the name step (Nest nests the code too)", async () => {
    fetchMock.mockResolvedValueOnce(respond(400, { statusCode: 400, message: { code: "NAME_RESERVED" } }));
    await expect(STARTER_API.commitStarter({ breed: StarterBreed.SCOUT, name: "Kretis" })).resolves.toEqual({
      status: "invalid",
      code: "NAME_RESERVED",
    });
  });

  it("a guest's first commit creates the guest session once and is retried (428)", async () => {
    const ensureGuestSession = jest.fn(async () => {
      sessionStorage.setItem("accesstoken", "fbtoken-guest");
      return true;
    });
    setAuthBridge({ ensureGuestSession });
    fetchMock
      .mockResolvedValueOnce(respond(428, { statusCode: 428, code: "GUEST_SESSION_REQUIRED" }))
      .mockResolvedValueOnce(respond(201, { success: true, cat: CAT, onboarding: DONE }));
    const result = await STARTER_API.commitStarter({ breed: StarterBreed.MISTY, name: "Nimbus" });
    expect(result.status).toBe("committed");
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
  });

  it("reports offline and server errors as failed", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(STARTER_API.commitStarter({ breed: StarterBreed.SCOUT })).resolves.toEqual({
      status: "failed",
      httpStatus: null,
      offline: true,
    });
    fetchMock.mockResolvedValueOnce(respond(503, {}));
    await expect(STARTER_API.commitStarter({ breed: StarterBreed.SCOUT })).resolves.toEqual({
      status: "failed",
      httpStatus: 503,
      offline: false,
    });
  });
});

describe("commitStarterChoice: the localStorage draft is only an offline fallback", () => {
  it("keeps a draft when the request cannot reach the server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await commitStarterChoice({ breed: StarterBreed.MISTY, name: "Nimbus" }, "uid-1");
    expect(readDraft("uid-1")).toMatchObject({ breed: "MISTY", name: "Nimbus" });
  });

  it("drops the draft once the commit lands, or the starter was locked already", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await commitStarterChoice({ breed: StarterBreed.MISTY, name: "Nimbus" }, "uid-1");
    fetchMock.mockResolvedValueOnce(respond(409, { code: "STARTER_LOCKED" }));
    await commitStarterChoice({ breed: StarterBreed.MISTY, name: "Nimbus" }, "uid-1");
    expect(readDraft("uid-1")).toBeNull();
  });

  it("never keeps a draft for a refused name or an auth error", async () => {
    fetchMock.mockResolvedValueOnce(respond(400, { code: "NAME_BLOCKED" }));
    await commitStarterChoice({ breed: StarterBreed.MISTY, name: "Rude" }, "uid-1");
    fetchMock.mockResolvedValueOnce(respond(401, {}));
    await commitStarterChoice({ breed: StarterBreed.MISTY, name: "Nimbus" }, "uid-1");
    expect(readDraft("uid-1")).toBeNull();
  });

  it("retries only what can succeed later", () => {
    expect(isRetryable({ status: "failed", httpStatus: null, offline: true })).toBe(true);
    expect(isRetryable({ status: "failed", httpStatus: 503, offline: false })).toBe(true);
    expect(isRetryable({ status: "failed", httpStatus: 428, offline: false })).toBe(true);
    expect(isRetryable({ status: "failed", httpStatus: 401, offline: false })).toBe(false);
    expect(isRetryable({ status: "failed", httpStatus: 403, offline: false })).toBe(false);
  });
});

describe("featured cats and follow", () => {
  it("lists rescue cats and never throws", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, [{ _id: "b1", name: "kretis", status: "WAITING" }, { bad: true }]));
    await expect(STARTER_API.featured(3)).resolves.toEqual([{ _id: "b1", name: "kretis", status: "WAITING" }]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/blessing\/featured\?limit=3$/);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    await expect(STARTER_API.featured(3)).resolves.toEqual([]);
    fetchMock.mockResolvedValueOnce(respond(200, { names: ["kretis", 3] }));
    await expect(STARTER_API.featuredNames()).resolves.toEqual(["kretis"]);
  });

  it("follows and unfollows by blessing id", async () => {
    fetchMock.mockResolvedValueOnce(respond(201, { success: true, following: ["b1"] }));
    await expect(STARTER_API.follow("b1")).resolves.toEqual({ ok: true, following: ["b1"] });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/user\/following\/b1$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    fetchMock.mockResolvedValueOnce(respond(200, { success: true, following: [] }));
    await expect(STARTER_API.unfollow("b1")).resolves.toEqual({ ok: true, following: [] });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    fetchMock.mockResolvedValueOnce(respond(404, {}));
    await expect(STARTER_API.follow("nope")).resolves.toEqual({ ok: false, httpStatus: 404 });
  });
});

describe("rename and report", () => {
  it("maps the rename answers", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { success: true, cat: { _id: "c1", name: "Comet" } }));
    await expect(STARTER_API.renameCat("c1", "Comet")).resolves.toEqual({ status: "renamed", cat: { _id: "c1", name: "Comet" } });
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
    fetchMock.mockResolvedValueOnce(respond(409, { nextRenameAt: "2026-10-31T00:00:00.000Z", message: "later" }));
    await expect(STARTER_API.renameCat("c1", "Comet")).resolves.toEqual({ status: "cooldown", nextRenameAt: "2026-10-31T00:00:00.000Z" });
    fetchMock.mockResolvedValueOnce(respond(409, { message: "Minted cats keep their name" }));
    await expect(STARTER_API.renameCat("c1", "Comet")).resolves.toEqual({ status: "frozen", message: "Minted cats keep their name" });
    fetchMock.mockResolvedValueOnce(respond(400, { code: "NAME_CHARS" }));
    await expect(STARTER_API.renameCat("c1", "C$")).resolves.toEqual({ status: "invalid", code: "NAME_CHARS" });
  });

  it("explains a refused rename", () => {
    expect(renameFailureMessage({ status: "invalid", code: "NAME_BLOCKED" })).toBe("Please choose a kinder name.");
    expect(renameFailureMessage({ status: "cooldown", nextRenameAt: null })).toBe("You can rename your cat once every 30 days.");
    expect(renameFailureMessage({ status: "cooldown", nextRenameAt: "2026-10-31T00:00:00.000Z" })).toMatch(/^You can rename your cat again on .*2026\.$/);
    expect(renameFailureMessage({ status: "frozen", message: null })).toBe("This cat's name can't be changed any more.");
  });

  it("reports a name with a reason", async () => {
    fetchMock.mockResolvedValueOnce(respond(201, { success: true }));
    await expect(STARTER_API.reportName("c9", "offensive")).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/cat\/c9\/report$/);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ reason: "offensive" });
  });
});
