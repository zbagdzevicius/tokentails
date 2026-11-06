import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * `/pawlegends` is the landing page and `/pawlegends/play` the game. Links that need the game (party invites
 * `?party=`, dares, Stripe returns, account emails, `?from=` from the picker and the home hub) are redirected there
 * with their query; marketing links stay on the landing.
 */
test.use({ allowUnmocked: true });

test.describe("/pawlegends landing", () => {
  test("renders the hero, the CATS / DOGS switch and no horizontal scroll @ci-desktop", async ({ page }) => {
    await gotoAndSettle(page, "/pawlegends?utm_source=e2e");
    await expect(page).toHaveURL(/\/pawlegends\?utm_source=e2e$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pawlegends" })).toBeVisible();
    await expect(page.locator(".pll .grid .tile.cat:visible")).toHaveCount(10);
    await page.getByRole("button", { name: /Dogs/ }).click();
    await expect(page.locator(".pll .grid .tile.dog:visible")).toHaveCount(7);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the play button opens the game", async ({ page }) => {
    await gotoAndSettle(page, "/pawlegends");
    await page.locator(".pll .hero .btn.big").click();
    // The host reports `from` (pawlegends_open) and then drops it from the address bar.
    await expect(page).toHaveURL(/\/pawlegends\/play/);
    await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
  });

  for (const [key, value] of [
    ["party", "K7QX2M"],
    ["from", "home_hub_pawlegends"],
    ["checkout", "cancel"],
  ]) {
    test(`?${key}= goes on to the game with its query`, async ({ page }) => {
      await gotoAndSettle(page, `/pawlegends?${key}=${value}`);
      await expect(page).toHaveURL(new RegExp(`/pawlegends/play`));
      await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
    });
  }
});
