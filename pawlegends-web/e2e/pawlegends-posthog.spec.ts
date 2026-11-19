import { gunzipSync } from "node:zlib";
import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * pawlegends.app on the one Token Tails PostHog project (US Cloud). Every PostHog request is intercepted (answered 200,
 * never forwarded). In a European time zone the consent bar asks:
 *
 * - No thanks: nothing reaches any PostHog host, through the landing and a first match.
 * - Allow: the landing's events and the game's relayed match events go to us.i.posthog.com only, and carry one
 *   distinct_id (the game frame relays over the bridge, the host sends; no cookie of its own).
 *
 * Needs a server built or run with NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN set (pawlegends-web/.env.local, or any fake
 * `phc_` token: every request is answered here); locally the Allow test skips without one, in CI it never skips. The game is the committed public/pawlegends-game build; a guest's first match needs no backend.
 */
test.use({
  timezoneId: "Europe/Vilnius",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
});

interface Captured {
  url: string;
  events: { event: string; distinct_id: string | null; properties: Record<string, unknown> }[];
}

/** The events of one PostHog request body (plain JSON, `data=` base64 or gzip-js). */
function eventsOf(req: Request): Captured["events"] {
  const buf = req.postDataBuffer();
  if (!buf) return [];
  let text: string;
  try {
    text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  } catch {
    return [];
  }
  if (text.startsWith("data=")) {
    try {
      text = Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString("utf8");
    } catch {
      return [];
    }
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = Array.isArray(body) ? body : (body as { batch?: unknown[] }).batch ?? [body];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { event?: unknown }).event === "string")
    .map((r) => {
      const properties = (r.properties ?? {}) as Record<string, unknown>;
      const id = (properties.distinct_id ?? r.distinct_id ?? null) as string | null;
      return { event: r.event as string, distinct_id: id, properties };
    });
}

async function interceptPostHog(page: Page): Promise<Captured[]> {
  const seen: Captured[] = [];
  // posthog-js drops events from automated browsers (navigator.webdriver, a HeadlessChrome user agent or brand): this
  // page passes for a person's Chrome so the capture path runs end to end
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
    seen.push({ url: req.url(), events: eventsOf(req) });
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1}' });
  });
  return seen;
}

async function playFirstMatch(page: Page) {
  const game = page.frameLocator('[data-testid="pawlegends-frame"]');
  await game.locator('[data-testid="home-play"]').click({ timeout: 90_000 });
  await page.waitForFunction(
    () => {
      const f = document.querySelector<HTMLIFrameElement>('[data-testid="pawlegends-frame"]');
      try {
        return f?.contentDocument?.documentElement?.dataset.match === "live";
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 }
  );
}

test.describe("PostHog on pawlegends.app", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop-1440", "one desktop run is enough"));

  test("No thanks: nothing reaches PostHog through the landing and a first match @ci-desktop", async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await interceptPostHog(page);
    await page.goto("/");
    // the bar waits for the intro or a first gesture
    await page.mouse.wheel(0, 200);
    await page.getByTestId("pawlegends-consent-deny").click({ timeout: 20_000 });
    await page.goto("/play");
    await playFirstMatch(page);
    await page.waitForTimeout(6_000);
    expect(seen).toEqual([]);
  });

  test("Allow: landing and game events go to us.i.posthog.com under one distinct_id @ci-desktop", async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await interceptPostHog(page);
    await page.goto("/");
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(1_000);
    // nothing before the answer
    expect(seen).toEqual([]);
    await page.getByTestId("pawlegends-consent-allow").click({ timeout: 20_000 });
    // a local server built without a token sends nothing: skip there. CI builds with a fake token (ci.yml), so it
    // never skips and a silent PostHog fails the test.
    if (!process.env.CI) {
      await expect.poll(() => seen.length, { timeout: 15_000 }).toBeGreaterThan(0).catch(() => undefined);
      test.skip(seen.length === 0, "the server has no NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    }
    await expect
      .poll(() => seen.flatMap((s) => s.events).some((e) => e.event === "pawlegends_landing_view"), { timeout: 30_000 })
      .toBe(true);

    await page.goto("/play");
    await playFirstMatch(page);
    await expect.poll(() => seen.flatMap((s) => s.events).some((e) => e.event === "match_start"), { timeout: 45_000 }).toBe(true);

    // events go to the ingestion host; the project's remote config (replay on or off, surveys) is a GET from its
    // assets host (analytics/index.ts: no external script, the JSON only)
    for (const s of seen) expect(new URL(s.url).hostname).toBe(s.events.length ? "us.i.posthog.com" : new URL(s.url).hostname);
    for (const s of seen) expect(new URL(s.url).hostname).toMatch(/^us(-assets)?\.i\.posthog\.com$/);
    const events = seen.flatMap((s) => s.events);
    const landing = events.find((e) => e.event === "pawlegends_landing_view")!;
    const start = events.find((e) => e.event === "match_start")!;
    expect(landing.distinct_id).toBeTruthy();
    expect(start.distinct_id).toBe(landing.distinct_id);
    // relayed from the frame: the game's own props plus `embed` and `human`
    expect(start.properties.embed).toBe(true);
    expect(typeof start.properties.human).toBe("boolean");
    expect(start.properties.mode).toBeTruthy();
    // never an email in any property
    expect(JSON.stringify(events)).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9-]+\.[A-Z]{2,}/i);
  });
});
