/**
 * pawlegends.app routes (next.config.js): www goes to the apex, game links go on to /play, and the old tokentails.com
 * paths (`/pawlegends`, `/pawlegends/<page>`) keep working for links already out there, older game builds (the store's
 * `${origin}/pawlegends/terms`) and the backend's Stripe returns and account emails (`/pawlegends?checkout=...`).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require("../next.config.js");

type Rule = { source: string; has?: { type: string; key?: string; value?: string }[]; destination: string; permanent: boolean };

describe("next.config.js", () => {
  let rules: Rule[] = [];
  beforeAll(async () => {
    rules = await config.redirects();
  });

  it("sends www to the apex, keeping the path, except the app association files (no redirect allowed)", () => {
    expect(rules[0]).toEqual({
      source: "/:path((?!\\.well-known/|apple-app-site-association).*)",
      has: [{ type: "host", value: "www.pawlegends.app" }],
      destination: "https://pawlegends.app/:path",
      permanent: true,
    });
    const re = new RegExp(`^/${"((?!\\.well-known/|apple-app-site-association).*)"}$`);
    expect(re.test("/play")).toBe(true);
    expect(re.test("/p/K7QX2M")).toBe(true);
    expect(re.test("/.well-known/apple-app-site-association")).toBe(false);
    expect(re.test("/.well-known/assetlinks.json")).toBe(false);
    expect(re.test("/apple-app-site-association")).toBe(false);
  });

  it("serves the app association files as JSON (DEEP-LINKS.md)", async () => {
    const headers: { source: string; headers: { key: string; value: string }[] }[] = await config.headers();
    for (const source of ["/.well-known/apple-app-site-association", "/apple-app-site-association", "/.well-known/assetlinks.json"])
      expect(headers.find((h) => h.source === source)?.headers).toContainEqual({ key: "Content-Type", value: "application/json" });
  });

  it("never redirects /p/<code> (the app claims it; a redirect would break Universal Links)", () => {
    for (const r of rules) expect(/^\/p(\/|$)/.test(r.source)).toBe(false);
  });

  it("moves the old /pawlegends paths to the new ones for good", () => {
    expect(rules).toContainEqual({ source: "/pawlegends", destination: "/", permanent: true });
    expect(rules).toContainEqual({ source: "/pawlegends/:page(play|privacy|terms|account|support)", destination: "/:page", permanent: true });
  });

  it("sends an old /pawlegends game link straight to /play, before the landing redirect", () => {
    const toPlay = rules.findIndex((r) => r.source === "/pawlegends" && r.has?.[0]?.key === "checkout");
    const toLanding = rules.findIndex((r) => r.source === "/pawlegends" && !r.has);
    expect(rules[toPlay].destination).toBe("/play");
    expect(toPlay).toBeLessThan(toLanding);
  });

  it("caches the game's hashed build for good and revalidates its index.html; marks every response", async () => {
    const headers: { source: string; headers: { key: string; value: string }[] }[] = await config.headers();
    const of = (source: string) => headers.find((h) => h.source === source)?.headers;
    expect(of("/pawlegends-game/build/:path*")).toEqual([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
    expect(of("/pawlegends-game/index.html")).toContainEqual({ key: "Cache-Control", value: "public, max-age=0, must-revalidate" });
    // force update: open tabs compare their build with version.json, which revalidates like index.html
    expect(of("/pawlegends-game/version.json")).toEqual(of("/pawlegends-game/index.html"));
    expect(of("/:path*")).toEqual([{ key: "x-pawlegends-web", value: "1" }]);
  });
});
