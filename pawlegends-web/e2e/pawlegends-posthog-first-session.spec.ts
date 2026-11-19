import { gunzipSync } from "node:zlib";
import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * First visit on pawlegends.app (gap 2 of the PostHog integration): a visitor the consent bar asks (a European time
 * zone) opens the landing and does not answer, then goes on to /play (a full page load, so nothing survives in memory).
 * Nothing reaches PostHog before the answer; Allow on the docked bar sends what waited, the landing's events too
 * (analytics/client.ts keeps the held queue in this tab's sessionStorage), to us.i.posthog.com only, with no query
 * string in any URL property and no GeoIP lookup.
 *
 * Needs a server run with NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN set (any fake `phc_` token: every PostHog request is
 * answered here, never forwarded); locally it skips without one, in CI (a fake token, ci.yml) it never skips.
 */
test.use({
  timezoneId: "Europe/Vilnius",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
});

type Row = { event: string; properties: Record<string, unknown> };

function rowsOf(req: Request): Row[] {
  const buf = req.postDataBuffer();
  if (!buf) return [];
  let text: string;
  try {
    text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
    if (text.startsWith("data=")) text = Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString("utf8");
    const body = JSON.parse(text) as unknown;
    const rows = Array.isArray(body) ? body : ((body as { batch?: unknown[] }).batch ?? [body]);
    return rows.filter((r): r is Row => !!r && typeof (r as Row).event === "string").map((r) => ({ event: r.event, properties: r.properties ?? {} }));
  } catch {
    return [];
  }
}

async function intercept(page: Page) {
  const seen: { url: string; rows: Row[] }[] = [];
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
    } catch {
      // keep the browser's own values
    }
  });
  await page.route(/https:\/\/[a-z0-9.-]*posthog\.com\//, async (route) => {
    const req = route.request();
    seen.push({ url: req.url(), rows: rowsOf(req) });
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1}' });
  });
  return seen;
}

test.describe("PostHog first session on pawlegends.app", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop-1440", "one desktop run is enough"));

  test("events held on the landing survive the page load to /play and leave only after Allow @ci-desktop", async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await intercept(page);
    await page.goto("/?utm_source=e2e");
    await page.mouse.wheel(0, 200);
    // the bar asks; no answer on the landing
    await expect(page.getByTestId("pawlegends-consent")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const held = await page.evaluate(() => sessionStorage.getItem("pawlegends.analytics-held.v1"));
    if (!process.env.CI) test.skip(!held, "the server has no NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    expect(JSON.parse(held ?? "[]").map((e: { name: string }) => e.name)).toContain("pawlegends_landing_view");

    // a full page load: memory is gone, the tab's sessionStorage is not
    await page.goto("/play");
    await expect(page.getByTestId("pawlegends-consent")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    expect(seen).toEqual([]);

    await page.getByTestId("pawlegends-consent-allow").click();
    await expect.poll(() => seen.flatMap((s) => s.rows).some((r) => r.event === "pawlegends_landing_view"), { timeout: 30_000 }).toBe(true);
    // sent: nothing is kept for the next page
    expect(await page.evaluate(() => sessionStorage.getItem("pawlegends.analytics-held.v1"))).toBeNull();

    const rows = seen.flatMap((s) => s.rows);
    for (const s of seen) expect(new URL(s.url).hostname).toMatch(/^us(-assets)?\.i\.posthog\.com$/);
    for (const r of rows) {
      if (r.event === "$snapshot") continue;
      expect(r.properties.$geoip_disable).toBe(true);
      for (const k of ["$current_url", "$referrer"]) if (typeof r.properties[k] === "string") expect(r.properties[k]).not.toMatch(/[?#]/);
    }
    expect(JSON.stringify(rows)).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9-]+\.[A-Z]{2,}/i);
  });

  test("No thanks on /play deletes what the landing held: nothing is ever sent @ci-desktop", async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await intercept(page);
    await page.goto("/");
    await page.mouse.wheel(0, 200);
    await expect(page.getByTestId("pawlegends-consent")).toBeVisible({ timeout: 20_000 });
    await page.goto("/play");
    await page.getByTestId("pawlegends-consent-deny").click({ timeout: 30_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("pawlegends.analytics-held.v1"))).toBeNull();
    await page.reload();
    await page.waitForTimeout(5_000);
    expect(seen).toEqual([]);
  });
});
