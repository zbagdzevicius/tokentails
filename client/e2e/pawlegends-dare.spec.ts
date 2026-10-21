import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * Dare links on tokentails.com (launch finding PUB-03). Inside the host the game shares
 * `/pawlegends?dare=…` (the host page), and the game reads the dare from its own URL, so the host
 * must forward it to the iframe. The game here is the committed client/public/pawlegends-game build.
 *
 * The code is `encodeDare({ seed: 12345, hero: HERO_IDS[0], trick: "pounce", difficulty: "normal", seconds: 432 })`.
 */
const DARE = "9ix.0.0.1.c0";

test.use({ allowUnmocked: true });

test.describe("/pawlegends dare links (PUB-03)", () => {
  test("a dare link opens the dared match on the title screen @ci-desktop", async ({ page }) => {
    await gotoAndSettle(page, `/pawlegends?dare=${DARE}&from=x`);
    const frameEl = page.getByTestId("pawlegends-frame");
    await expect(frameEl).toHaveAttribute("src", `/pawlegends-game/index.html?embed=1&dare=${DARE}`);
    const game = page.frameLocator('[data-testid="pawlegends-frame"]');
    await expect(game.locator(".dare-line")).toContainText("Beat my 7:12 vs Normal bots", { timeout: 60_000 });
    await expect(game.getByRole("button", { name: "Accept the dare" })).toBeVisible();
  });

  test("a malformed dare is dropped and the plain title shows", async ({ page }) => {
    await gotoAndSettle(page, `/pawlegends?dare=${encodeURIComponent('"><b>x')}`);
    await expect(page.getByTestId("pawlegends-frame")).toHaveAttribute("src", "/pawlegends-game/index.html?embed=1");
    const game = page.frameLocator('[data-testid="pawlegends-frame"]');
    await expect(game.locator(".pl-btn.big").first()).toBeVisible({ timeout: 60_000 });
    await expect(game.locator(".dare-line")).toHaveCount(0);
  });
});
