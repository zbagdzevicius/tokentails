/**
 * The Pink Paw cat on the share card (bet #3, docs/plans/yourcat-v2.md §5.4): only licensed cats still
 * at the shelter (WAITING or RECOVERING), never adopted, HEAVEN or unknown-status cats, never a bundled
 * fallback, and a stable pick per record.
 */
import {
  fetchPinkPawCandidates,
  fnv1a,
  pickPinkPawCat,
  pinkPawCandidates,
  type PinkPawCandidate,
} from "@/components/yourcat/pinkPawPick";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const cat = (id: string, name: string, status: string | null) => ({
  id: id.padStart(24, "a"),
  name,
  status,
  art: `https://cdn.test/${name}-art.webp`,
  photo: `https://cdn.test/${name}-photo.webp`,
});

const body = (atShelter: unknown[], adopted: unknown[] = []) => ({ atShelter, adopted });

const reply = (value: unknown, ok = true) =>
  jest.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => value }) as unknown as Response);

describe("candidates", () => {
  it("keeps only licensed cats at the shelter that are WAITING or RECOVERING", async () => {
    const fetchImpl = reply(
      body(
        [
          cat("1", "Judas", "WAITING"),
          cat("2", "RAUDVIS", "RECOVERING"),
          cat("3", "Zare", null),
          cat("4", "Lambo", "WAITING"),
          cat("5", "Simas", "HEAVEN"),
        ],
        [cat("6", "Simas", "ADOPTED")],
      ),
    );
    const list = await fetchPinkPawCandidates({ fetchImpl, base: "https://api.test" });
    expect(list.map((c) => c.name)).toEqual(["Judas", "Raudvis"]);
    expect(list[0].image).toBe("/yourcat/pink-paw/judas-card.webp");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/shelter/rozine-pedute/gallery",
      expect.objectContaining({ credentials: "omit", method: "GET" }),
    );
  });

  it("never shows a cat listed in atShelter with an ADOPTED status, or one in the adopted list", () => {
    const gallery = { atShelter: [], adopted: [{ ...cat("7", "Zare", "ADOPTED"), status: "ADOPTED" as const }] };
    expect(pinkPawCandidates(gallery)).toEqual([]);
  });

  it("returns an empty list on fetch failure, bad bodies and empty galleries (no bundled fallback)", async () => {
    const base = "https://api.test";
    expect(await fetchPinkPawCandidates({ base, fetchImpl: reply(null, false) })).toEqual([]);
    expect(await fetchPinkPawCandidates({ base, fetchImpl: reply({ nope: true }) })).toEqual([]);
    expect(await fetchPinkPawCandidates({ base, fetchImpl: reply(body([], [])) })).toEqual([]);
    expect(
      await fetchPinkPawCandidates({
        base,
        fetchImpl: jest.fn(async () => {
          throw new Error("offline");
        }),
      }),
    ).toEqual([]);
    expect(pickPinkPawCat([], "64e2e0000000000000000c01")).toBeNull();
  });

  it("gives up after the timeout", async () => {
    jest.useFakeTimers();
    try {
      const never = jest.fn(() => new Promise<Response>(() => undefined));
      const pending = fetchPinkPawCandidates({ base: "https://api.test", fetchImpl: never, timeoutMs: 3000 });
      jest.advanceTimersByTime(3001);
      await expect(pending).resolves.toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("the module has no bundled list of names to fall back on beyond the image map", () => {
    const source = readFileSync(join(__dirname, "..", "components", "yourcat", "pinkPawPick.ts"), "utf8");
    expect(source).not.toMatch(/atShelter:\s*\[\s*\{/);
  });

  it("ships the four card images", () => {
    for (const name of ["judas", "raudvis", "zare", "simas"]) {
      expect(existsSync(join(__dirname, "..", "public", "yourcat", "pink-paw", `${name}-card.webp`))).toBe(true);
    }
  });
});

describe("pick", () => {
  const candidates: PinkPawCandidate[] = [
    { name: "Judas", image: "/j" },
    { name: "Raudvis", image: "/r" },
    { name: "Simas", image: "/s" },
  ];

  it("is stable per record id", () => {
    const id = "64e2e0000000000000000c01";
    const first = pickPinkPawCat(candidates, id);
    expect(pickPinkPawCat(candidates, id)).toBe(first);
    expect(first).toBe(candidates[fnv1a(id) % candidates.length]);
  });

  it("spreads ids across candidates", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickPinkPawCat(candidates, `64e2e00000000000000000${i.toString(16).padStart(2, "0")}`)!.name);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("fnv1a matches the reference value", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
  });
});
