import AxeBuilder from "@axe-core/playwright";
import { expect, gotoAndSettle, test } from "./fixtures";

// Plan G11 / F7.6: every claim the landing cites is listed on /impact; the ProofDrawer is an
// accessible bottom sheet (axe, Esc, focus return); /proof redirects to /impact on web.

test.describe("impact", () => {
  test("every data-claim id on / appears on /impact", async ({ page }) => {
    await gotoAndSettle(page, "/");
    const ids = await page.$$eval("[data-claim]", (els) =>
      Array.from(
        new Set(els.map((el) => el.getAttribute("data-claim") || ""))
      ).filter(Boolean)
    );
    expect(ids.length, "the landing cites at least one claim").toBeGreaterThan(
      0
    );

    await gotoAndSettle(page, "/impact");
    const listed = await page.$$eval("[data-claim-row], [data-claim]", (els) =>
      els.map(
        (el) =>
          el.getAttribute("data-claim-row") ||
          el.getAttribute("data-claim") ||
          ""
      )
    );
    const missing = ids.filter((id) => !listed.includes(id));
    expect(missing, "claims on / without a row on /impact").toEqual([]);
  });

  test("the proof drawer opens, passes axe, closes on Escape and returns focus", async ({
    page,
  }) => {
    await gotoAndSettle(page, "/");
    const claim = page.locator('button[data-claim="F-011"]');
    await claim.scrollIntoViewIfNeeded();
    await claim.click();
    const dialog = page.getByRole("dialog", { name: "About this number" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("180K+ on X (Sep 2026)");
    await expect(dialog.locator('a[href="/impact#F-011"]')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(claim).toBeFocused();
  });

  test("/impact passes axe and has no horizontal scroll", async ({ page }) => {
    await gotoAndSettle(page, "/impact");
    await expect(
      page.getByRole("heading", { level: 1, name: "Impact" })
    ).toBeVisible();
    await expect(page.locator('[data-testid="claim-registry"]')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("/proof redirects to /impact", async ({ page }) => {
    await page.goto("/proof", { waitUntil: "load" });
    expect(new URL(page.url()).pathname).toBe("/impact");
  });
});
