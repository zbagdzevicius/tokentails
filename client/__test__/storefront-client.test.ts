/**
 * The client side of the crash-proof storefront (plan G13 steps 4-5): `CAT_API.storefront` parses
 * every `/cat/sale` response through the shared contract and never throws or returns an array;
 * `sample` never mutates what it samples; the role helpers fall back to today's slugs.
 */
jest.mock("@/analytics", () => ({
  analytics: { track: jest.fn() },
}));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: null }) }));

import { analytics } from "@/analytics";
import { CAT_API, StorefrontResult } from "@/api/cat-api";
import { sample, seededRandom, getRandomObjectsFromArray } from "@/constants/utils";
import {
  catsForSlugs,
  FALLBACK_STOREFRONT_ROLES,
  loadStorefront,
  resetStorefrontReporting,
  FAMOUS_SLUG,
  profileSignature,
  shelterRoleOf,
  storefrontNeedsRefresh,
  storefrontRoles,
} from "@/hooks/useStorefront";
import type { ICat } from "@/models/cats";
import {
  emptyStorefront,
  STOREFRONT_REQUIRED_KEYS,
} from "@/shared-contracts/storefront";

const track = analytics.track as jest.Mock;

type FetchReply =
  | { throws: true }
  | { status: number; json?: unknown; text?: string };

const mockFetch = (reply: FetchReply) => {
  const fn = jest.fn(async () => {
    if ("throws" in reply) {
      throw new TypeError("Failed to fetch");
    }
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => {
        if (reply.text !== undefined) {
          return JSON.parse(reply.text);
        }
        return reply.json;
      },
    } as unknown as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
};

const cat = (id: string, name = `Cat ${id}`, slug?: string) =>
  ({ _id: id, name, shelter: slug ? { slug } : undefined }) as unknown as ICat;

const expectRequiredArrays = (result: StorefrontResult) => {
  expect(Array.isArray(result.cats)).toBe(false);
  STOREFRONT_REQUIRED_KEYS.forEach((key) => {
    expect(Array.isArray(result.cats[key])).toBe(true);
  });
};

describe("CAT_API.storefront", () => {
  it("parses the current shape and keeps extra shelter keys and _meta", async () => {
    mockFetch({
      status: 200,
      json: {
        tokentails: [cat("b1")],
        "token-tails": [cat("f1")],
        "token-tails-2": [],
        "rozine-pedute": [cat("p1"), cat("p2")],
        home: [cat("h1")],
        _meta: {
          _v: 1,
          generatedAt: "2026-09-30T12:00:00.000Z",
          shelters: [{ slug: "rozine-pedute", name: "Pink Paw", role: "partner" }],
        },
      },
    });
    const result = await CAT_API.storefront();
    expect(result.failure).toBeNull();
    expect(result.degraded).toBe(false);
    expect(result.cats["rozine-pedute"]).toHaveLength(2);
    expect(result.cats.home).toHaveLength(1);
    expect(result.meta?.shelters).toEqual([
      { slug: "rozine-pedute", name: "Pink Paw", role: "partner" },
    ]);
    expectRequiredArrays(result);
  });

  it("fills keys a legacy backend dropped, without calling it a failure", async () => {
    // Before the G13 backend hotfix a shelter's key vanished once all its cats were adopted.
    mockFetch({ status: 200, json: { tokentails: [cat("b1")], "token-tails": [cat("f1")] } });
    const result = await CAT_API.storefront();
    expect(result.failure).toBeNull();
    expect(result.degraded).toBe(true);
    expect(result.cats["rozine-pedute"]).toEqual([]);
    expect(result.cats["token-tails-2"]).toEqual([]);
    expect(result.meta).toBeNull();
    expectRequiredArrays(result);
  });

  it.each<[string, FetchReply, StorefrontResult["failure"]]>([
    ["a network error", { throws: true }, "network"],
    ["a 500", { status: 500, json: { statusCode: 500 } }, "http"],
    ["a 404", { status: 404, json: {} }, "http"],
    ["malformed JSON", { status: 200, text: "{ _meta: oops" }, "malformed_json"],
    ["a top-level array (the old client fallback)", { status: 200, json: [] }, "shape"],
    ["null", { status: 200, json: null }, "shape"],
    ["a string", { status: 200, json: "cats" }, "shape"],
  ])("never throws on %s", async (_label, reply, failure) => {
    mockFetch(reply);
    const result = await CAT_API.storefront();
    expect(result.failure).toBe(failure);
    expect(result.degraded).toBe(true);
    expectRequiredArrays(result);
  });

  it("drops non-object entries and turns non-array values into empty lists", async () => {
    mockFetch({
      status: 200,
      json: { "rozine-pedute": [cat("p1"), null, 3, "x"], "token-tails": { a: 1 } },
    });
    const result = await CAT_API.storefront();
    expect(result.failure).toBeNull();
    expect(result.cats["rozine-pedute"]).toHaveLength(1);
    expect(result.cats["token-tails"]).toEqual([]);
  });

  it("sends no accesstoken to the public endpoint", async () => {
    const fn = mockFetch({ status: 200, json: {} });
    await CAT_API.storefront();
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain("accesstoken");
  });

  it("catsForSale returns a Record, never []", async () => {
    mockFetch({ status: 500, json: {} });
    const cats = await CAT_API.catsForSale();
    expect(Array.isArray(cats)).toBe(false);
    expect(cats["rozine-pedute"]).toEqual([]);
  });
});

describe("CAT_API.cats", () => {
  const storage = { getItem: jest.fn(() => "fbtoken") };
  beforeAll(() => {
    (global as unknown as { sessionStorage: unknown }).sessionStorage = storage;
  });
  afterAll(() => {
    delete (global as unknown as { sessionStorage?: unknown }).sessionStorage;
  });

  it("returns the cats and sends the lowercase accesstoken", async () => {
    const fn = mockFetch({ status: 200, json: [cat("a"), null, "x", cat("b")] });
    const cats = await CAT_API.cats();
    expect(cats.map((entry) => entry._id)).toEqual(["a", "b"]);
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).accesstoken).toBe("fbtoken");
  });

  it.each<[string, FetchReply]>([
    ["an object body", { status: 200, json: { cats: [] } }],
    ["a null body", { status: 200, json: null }],
    ["malformed JSON", { status: 200, text: "<html>" }],
    ["a 500", { status: 500, json: [] }],
    ["a network error", { throws: true }],
  ])("returns [] for %s (Base calls array methods on it)", async (_label, reply) => {
    mockFetch(reply);
    await expect(CAT_API.cats()).resolves.toEqual([]);
  });
});

