/**
 * The founder's hidden rail previews (pages/preview/rail-a and rail-b, Nov 20): the same host as `/play`, with the
 * game loaded from its own base path. Removed with the previews.
 */
import { frameSrcOf, PAWLEGENDS_FRAME_SRC, pawlegendsFrameSrc, pawlegendsFrameSrcFor } from "@/components/pawlegends/flags";
import { isGamePagePath } from "@/components/pawlegends/routes";
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config
const nextConfig = require("../../next.config.js");

describe("rail previews", () => {
  it("loads the game from the preview's base; /play keeps the live build", () => {
    expect(frameSrcOf()).toBe(PAWLEGENDS_FRAME_SRC);
    expect(frameSrcOf("/preview-rail-a/")).toBe("/preview-rail-a/index.html?embed=1");
    expect(pawlegendsFrameSrc("?dare=9ix.0.0.1.c0", "/preview-rail-b/")).toBe("/preview-rail-b/index.html?embed=1&dare=9ix.0.0.1.c0");
    expect(pawlegendsFrameSrcFor("abc1234", "/preview-rail-a/")).toBe("/preview-rail-a/index.html?embed=1&v=abc1234");
    expect(pawlegendsFrameSrcFor("abc1234")).toBe("/pawlegends-game/index.html?embed=1&v=abc1234");
  });

  it("docks the consent bar on /play and the two previews only", () => {
    expect(isGamePagePath("/play")).toBe(true);
    expect(isGamePagePath("/preview/rail-a")).toBe(true);
    expect(isGamePagePath("/preview/rail-b")).toBe(true);
    expect(isGamePagePath("/preview/rail-c")).toBe(false);
    expect(isGamePagePath("/")).toBe(false);
  });

  it("sends noindex for the preview pages and builds, and caches each build under its own path", async () => {
    const headers: { source: string; headers: { key: string; value: string }[] }[] = await nextConfig.headers();
    const noindex = headers.filter((h) => h.headers.some((x) => x.key === "X-Robots-Tag" && x.value === "noindex, nofollow")).map((h) => h.source);
    expect(noindex).toEqual(expect.arrayContaining(["/preview/:path*", "/preview-rail-a/:path*", "/preview-rail-b/:path*"]));
    expect(noindex.some((s) => s.startsWith("/pawlegends-game") || s === "/play")).toBe(false);
    for (const dir of ["pawlegends-game", "preview-rail-a", "preview-rail-b"]) {
      expect(headers.map((h) => h.source)).toEqual(expect.arrayContaining([`/${dir}/build/:path*`, `/${dir}/index.html`, `/${dir}/version.json`]));
    }
  });
});
