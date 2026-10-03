import type { Page } from "@playwright/test";

import {
  API_ORIGIN,
  authHeaderViolations,
  expect,
  FIXED_NOW,
  gotoAndSettle,
  type RecordedCall,
  seedMathRandom,
  test,
} from "./fixtures";

// Smoke checks for the F1 harness: both entry points render at every viewport without an uncaught
// page error (the fixtures fail the test on `pageerror`), without an unmocked backend call, without
// a request to a production API host, and with third-party hosts (Stripe, analytics) aborted.

test.describe("smoke", () => {
  test("landing renders", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await expect(page).toHaveTitle(/Token Tails/);
    await expect(page.locator("body")).toBeVisible();
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });

  test("landing has no horizontal page scroll", async ({ page }) => {
    await gotoAndSettle(page, "/");
    // Entrance animations (and dev-server hot reloads) can widen the page for a moment, so the
    // check waits for the width to settle instead of sampling once. A real overflow never settles.
    await expect
      .poll(() => pageOverflow(page), { timeout: 10_000, intervals: [250, 500, 1000] })
      .toBeLessThanOrEqual(1);
    // Two more samples after it settled, so a value that only dipped once does not pass.
    for (let sample = 0; sample < 2; sample += 1) {
      await page.waitForTimeout(300);
      const overflow = await pageOverflow(page);
      expect(overflow, `page is ${overflow}px wider than the viewport; widest offenders:\n${await overflowOffenders(page)}`).toBeLessThanOrEqual(1);
    }
  });

  test("/game renders without a page error", async ({ page }) => {
    await gotoAndSettle(page, "/game", 3000);
    await expect(page.locator("#__next")).toBeAttached();
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });

  test("the fixtures pin the clock and seed Math.random", async ({ page, randomSeed }) => {
    // Registered after the fixture's seed script, so it sees the first seeded value.
    await page.addInitScript(() => {
      (window as unknown as { __firstRandom: number }).__firstRandom = Math.random();
    });
    await gotoAndSettle(page, "/", 0);
    const probe = await page.evaluate(() => ({
      now: Date.now(),
      first: (window as unknown as { __firstRandom: number }).__firstRandom,
    }));
    expect(probe.now).toBeGreaterThanOrEqual(FIXED_NOW.getTime());
    expect(probe.now).toBeLessThan(FIXED_NOW.getTime() + 5 * 60_000);
    expect(probe.first).toBe(expectedFirstRandom(randomSeed));
  });

  test("backend calls are mocked, never real", async ({ page, backend }) => {
    await gotoAndSettle(page, "/", 0);
    const result = await page.evaluate(async (origin) => {
      const response = await fetch(`${origin}/cat/sale`);
      return { status: response.status, keys: Object.keys(await response.json()).sort() };
    }, API_ORIGIN);
    expect(result.status).toBe(200);
    expect(result.keys).toEqual(["_meta", "rozine-pedute", "token-tails", "token-tails-2", "tokentails"]);
    expect(backend.requests().map((call) => call.path)).toContain("/cat/sale");
  });

  test("backend calls carry the lowercase accesstoken header", async ({ page, backend }) => {
    await gotoAndSettle(page, "/", 0);
    await page.evaluate(async (origin) => {
      await fetch(`${origin}/cat/sale`, { headers: { accesstoken: "fbtest-token" } });
    }, API_ORIGIN);
    const call = backend.requests().find((entry) => entry.path === "/cat/sale" && entry.headers["accesstoken"]);
    expect(call?.rawHeaderNames).toContain("accesstoken");
    expect(authHeaderViolations(backend.requests())).toEqual([]);
  });

  test("the network guard aborts third parties and allows the app's own hosts", async ({ page, network, baseURL }) => {
    await gotoAndSettle(page, "/", 0);
    expect(network.allows(`${baseURL}/game`)).toBe(true);
    expect(network.allows(`${API_ORIGIN}/cat/sale`)).toBe(true);
    expect(network.allows("https://fonts.gstatic.com/s/font.woff2")).toBe(true);
    expect(network.allows("https://tokentails.fra1.cdn.digitaloceanspaces.com/cat.png")).toBe(true);
    expect(network.allows("https://js.stripe.com/v3")).toBe(false);
    expect(network.allows("https://api.tokentails.com/cat/sale")).toBe(false);
    expect(network.blocked().every((entry) => !network.allows(entry.url))).toBe(true);
    expect(network.forbidden()).toEqual([]);
  });

  test("/game gets the inert Stripe.js stub instead of the real script", async ({ page, network }) => {
    await gotoAndSettle(page, "/game", 3000);
    expect(network.blocked().map((entry) => new URL(entry.url).hostname)).not.toContain("js.stripe.com");
    for (const url of network.stubbed()) {
      expect(new URL(url).hostname).toBe("js.stripe.com");
    }
  });
});

test.describe("auth header check", () => {
  const call = (headers: Record<string, string>, rawHeaderNames = Object.keys(headers)): RecordedCall => ({
    method: "GET",
    path: "/user/profile",
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])),
    rawHeaderNames,
    body: null,
    mocked: true,
  });

  test("flags every wrong auth header", () => {
    expect(authHeaderViolations([call({ accesstoken: "fbabc" })])).toEqual([]);
    expect(authHeaderViolations([call({})])).toEqual([]);
    expect(authHeaderViolations([call({ AccessToken: "fbabc" })])).toHaveLength(1);
    expect(authHeaderViolations([call({ authorization: "Bearer x" })])).toHaveLength(1);
    expect(authHeaderViolations([call({ accesstoken: "eyJhbGciOi" })])).toHaveLength(1);
  });
});

function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** The elements that stick out past the right edge, widest first, so a failure is diagnosable. */
function overflowOffenders(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = window.innerWidth + 1;
    const describe = (element: Element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    return Array.from(document.body.querySelectorAll("*"))
      .map((element) => ({ element, right: element.getBoundingClientRect().right }))
      .filter((entry) => entry.right > limit)
      .sort((a, b) => b.right - a.right)
      .slice(0, 8)
      .map((entry) => `  ${describe(entry.element)} right=${Math.round(entry.right)}`)
      .join("\n") || "  (none: the overflow comes from scroll width, not a visible box)";
  });
}

/** First value of the seeded generator, computed here the same way the init script does in the page. */
function expectedFirstRandom(seed: number): number {
  const original = Math.random;
  try {
    seedMathRandom(seed);
    return Math.random();
  } finally {
    Math.random = original;
  }
}