describe("loadStorefront", () => {
  beforeEach(() => {
    track.mockClear();
    resetStorefrontReporting();
  });

  it("reports a failure once per fetch with its reason", async () => {
    mockFetch({ status: 503, json: {} });
    const result = await loadStorefront();
    expect(result.failure).toBe("http");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith({
      name: "storefront_degraded",
      properties: { reason: "http_503" },
    });
  });

  it("reports a partial response without failing it", async () => {
    mockFetch({ status: 200, json: { tokentails: [] } });
    const result = await loadStorefront();
    expect(result.failure).toBeNull();
    expect(track).toHaveBeenCalledWith({
      name: "storefront_degraded",
      properties: { reason: "partial" },
    });
  });

  it("reports a partial response once per session, but every failure", async () => {
    mockFetch({ status: 200, json: { tokentails: [] } });
    await loadStorefront();
    await loadStorefront();
    expect(track).toHaveBeenCalledTimes(1);
    mockFetch({ status: 500, json: {} });
    await loadStorefront();
    await loadStorefront();
    expect(track).toHaveBeenCalledTimes(3);
  });

  it("reports nothing for a full response", async () => {
    mockFetch({
      status: 200,
      json: { tokentails: [], "token-tails": [], "token-tails-2": [], "rozine-pedute": [] },
    });
    await loadStorefront();
    expect(track).not.toHaveBeenCalled();
  });

  it("keeps the last good cats when a refetch fails", async () => {
    mockFetch({ status: 200, json: { "rozine-pedute": [cat("p1")] } });
    const good = await loadStorefront();
    mockFetch({ throws: true });
    const again = await loadStorefront(good);
    expect(again).toBe(good);
    expect(track).toHaveBeenLastCalledWith({
      name: "storefront_degraded",
      properties: { reason: "network" },
    });
  });
});

