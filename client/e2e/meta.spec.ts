import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * Served meta (plan G14 "Icons and meta"): runs scripts/check-meta.mjs against the server under
 * test, then checks in the browser that the head keeps one icon family and the night theme-color
 * after hydration and a client-side render, and that /game's canonical drops `?ref=`.
 */

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, "../scripts/check-meta.mjs");

test.describe("meta and icons", () => {
  test.use({ allowUnmocked: true });

  test("check-meta passes against the running server", async ({ baseURL }, info) => {
    test.skip(info.project.name !== "desktop-1440", "server-side check, once per run");
    test.setTimeout(240_000);
    let stdout = "";
    try {
      ({ stdout } = await run(process.execPath, [SCRIPT, "--base", baseURL || "http://localhost:3001", "--json"], {
        timeout: 220_000,
      }));
    } catch (error) {
      stdout = (error as { stdout?: string }).stdout || "";
    }
    const report = JSON.parse(stdout) as { ok: boolean; results: { target: string; errors: string[] }[] };
    expect(report.results.filter((r) => r.errors.length)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  for (const route of ["/", "/game?ref=abc123", "/heist", "/impact"]) {
    test(`one icon family and night theme-color in the live head: ${route}`, async ({ page }) => {
      await gotoAndSettle(page, route, 2000);
      const head = await page.evaluate(() => ({
        icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(
          (l) => `${l.getAttribute("rel")} ${l.getAttribute("href")}`,
        ),
        manifests: document.querySelectorAll('link[rel="manifest"]').length,
        themes: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")),
        canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute("href")),
      }));
      expect(head.icons).toEqual([
        "icon /favicon.ico",
        "icon /icons/icon-32.png",
        "icon /icons/icon-192.png",
        "apple-touch-icon /icons/apple-touch-icon.png",
      ]);
      expect(head.manifests).toBe(1);
      expect(head.themes).toEqual(["#0b0820"]);
      expect(head.canonical).toHaveLength(1);
      expect(head.canonical[0]).not.toContain("?");
      expect(new URL(head.canonical[0]!).pathname).toBe(route.split("?")[0]);
    });
  }

  test("the manifest and its icons load", async ({ page, request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.start_url).toBe("/game");
    for (const icon of manifest.icons) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()["content-type"], icon.src).toContain("image/png");
    }
    void page;
  });
});
