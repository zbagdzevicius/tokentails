/**
 * Share URL and UTM (bet #3, docs/plans/yourcat-v2.md §5.5, docs/plans/yourcat-polish.md §8).
 */
import { buildShareUrl, loadUtm, readShareId, readUtm, storeUtm, UTM_STORAGE_KEY } from "@/components/yourcat/utm";

const SHARE = "foptpG3xHIZo";

describe("share URL", () => {
  it("has the exact format", () => {
    expect(buildShareUrl("card", "story", SHARE, "https://tokentails.com")).toBe(
      `https://tokentails.com/yourcat?cat=${SHARE}&utm_source=share&utm_medium=card&utm_campaign=yourcat&utm_content=story`,
    );
    expect(buildShareUrl("card", "post", SHARE, "https://tokentails.com")).toBe(
      `https://tokentails.com/yourcat?cat=${SHARE}&utm_source=share&utm_medium=card&utm_campaign=yourcat&utm_content=post`,
    );
    expect(buildShareUrl("link", "link", SHARE, "https://tokentails.com")).toBe(
      `https://tokentails.com/yourcat?cat=${SHARE}&utm_source=share&utm_medium=link&utm_campaign=yourcat&utm_content=link`,
    );
  });

  it("leaves the cat out when there is no share id or a malformed one", () => {
    const plain = "https://tokentails.com/yourcat?utm_source=share&utm_medium=card&utm_campaign=yourcat&utm_content=story";
    expect(buildShareUrl("card", "story", undefined, "https://tokentails.com")).toBe(plain);
    expect(buildShareUrl("card", "story", null, "https://tokentails.com")).toBe(plain);
    for (const bad of ["64e2e0000000000000000c01", "short", "abc&x=1abcde", `${SHARE}1`]) {
      expect(buildShareUrl("card", "story", bad, "https://tokentails.com")).toBe(plain);
    }
  });

  it("uses the site origin by default and carries only the random share id, never a record or user id", () => {
    const url = new URL(buildShareUrl("card", "story", SHARE));
    expect(url.origin).toBe("https://tokentails.com");
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(["cat", "utm_campaign", "utm_content", "utm_medium", "utm_source"]);
    expect(url.searchParams.get("cat")).toBe(SHARE);
    expect(url.search).not.toMatch(/ref=|id=|user|[0-9a-f]{24}/i);
    expect(Array.from(new URL(buildShareUrl("card", "story")).searchParams.keys())).not.toContain("cat");
  });
});

describe("incoming share id", () => {
  it("reads a well-formed cat parameter and drops anything else", () => {
    expect(readShareId(`?cat=${SHARE}&utm_source=share`)).toBe(SHARE);
    expect(readShareId(`cat=${SHARE}`)).toBe(SHARE);
    expect(readShareId("?cat=a-b_c-d_e-f_")).toBe("a-b_c-d_e-f_");
    for (const bad of ["", "?", "?cat=", "?cat=short", `?cat=${SHARE}1`, "?cat=64e2e0000000000000000c01", "?cat=abc%2Fdefghijk", "?cat=abc%20defghij"]) {
      expect(readShareId(bad)).toBeNull();
    }
  });

  it("round-trips with buildShareUrl", () => {
    expect(readShareId(new URL(buildShareUrl("link", "link", SHARE, "https://tokentails.com")).search)).toBe(SHARE);
  });
});

describe("incoming UTM", () => {
  it("keeps plain slugs and drops bad values", () => {
    expect(readUtm("?utm_source=share&utm_medium=card&utm_content=story&utm_campaign=x")).toEqual({
      utmSource: "share",
      utmMedium: "card",
      utmContent: "story",
    });
    expect(readUtm("?utm_source=Share%20Me&utm_medium=%3Cscript%3E&utm_content=" + "a".repeat(33))).toEqual({});
    expect(readUtm("?utm_source=tiktok_ad-1")).toEqual({ utmSource: "tiktok_ad-1" });
  });

  it("round-trips through sessionStorage and survives storage errors", () => {
    const store: Record<string, string> = {};
    const fake = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    };
    Object.defineProperty(globalThis, "sessionStorage", { value: fake, configurable: true });
    storeUtm({ utmSource: "share", utmMedium: "card" });
    expect(JSON.parse(store[UTM_STORAGE_KEY])).toEqual({ utmSource: "share", utmMedium: "card" });
    expect(loadUtm()).toEqual({ utmSource: "share", utmMedium: "card" });
    store[UTM_STORAGE_KEY] = JSON.stringify({ utmSource: "BAD VALUE", utmContent: "post" });
    expect(loadUtm()).toEqual({ utmContent: "post" });

    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
      configurable: true,
    });
    expect(() => storeUtm({ utmSource: "share" })).not.toThrow();
    expect(loadUtm()).toEqual({});
  });
});
