import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * `/` is the landing page and `/play` the game. Links that need the game (party invites
 * `?party=`, dares, Stripe returns, account emails, `?from=` from the picker and the home hub) are redirected there
 * with their query; marketing links stay on the landing.
 */
test.use({ allowUnmocked: true });

test.describe("/ landing", () => {
  test("renders the hero, the cat and dog tiles and no horizontal scroll @ci-desktop", async ({ page }) => {
    await gotoAndSettle(page, "/?utm_source=e2e");
    await expect(page).toHaveURL(/\/\?utm_source=e2e$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pawlegends" })).toBeVisible();
    // "Ten cats, ten dogs" in one grid since the 2026-11-12 landing (no Cats / Dogs switch any more)
    await expect(page.locator(".pll .grid .tile.cat")).toHaveCount(10);
    await expect(page.locator(".pll .grid .tile.dog")).toHaveCount(10);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the play button opens the game", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await page.locator(".pll .hero .btn.big").click();
    // The host reports `from` (pawlegends_open) and then drops it from the address bar.
    await expect(page).toHaveURL(/\/play/);
    await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
  });

  for (const [key, value] of [
    ["party", "K7QX2M"],
    ["from", "home_hub_pawlegends"],
    ["checkout", "cancel"],
  ]) {
    test(`?${key}= goes on to the game with its query`, async ({ page }) => {
      await gotoAndSettle(page, `/?${key}=${value}`);
      await expect(page).toHaveURL(new RegExp(`/play`));
      await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
    });
  }
});
