import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * Sign-in on the web (Paw Legends): the game's account chip in the title's corner asks the host to sign in, the
 * Token Tails AuthSheet opens, the signed-in profile shows on the chip (name, and how the player signed in), and
 * Sign out from the chip's panel signs the page out again.
 *
 * Firebase is faked in the page (`window.__TT_E2E_AUTH__`, development and E2E builds only); every backend call is a
 * real request answered by the `backend` mock. The game is the committed client/public/pawlegends-game build
 * (pawlegends: `npm run build:client`), so a stale build fails here.
 */

const PLAYER = {
  _id: "64e2e0000000000000000a11",
  isGuest: false,
  name: "Pat Paws",
  onboarding: { state: "done" },
  cats: [],
  pawlegendsCatnip: { easy: 20 },
  pawlegendsMatches: { easy: 3 },
  pawlegendsFastestWin: { easy: 8123 },
};

function mockBackend(backend: BackendMock) {
  backend
    .on("GET", "/user/profile", { body: PLAYER })
    .on("GET", "/pawlegends/me", { body: { items: [], season: null } })
    .on("GET", "/pawlegends/champions", { body: { cats: [] } })
    .on("GET", /^\/pawlegends\/status/, { body: { store: false, email: false, termsVersion: null, skus: [] } })
    .on("GET", /^\/cat\/sale/, { body: { tokentails: [], "token-tails": [] } });
}

async function openGame(page: Page, backend: BackendMock) {
  mockBackend(backend);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = {};
  });
  await gotoAndSettle(page, "/pawlegends/play", 1500);
  const game = page.frameLocator('[data-testid="pawlegends-frame"]');
  await expect(game.locator(".pl-btn.big").first()).toBeVisible({ timeout: 60_000 });
  return game;
}

test.describe("Paw Legends sign-in on the web", () => {
  test.use({ allowUnmocked: true });

  test("sign in from the title chip, see the account, sign out @ci-desktop", async ({ page, backend }) => {
    test.setTimeout(120_000);
    const game = await openGame(page, backend);
    const chip = game.getByTestId("account-chip");
    await expect(chip).toHaveText("Sign in", { timeout: 30_000 });

    // the chip asks the host; the Token Tails sheet opens over the game
    await chip.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Firebase reports the account (the fake stands in for the Apple popup)
    await page.evaluate(() =>
      (window as unknown as { __ttE2EAuth: { signIn: (u: unknown) => void } }).__ttE2EAuth.signIn({ uid: "e2e-pat", providers: ["apple.com"] })
    );
    await page.keyboard.press("Escape").catch(() => undefined);
    await expect(chip).toHaveText("Pat Paws", { timeout: 30_000 });
    await expect(chip).toHaveAttribute("aria-label", /Signed in with Apple as Pat Paws/);

    // the panel: Sign out
    await chip.click();
    await expect(game.getByTestId("account-panel")).toBeVisible();
    await game.getByTestId("account-sign-out").click();
    await expect(chip).toHaveText("Sign in", { timeout: 30_000 });
  });

  test("a landscape phone shows the chip in the corner, on screen @ci-desktop", async ({ page, backend }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 844, height: 390 });
    const game = await openGame(page, backend);
    const chip = game.getByTestId("account-chip");
    await expect(chip).toBeVisible({ timeout: 30_000 });
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(844);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.height).toBeGreaterThanOrEqual(39.5);
  });
});
