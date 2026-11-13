import { expect, test } from "@playwright/test";

/**
 * gaps.md F1 (growth-web): the analytics consent bar covered the ability buttons of a fresh guest's first match. It now
 * waits while the game frame runs a match and shows on Home (a one-line strip at the top on a phone). Checked at the
 * landscape phone and the desktop viewport: during the match no consent box overlaps any HUD box.
 *
 * A European time zone, so the bar asks. The game is the committed pawlegends-web/public/pawlegends-game build. The plain
 * Playwright test, not ./fixtures: the fixed page clock there holds the match's loading timers, and a guest's first match
 * needs no backend (its save is queued on the device when the API does not answer).
 */
test.use({ timezoneId: "Europe/Vilnius" });

test.describe("the consent bar and the first match", () => {
  test.beforeEach(({}, info) => test.skip(!["landscape-844", "desktop-1440"].includes(info.project.name), "the phone and desktop match views"));

  test("shows on Home, never over the match HUD @ci-desktop", async ({ page }, info) => {
    test.setTimeout(150_000);
    await page.goto("/play");
    const game = page.frameLocator('[data-testid="pawlegends-frame"]');
    const play = game.locator('[data-testid="home-play"]');
    await play.waitFor({ timeout: 90_000 });
    const bar = page.getByTestId("pawlegends-consent");
    await expect(bar).toBeVisible();
    if (info.project.name === "landscape-844") {
      // a phone: a strip at the top, clear of PLAY and the bottom bar
      await expect(bar).toHaveAttribute("data-compact", "1");
      const box = (await bar.boundingBox())!;
      expect(box.y + box.height).toBeLessThan(80);
    }

    await play.click();
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
    await expect(bar).toHaveCount(0);
    // the HUD is there and nothing of the page sits over it
    const frame = page.frames().find((f) => f.url().includes("/pawlegends-game/"))!;
    const hud = await frame.evaluate(() =>
      [...document.querySelectorAll(".pl-match button")]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))
    );
    expect(hud.length).toBeGreaterThan(3);
    const fixed = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"], [data-testid="pawlegends-consent"]')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))
    );
    const overlaps = fixed.filter((b) => hud.some((r) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y));
    expect(overlaps).toEqual([]);
  });
});