describe("sample", () => {
  const items = Object.freeze(["a", "b", "c", "d", "e", "f"]);

  it("never mutates the input (the old sort reshuffled the query cache)", () => {
    const list = ["a", "b", "c", "d", "e", "f"];
    const before = [...list];
    for (let i = 0; i < 20; i++) {
      sample(list, 3);
      getRandomObjectsFromArray(list, 4);
    }
    expect(list).toEqual(before);
    // A frozen array would throw on any in-place write.
    expect(() => sample(items, 6)).not.toThrow();
  });

  it("returns distinct items, at most count, and all of them when count is larger", () => {
    const picked = sample(items, 4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    picked.forEach((item) => expect(items).toContain(item));
    expect([...sample(items, 99)].sort()).toEqual([...items]);
  });

  it("accepts missing lists and bad counts", () => {
    expect(sample(undefined, 3)).toEqual([]);
    expect(sample(null, 3)).toEqual([]);
    expect(sample(items, 0)).toEqual([]);
    expect(sample(items, -1)).toEqual([]);
    expect(sample(items, Number.NaN)).toEqual([]);
    expect(sample({} as unknown as string[], 2)).toEqual([]);
  });

  it("repeats for the same seed", () => {
    expect(sample(items, 3, seededRandom(42))).toEqual(sample(items, 3, seededRandom(42)));
    const values = Array.from({ length: 100 }, seededRandom(7));
    values.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });
});

describe("storefront roles", () => {
  it("falls back to today's slugs without _meta or without roles in it", () => {
    expect(storefrontRoles(null)).toEqual(FALLBACK_STOREFRONT_ROLES);
    expect(
      storefrontRoles({ _v: 1, generatedAt: "", shelters: [] }),
    ).toEqual(FALLBACK_STOREFRONT_ROLES);
  });

  it("uses the roles from _meta, per role", () => {
    const roles = storefrontRoles({
      _v: 1,
      generatedAt: "",
      shelters: [
        { slug: "pink-paw-2", name: "Pink Paw 2", role: "partner" },
        { slug: "rozine-pedute", name: "Pink Paw", role: "partner" },
      ],
    });
    expect(roles.partner).toEqual(["pink-paw-2", "rozine-pedute"]);
    // No house entry in _meta: the house role keeps its fallback.
    expect(roles.house).toEqual(["token-tails"]);
    expect(shelterRoleOf("pink-paw-2", roles)).toBe("partner");
    expect(shelterRoleOf("token-tails", roles)).toBe("house");
    expect(shelterRoleOf("home", roles)).toBeNull();
    expect(shelterRoleOf(undefined, roles)).toBeNull();
  });

  it("keeps a fallback slug's role until _meta gives that shelter a role (backfill shape)", () => {
    // backfill-shelter-fields.js: token-tails, token-tails-2 and home become house, and
    // rozine-pedute may not have a role yet while another shelter is already a partner.
    // parseStorefront drops `_meta` entries without a valid role, so "no role" means "not listed".
    const roles = storefrontRoles({
      _v: 1,
      generatedAt: "",
      shelters: [
        { slug: "token-tails", name: "Token Tails", role: "house" },
        { slug: "token-tails-2", name: "Events", role: "house" },
        { slug: "home", name: "Home", role: "house" },
        { slug: "pink-paw-2", name: "Pink Paw 2", role: "partner" },
      ],
    });
    expect(roles.partner).toEqual(["pink-paw-2", "rozine-pedute"]);
    expect(roles.house).toEqual(["token-tails", "token-tails-2", "home"]);
    expect(shelterRoleOf("rozine-pedute", roles)).toBe("partner");
    expect(shelterRoleOf("home", roles)).toBe("house");
    expect(FAMOUS_SLUG).toBe("token-tails");
  });

  it("lets _meta move a fallback slug to another role", () => {
    const roles = storefrontRoles({
      _v: 1,
      generatedAt: "",
      shelters: [{ slug: "rozine-pedute", name: "Pink Paw", role: "house" }],
    });
    expect(roles.partner).toEqual([]);
    expect(shelterRoleOf("rozine-pedute", roles)).toBe("house");
  });

  it("asks for a refresh only when the same user's cat count changes", () => {
    resetStorefrontReporting();
    // /cat/sale is public: signing in, out or switching users changes nothing.
    expect(storefrontNeedsRefresh(profileSignature(null))).toBe(false);
    expect(storefrontNeedsRefresh(profileSignature({ _id: "u1", cats: [] }))).toBe(false);
    expect(storefrontNeedsRefresh(profileSignature({ _id: "u1", cats: [] }))).toBe(false);
    // An adoption landed on the profile.
    expect(storefrontNeedsRefresh(profileSignature({ _id: "u1", cats: [{}] }))).toBe(true);
    expect(storefrontNeedsRefresh(profileSignature({ _id: "u2", cats: [{}, {}] }))).toBe(false);
    expect(storefrontNeedsRefresh(profileSignature(null))).toBe(false);
    resetStorefrontReporting();
  });

  it("merges the cats of several slugs without repeating an _id", () => {
    const cats = emptyStorefront<ICat>();
    cats["rozine-pedute"] = [cat("p1", "Mia"), cat("p2", "Mia")];
    cats["pink-paw-2"] = [cat("p2", "Mia"), cat("p3")];
    const merged = catsForSlugs(cats, ["rozine-pedute", "pink-paw-2", "missing"]);
    expect(merged.map((entry) => entry._id)).toEqual(["p1", "p2", "p3"]);
  });
});
