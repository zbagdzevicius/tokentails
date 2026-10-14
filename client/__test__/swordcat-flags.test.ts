/**
 * Pink Paw Knight (Swordcat) flags (Swordcat plan §5.2): all default off, truthy values only, the
 * same-origin build by default with a validated URL override, and the picker needs its flag and the
 * page flag.
 */
import {
  flagOn,
  swordcatEnabled,
  swordcatFrameSrc,
  swordcatOrigin,
  swordcatPickerEnabled,
  swordcatUrl,
  swordcatUrlOverride,
  SWORDCAT_DEFAULT_URL,
} from "@/components/swordcat/flags";

describe("swordcat flags", () => {
  it("are off by default (the test env sets none)", () => {
    expect(process.env.NEXT_PUBLIC_SWORDCAT).toBeUndefined();
    expect(swordcatEnabled()).toBe(false);
    expect(swordcatUrlOverride()).toBeNull();
    expect(swordcatUrl()).toBe(SWORDCAT_DEFAULT_URL);
    expect(SWORDCAT_DEFAULT_URL).toBe("/swordcat-game/index.html");
    expect(swordcatPickerEnabled()).toBe(false);
    expect(swordcatEnabled(undefined)).toBe(false);
    expect(swordcatEnabled("")).toBe(false);
  });

  it("treats only 1, true, yes and on as on", () => {
    for (const value of ["1", "true", "TRUE", "yes", "On", " on "]) expect(flagOn(value)).toBe(true);
    for (const value of ["0", "false", "off", "no", "2", "enabled", "truthy"]) expect(flagOn(value)).toBe(false);
    expect(swordcatEnabled("yes")).toBe(true);
  });

  it("accepts https URLs, http://localhost and same-origin paths only as an override, else the same-origin build", () => {
    expect(swordcatUrlOverride("https://swordcat.tokentails.com/")).toBe("https://swordcat.tokentails.com/");
    expect(swordcatUrlOverride("https://example.com/game/?a=1")).toBe("https://example.com/game/?a=1");
    expect(swordcatUrlOverride("http://localhost:5175/")).toBe("http://localhost:5175/");
    expect(swordcatUrlOverride("http://127.0.0.1:5175/")).toBe("http://127.0.0.1:5175/");
    expect(swordcatUrlOverride("/swordcat-game/")).toBe("/swordcat-game/");
    expect(swordcatUrlOverride(" /swordcat-game/ ")).toBe("/swordcat-game/");
    for (const bad of [
      "http://swordcat.tokentails.com/",
      "//evil.example/",
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://example.com/",
      "swordcat-game/",
      "https://user:pass@example.com/",
      "/a b",
      "/\\evil.example",
      "",
    ]) {
      expect(swordcatUrlOverride(bad)).toBeNull();
      expect(swordcatUrl(bad)).toBe(SWORDCAT_DEFAULT_URL);
    }
  });

  it("shows the picker card only with the picker flag and the page flag (no URL needed)", () => {
    expect(swordcatPickerEnabled("1", "1")).toBe(true);
    expect(swordcatPickerEnabled(undefined, "1")).toBe(false);
    expect(swordcatPickerEnabled("1", undefined)).toBe(false);
    expect(swordcatPickerEnabled("0", "1")).toBe(false);
  });

  it("adds embed=1 to the frame URL, before any hash", () => {
    expect(swordcatFrameSrc("https://g.example/")).toBe("https://g.example/?embed=1");
    expect(swordcatFrameSrc("https://g.example/?lang=en")).toBe("https://g.example/?lang=en&embed=1");
    expect(swordcatFrameSrc("/swordcat-game/#x")).toBe("/swordcat-game/?embed=1#x");
  });

  it("resolves the game origin against the page", () => {
    expect(swordcatOrigin("https://g.example/path/", "https://tokentails.com/swordcat")).toBe("https://g.example");
    expect(swordcatOrigin("/swordcat-game/", "https://tokentails.com/swordcat")).toBe("https://tokentails.com");
    expect(swordcatOrigin("http://localhost:5175/", "http://localhost:3000/")).toBe("http://localhost:5175");
  });
});
