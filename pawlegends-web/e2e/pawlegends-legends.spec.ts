import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * `/legends` is the Pawlegends landing A/B arm B (the scroll-lane-map landing; `/` is arm A). Its play links
 * carry the arm (`lv=B`) to the game, which reports it on `pawlegends_open` and drops it from the address bar; it
 * shares as itself (og:url `/legends`), and links that need the game skip it like they skip `/`.
 */
test.use({ allowUnmocked: true });

test.describe("/legends landing (A/B arm B)", () => {
  test("renders the lane page, the full roster and no horizontal scroll @ci-desktop", async ({ page }) => {
    await gotoAndSettle(page, "/legends?utm_source=e2e");
    await expect(page).toHaveURL(/\/legends\?utm_source=e2e$/);
    const root = page.getByTestId("legends-landing");
    await expect(root.getByRole("heading", { level: 1, name: "Pawlegends" })).toBeVisible();
    const tiles = await root.locator("#grid .slot").count();
    expect(tiles).toBeGreaterThan(0);
    await expect(root.locator(".chip").first()).toContainText(`All ${tiles}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/legends$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("every play link carries lv=B; the game opens and drops from and lv from the address bar", async ({ page }) => {
    await gotoAndSettle(page, "/legends");
    const links = page.getByTestId("legends-landing").locator("a[data-cta]");
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^\/play\?from=legends_[a-z]+&lv=B$/);
    await page.goto(hrefs[0]);
    await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
    await expect(page).toHaveURL(/\/play$/);
  });

  test("?party= goes on to the game with its query", async ({ page }) => {
    await gotoAndSettle(page, "/legends?party=K7QX2M");
    await expect(page).toHaveURL(/\/play/);
    await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
  });
});
