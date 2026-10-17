import {
  BADCAT_AUTH_CHANNEL,
  isAllowedGameOrigin,
  isAuthRequest,
  safeReturnUrl,
  tokenMessage,
} from "@/lib/badcatBridge";

const SELF = "https://tokentails.com";

describe("Bad Cat Daily token bridge (lib/badcatBridge.ts)", () => {
  it("answers only this site, tokentails.com hosts and, in development, the game's Vite ports", () => {
    expect(isAllowedGameOrigin(SELF, SELF, false)).toBe(true);
    expect(isAllowedGameOrigin("https://www.tokentails.com", SELF, false)).toBe(true);
    expect(isAllowedGameOrigin("https://evil.example", SELF, false)).toBe(false);
    expect(isAllowedGameOrigin("https://tokentails.com.evil.example", SELF, false)).toBe(false);
    expect(isAllowedGameOrigin("http://tokentails.com", SELF, false)).toBe(false);
    expect(isAllowedGameOrigin("http://localhost:5174", SELF, false)).toBe(false);
    expect(isAllowedGameOrigin("http://localhost:5174", "http://localhost:3000", true)).toBe(true);
    expect(isAllowedGameOrigin("http://localhost:3005", "http://localhost:3000", true)).toBe(false);
    expect(isAllowedGameOrigin(null, SELF, false)).toBe(false);
  });

  it("sends the player back only to a /badcat page", () => {
    expect(safeReturnUrl("https://tokentails.com/badcat/d/3?g=x", SELF, false)).toBe("https://tokentails.com/badcat/d/3?g=x");
    expect(safeReturnUrl("/badcat/settings", SELF, false)).toBe("https://tokentails.com/badcat/settings");
    expect(safeReturnUrl("https://evil.example/badcat", SELF, false)).toBe("https://tokentails.com/badcat");
    expect(safeReturnUrl("https://tokentails.com/cats", SELF, false)).toBe("https://tokentails.com/badcat");
    expect(safeReturnUrl("javascript:alert(1)", SELF, false)).toBe("https://tokentails.com/badcat");
    expect(safeReturnUrl("//evil.example/badcat", SELF, false)).toBe("https://tokentails.com/badcat");
    expect(safeReturnUrl("http://localhost:5174/?d=1", "http://localhost:3000", true)).toBe("http://localhost:5174/?d=1");
  });

  it("checks requests and prefixes tokens with fb", () => {
    expect(isAuthRequest({ channel: BADCAT_AUTH_CHANNEL, v: 1, type: "getToken", id: 3 })).toBe(true);
    expect(isAuthRequest({ channel: BADCAT_AUTH_CHANNEL, v: 1, type: "getToken" })).toBe(false);
    expect(isAuthRequest({ channel: "other", v: 1, type: "hello" })).toBe(false);
    expect(tokenMessage(1, "abc")).toMatchObject({ type: "token", id: 1, token: "fbabc" });
    expect(tokenMessage(1, null)).toMatchObject({ token: null });
  });
});
