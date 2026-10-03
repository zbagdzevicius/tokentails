/**
 * Registry helpers behind Claim (plan F7.1, G11) and the paw Merkle check placeholder (F7.6).
 */
import { createHash } from "crypto";
import {
  allPublicFacts,
  factText,
  formatFactDate,
  isStale,
  parseFactDate,
  publicFact,
  publicSourceUrl,
  splitFigure,
  textHasDate,
} from "@/components/claims/facts";
import {
  normalizeHex,
  parsePawMemo,
  verifyMerkleProof,
} from "@/components/claims/merkle";
import { FACTS } from "@/lib/facts.generated";

describe("publicSourceUrl", () => {
  it("shows the public page for a check-only API mirror", () => {
    expect(publicSourceUrl("https://api.fxtwitter.com/tokentails")).toEqual({
      href: "https://x.com/tokentails",
      host: "x.com",
    });
  });
  it("keeps ordinary https sources and drops malformed or non-http ones", () => {
    expect(publicSourceUrl("https://example.org/a?b=1")?.host).toBe("example.org");
    expect(publicSourceUrl("not a url")).toBeNull();
    expect(publicSourceUrl("javascript:alert(1)")).toBeNull();
    expect(publicSourceUrl(null)).toBeNull();
  });
});

describe("registry helpers", () => {
  it("only public entries resolve", () => {
    expect(publicFact("F-011")?.id).toBe("F-011");
    expect(publicFact("F-024")).toBeNull(); // "800+", unverified (decision #29)
    expect(publicFact("F-023")).toBeNull(); // the Paris event, unsourced (decision #74)
    expect(publicFact("P-001")).toBeNull(); // "3 taps", retired (decision #75, task 7b)
    expect(allPublicFacts().length).toBe(Object.keys(FACTS).length);
  });

  it("fills placeholders and refuses to show an unfilled one", () => {
    const f = FACTS["L-players"];
    expect(factText(f, { n: 541953 })).toBe("541,953 players");
    expect(factText(f, {})).toBeNull();
    expect(factText(FACTS["C-005"], {}, true)).toBe("$1 of treats a day");
    expect(factText(FACTS["C-005"], {}, false)).toBe("1 USDC of treats a day");
  });

  it("parses partial dates as their last instant", () => {
    expect(parseFactDate("2026-04")?.toISOString()).toBe(
      "2026-04-30T23:59:59.000Z"
    );
    expect(parseFactDate("2026")?.toISOString()).toBe(
      "2026-12-31T23:59:59.000Z"
    );
    expect(parseFactDate("2026-09-27")?.toISOString()).toBe(
      "2026-09-27T23:59:59.000Z"
    );
    expect(parseFactDate(null)).toBeNull();
    expect(parseFactDate("soon")).toBeNull();
  });

  it("formats dates at their own precision", () => {
    expect(formatFactDate("2026-04")).toBe("Apr 2026");
    expect(formatFactDate("2026-09-27")).toBe("27 Sep 2026");
    expect(formatFactDate("2026-10-01T05:42:35.719Z")).toBe("1 Oct 2026");
  });

  it("stale rules", () => {
    const f = FACTS["F-001"]; // checked 2026-04, maxAgeDays 365
    expect(isStale(f, new Date("2027-04-29T00:00:00Z"))).toBe(false);
    expect(isStale(f, new Date("2027-05-02T00:00:00Z"))).toBe(true);
    expect(
      isStale(FACTS["L-countries"], new Date("2026-10-01T00:00:00Z"), null)
    ).toBe(true);
    expect(isStale(FACTS["F-004"], new Date("2040-01-01T00:00:00Z"))).toBe(
      false
    );
  });

  it("finds dates already in the words and splits figures", () => {
    expect(textHasDate("180K+ on X (Sep 2026)")).toBe(true);
    expect(
      textHasDate(
        "540K+ registered players, all time (Apr 2026, company-reported)"
      )
    ).toBe(true);
    expect(textHasDate("3 partner countries")).toBe(false);
    expect(splitFigure("180K+ on X (Sep 2026)")).toEqual({
      figure: "180K+",
      rest: "on X (Sep 2026)",
    });
    expect(splitFigure("Now: Stellar NFTs")).toEqual({
      figure: null,
      rest: "Now: Stellar NFTs",
    });
  });

  it("every surfaced public display dates itself or is live", () => {
    for (const f of allPublicFacts()) {
      if (f.status === "live" || f.id.startsWith("C-")) continue;
      expect([f.id, textHasDate(f.display) || f.status === "verified"]).toEqual(
        [f.id, true]
      );
    }
  });
});

describe("paw Merkle check (placeholder until task 4f)", () => {
  const h = (a: string, b: string) =>
    "0x" +
    createHash("sha256")
      .update(Buffer.from(a.slice(2) + b.slice(2), "hex"))
      .digest("hex");
  const leaf = (s: string) =>
    "0x" + createHash("sha256").update(s).digest("hex");

  it("verifies a sorted-pair proof and rejects a tampered one", async () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map(leaf);
    const sorted = (x: string, y: string) => (x <= y ? h(x, y) : h(y, x));
    const ab = sorted(a, b);
    const cd = sorted(c, d);
    const root = sorted(ab, cd);
    await expect(
      verifyMerkleProof({ leaf: c, proof: [d, ab], root, hashPair: h })
    ).resolves.toBe(true);
    await expect(
      verifyMerkleProof({ leaf: c, proof: [a, ab], root, hashPair: h })
    ).resolves.toBe(false);
    await expect(
      verifyMerkleProof({ leaf: "zz", proof: [], root, hashPair: h })
    ).resolves.toBe(false);
  });

  it("parses the full paw memo", () => {
    const root = "0x" + "ab".repeat(32);
    expect(parsePawMemo(`tt:paws:2026-10-01:${root}`)).toEqual({
      day: "2026-10-01",
      root,
    });
    expect(parsePawMemo("tt:paws:2026-10-01:0x12")).toBeNull();
    expect(normalizeHex("ABCD")).toBe("0xabcd");
  });
});

describe("factText with n = 1 (7b open item: '1 partner countries')", () => {
  const live = (display: string) => ({ ...FACTS["L-countries"], display }) as Parameters<typeof factText>[0];
  it("singularises the noun after {n}, with or without one modifier", () => {
    expect(factText(live("{n} partner countries"), { n: 1 })).toBe("1 partner country");
    expect(factText(live("{n} heists verified"), { n: 1 })).toBe("1 heist verified");
    expect(factText(live("{n} players"), { n: 1 })).toBe("1 player");
  });
  it("keeps plurals for other counts", () => {
    expect(factText(live("{n} partner countries"), { n: 2 })).toBe("2 partner countries");
    expect(factText(live("{n} players"), { n: 0 })).toBe("0 players");
    expect(factText(live("{n} players"), { n: 1200 })).toBe("1,200 players");
  });
});
