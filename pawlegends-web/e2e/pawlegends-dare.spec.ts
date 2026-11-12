import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * Dare links (launch finding PUB-03). Inside the host the game shares
 * `/?dare=…` (the host page), and the game reads the dare from its own URL, so the host
 * must forward it to the iframe. The game here is the committed pawlegends-web/public/pawlegends-game build.
 *
 * The code is `encodeDare({ seed: 12345, hero: HERO_IDS[0], trick: "pounce", difficulty: "normal", seconds: 432 })`.
 */
const DARE = "9ix.0.0.1.c0";

test.use({ allowUnmocked: true });

test.describe("dare links (PUB-03)", () => {
  test("a dare link opens the dared match on the title screen @ci-desktop", async ({ page }) => {
    await gotoAndSettle(page, `/?dare=${DARE}&from=x`);
    // `/` is the landing: a dare link goes on to the game page with its query (next.config.js).
    await expect(page).toHaveURL(/\/play\?/);
    const frameEl = page.getByTestId("pawlegends-frame");
    await expect(frameEl).toHaveAttribute("src", `/pawlegends-game/index.html?embed=1&dare=${DARE}`);
    const game = page.frameLocator('[data-testid="pawlegends-frame"]');
    // the title shows the dare line next to the dare button (its markup changed with the lobby: match the text)
    await expect(game.locator("body")).toContainText("Beat my 7:12 vs Normal bots", { timeout: 60_000 });
    await expect(game.getByRole("button", { name: /dare/i }).first()).toBeVisible();
  });

  test("a malformed dare is dropped and the plain title shows", async ({ page }) => {
    await gotoAndSettle(page, `/?dare=${encodeURIComponent('"><b>x')}`);
    await expect(page.getByTestId("pawlegends-frame")).toHaveAttribute("src", "/pawlegends-game/index.html?embed=1");
    const game = page.frameLocator('[data-testid="pawlegends-frame"]');
    await expect(game.locator(".pl-btn.big").first()).toBeVisible({ timeout: 60_000 });
    await expect(game.locator(".dare-line")).toHaveCount(0);
  });
});

test.describe("old tokentails.com paths (pawlegends-web next.config.js)", () => {
  test("a /pawlegends dare link still reaches the game, and /pawlegends/terms the terms", async ({ page }) => {
    await gotoAndSettle(page, `/pawlegends?dare=${DARE}&from=x`);
    await expect(page).toHaveURL(/\/play\?/);
    await gotoAndSettle(page, "/pawlegends/terms");
    await expect(page).toHaveURL(/\/terms$/);
  });
});
