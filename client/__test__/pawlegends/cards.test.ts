/**
 * The /pawlegends card payloads: the roster (art, catalog id, the app-build filter), the featured pick (for sale,
 * unowned, missing elements first, two different elements, stable within a day), and the session progress read
 * from the profile and moved forward by a `/live` answer.
 */
import { pickFeatured, storefrontCats } from "@/components/pawlegends/featuredBridge";
import { catalogIdOf, rosterOf } from "@/components/pawlegends/rosterBridge";
import { liveAnswerOf, openedFrom, profileAfterSave, progressFromProfile } from "@/components/pawlegends/session";
import type { ICat } from "@/models/cats";

const ART = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cats/a.png";
const id = (n: number) => `65a1b2c3d4e5f6a7b8c9d0${n.toString(16).padStart(2, "0")}`;
const sale = (n: number, type: string, over: Partial<ICat> = {}) =>
  ({ _id: id(n), name: `Cat ${n}`, type, tier: "RARE", catImg: ART, blessing: { _id: `b${n}`, status: "WAITING" }, ...over }) as unknown as ICat;

describe("rosterOf", () => {
  const cats = [
    { _id: "a1", name: "Mochi", type: "FIRE", tier: "RARE", origin: "adopt", catImg: ART, sourceCat: id(1) },
    { _id: "a2", name: "Packy", type: "ICE", tier: "EPIC", origin: "pack", catImg: "https://evil.example/a.png", blessing: { cat: { _id: id(2) } } },
    { _id: "a3", name: "Code", type: "WIND", tier: "COMMON", origin: "redeem" },
    { _id: "a4", name: "Scout", type: "WATER", tier: "COMMON", isStarter: true, origin: "starter" },
  ];

  it("adds Token Tails CDN art and the catalog id (sourceCat, else the blessing's cat)", () => {
    const roster = rosterOf(cats);
    expect(roster.find((c) => c.id === "a1")).toMatchObject({ art: ART, catalogId: id(1) });
    const packy = roster.find((c) => c.id === "a2")!;
    expect(packy.art).toBeUndefined();
    expect(packy.catalogId).toBe(id(2));
    expect(catalogIdOf({ sourceCat: "nope" })).toBeNull();
  });

  it("app builds keep only starter and redeemed cats", () => {
    expect(rosterOf(cats, true).map((c) => c.id)).toEqual(["a4", "a3"]);
  });
});

describe("pickFeatured", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("only sells what the server would: for sale, unowned, not a starter", () => {
    const forSale = [
      sale(1, "FIRE"),
      sale(2, "ICE", { owner: "someone" } as Partial<ICat>),
      sale(3, "WIND", { isStarter: true }),
      sale(4, "GRASS", { blessing: { _id: "b4", status: "ADOPTED" } } as Partial<ICat>),
      sale(5, "DARK"),
    ];
    const owned = [{ _id: "x", sourceCat: id(5) } as unknown as ICat];
    const pick = pickFeatured(forSale, owned, [], 0);
    expect(pick.cats.map((c) => c.catalogId)).toEqual([id(1)]);
    expect(pick.byId.get(id(1))?.name).toBe("Cat 1");
    expect(pick.cats[0]).toEqual({ catalogId: id(1), name: "Cat 1", type: "FIRE", art: ART });
  });

  it("never features an excluded (shelter champion) card", () => {
    const pick = pickFeatured([sale(1, "FIRE"), sale(2, "ICE")], [], [], 0, undefined, new Set([id(1)]));
    expect(pick.cats.map((c) => c.catalogId)).toEqual([id(2)]);
    expect(pick.byId.has(id(1))).toBe(false);
  });

  it("prefers elements the roster lacks, and two different elements", () => {
    const forSale = [sale(1, "FIRE"), sale(2, "FIRE"), sale(3, "FIRE"), sale(4, "ICE"), sale(5, "WATER")];
    for (let day = 0; day < 5; day++) {
      const pick = pickFeatured(forSale, [], [{ type: "WATER" }], day * DAY);
      expect(pick.cats).toHaveLength(2);
      expect(new Set(pick.cats.map((c) => c.type))).toEqual(new Set(["FIRE", "ICE"]));
    }
  });

  it("is stable within a day and rotates across days", () => {
    const forSale = Array.from({ length: 12 }, (_, i) => sale(i + 1, "FIRE"));
    const morning = pickFeatured(forSale, [], [], 10 * DAY + 1000).cats.map((c) => c.catalogId);
    const evening = pickFeatured(forSale, [], [], 10 * DAY + 20 * 3600 * 1000).cats.map((c) => c.catalogId);
    expect(evening).toEqual(morning);
    const days = new Set(Array.from({ length: 6 }, (_, d) => pickFeatured(forSale, [], [], d * DAY).cats[0].catalogId));
    expect(days.size).toBeGreaterThan(1);
  });

  it("reads a storefront object (shelter keys, _meta ignored, duplicates once)", () => {
    const cats = storefrontCats({ tokentails: [sale(1, "FIRE")], "token-tails": [sale(1, "FIRE"), sale(2, "ICE")], _meta: { v: 1 } });
    expect(cats.map((c) => c._id)).toEqual([id(1), id(2)]);
    expect(storefrontCats(null)).toEqual([]);
  });
});

describe("session progress", () => {
  it("reads the profile fields, every level present", () => {
    expect(progressFromProfile({})).toBeNull();
    expect(progressFromProfile({ pawlegendsMatches: { easy: 2 } })).toEqual({
      catnip: { easy: 0, normal: 0, rookie: 0, hard: 0 },
      matches: { easy: 2, normal: 0, rookie: 0, hard: 0 },
      fastestWin: { easy: 0, normal: 0, rookie: 0, hard: 0 },
    });
  });

  it("a /live answer moves the profile forward (one match, the first-win catnip, the fastest win)", () => {
    const answer = liveAnswerOf({ difficulty: "normal", outcome: "won", catnipPaid: 40, catnipCount: 300, fastestWin: 12000 })!;
    expect(
      profileAfterSave({ pawlegendsCatnip: { easy: 20 }, pawlegendsMatches: { easy: 4, normal: 1 }, pawlegendsFastestWin: { easy: 9000 } }, answer)
    ).toEqual({
      pawlegendsCatnip: { easy: 20, normal: 40, rookie: 0, hard: 0 },
      pawlegendsMatches: { easy: 4, normal: 2, rookie: 0, hard: 0 },
      pawlegendsFastestWin: { easy: 9000, normal: 12000, rookie: 0, hard: 0 },
      catnipCount: 300,
    });
    expect(liveAnswerOf({ difficulty: "nightmare", outcome: "won" })).toBeNull();
    expect(liveAnswerOf({ difficulty: "easy", outcome: "lost", catnipPaid: 0, catnipCount: 5, fastestWin: null })).toMatchObject({
      fastestWin: null,
    });
  });

  it("openedFrom reads ?from= and defaults to direct", () => {
    expect(openedFrom("?from=picker")).toBe("picker");
    expect(openedFrom("")).toBe("direct");
    expect(openedFrom("?from=<x>")).toBe("direct");
  });
});
