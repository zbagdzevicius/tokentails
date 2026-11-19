import { expect, gotoAndSettle, test } from "./fixtures";

/**
 * Party links (docs/plans/moba/DEEP-LINKS.md): `pawlegends.app/p/<code>` is what the lobby's QR and Share carry. A phone
 * with the app never loads it (Universal Links / App Links open the app); everyone else lands here and one tap opens
 * the web game in the party. The join itself against a relay is pawlegends/tests/e2e/mp/party-invite.spec.ts (the
 * committed game build has no relay for localhost); here: the page, the hand-off to the game frame, and the
 * association files.
 */
test.use({ allowUnmocked: true });

test.describe("/p/<code> party link", () => {
  test("one tap opens the web game with the party code @ci-desktop", async ({ page }) => {
    await gotoAndSettle(page, "/p/k7q-x2m");
    await expect(page.getByTestId("party-invite-code")).toHaveText("K7Q X2M");
    await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveAttribute("content", /app-argument=https:\/\/pawlegends\.app\/p\/K7QX2M/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId("party-invite-join").click();
    const frame = page.getByTestId("pawlegends-frame");
    await expect(frame).toHaveAttribute("src", /[?&]party=K7QX2M(&|$)/);
    await expect(page).toHaveURL(/\/play/);
  });

  test("a broken code says so and offers the player's own party", async ({ page }) => {
    await gotoAndSettle(page, "/p/K7QX0M");
    await expect(page.getByTestId("party-invite-bad")).toBeVisible();
    await page.getByTestId("party-invite-own").click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByTestId("pawlegends-frame")).toBeVisible();
  });

  test("apple-app-site-association is JSON with no redirect, at /.well-known/ and the root @ci-desktop", async ({ request }) => {
    for (const path of ["/.well-known/apple-app-site-association", "/apple-app-site-association"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/^application\/json/);
      const body = await res.json();
      expect(body.applinks.details[0].appIDs).toEqual(["BVLDTU9V83.com.tokentails.pawlegends"]);
    }
  });
});
