/**
 * Share URL and UTM (bet #3, docs/plans/yourcat-v2.md §5.5).
 */
import { buildShareUrl, loadUtm, readUtm, storeUtm, UTM_STORAGE_KEY } from "@/components/yourcat/utm";

describe("share URL", () => {
  it("has the exact format", () => {
    expect(buildShareUrl("card", "story", "https://tokentails.com")).toBe(
      "https://tokentails.com/yourcat?utm_source=share&utm_medium=card&utm_campaign=yourcat&utm_content=story",
    );
    expect(buildShareUrl("card", "post", "https://tokentails.com")).toBe(
      "https://tokentails.com/yourcat?utm_source=share&utm_medium=card&utm_campaign=yourcat&utm_content=post",
    );
    expect(buildShareUrl("link", "link", "https://tokentails.com")).toBe(
      "https://tokentails.com/yourcat?utm_source=share&utm_medium=link&utm_campaign=yourcat&utm_content=link",
    );
  });

  it("uses the site origin by default and carries no ids", () => {
    const url = new URL(buildShareUrl("card", "story"));
    expect(url.origin).toBe("https://tokentails.com");
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(["utm_campaign", "utm_content", "utm_medium", "utm_source"]);
    expect(url.search).not.toMatch(/ref=|id=|user|[0-9a-f]{24}/i);
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
