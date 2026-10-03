import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * The AuthSheet (plan G9 acceptance): every state passes axe at 320, 375, 768 and 1440 px, with no
 * horizontal scroll and every control at least 44 px; Google and Apple are hidden in a social
 * app's browser. States are opened through the E2E hook (`window.__ttAuthSheet.show`), which
 * exists only when the page was opened with the E2E auth flag.
 *
 * Set AUTH_SHEET_SHOTS=<dir> to also save a screenshot of every state.
 */

const WIDTHS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const STATES: Array<{ id: string; view: Record<string, unknown>; reason?: string }> = [
  { id: "choose", view: { name: "choose" } },
  { id: "choose-claim", view: { name: "choose" }, reason: "claim-rewards" },
  { id: "email-sign-in", view: { name: "email", tab: "sign-in" } },
  { id: "email-create", view: { name: "email", tab: "create" } },
  { id: "email-notice", view: { name: "email", tab: "sign-in", email: "player@e2e.invalid", notice: "Check your inbox for the reset link." } },
  { id: "verify-email", view: { name: "verify-email", email: "player@e2e.invalid" } },
  { id: "verify-email-sent", view: { name: "verify-email", email: "player@e2e.invalid", justSent: true } },
  { id: "reset", view: { name: "reset", email: "player@e2e.invalid" } },
  { id: "link-account", view: { name: "link-account", provider: "google", email: "player@e2e.invalid" } },
  { id: "linking", view: { name: "linking", label: "Saving your cat…" } },
  { id: "busy", view: { name: "busy", label: "Waiting for Google…" } },
  { id: "profile-error", view: { name: "profile-error" } },
  { id: "profile-error-timeout", view: { name: "profile-error", timeout: true } },
  { id: "conflict", view: { name: "conflict" } },
  { id: "merged", view: { name: "merged", gamesMoved: 3, tailsCredited: 120 } },
  { id: "merged-note", view: { name: "merged", gamesMoved: 0, tailsCredited: 0, note: "You're signed in, but we couldn't move your guest progress just now." } },
  { id: "fallback", view: { name: "fallback" } },
];

const GUEST = {
  isGuest: true,
  transient: true,
  name: "Guest",
  // "done" so the sheet is the only dialog; Meet your cat (pending) has its own spec, e2e/meet-your-cat.spec.ts.
  onboarding: { state: "done" },
  cat: { _id: "guest-starter", name: "Scout", catImg: "/logo/logo.webp", status: { EAT: 0 } },
  cats: [],
};

function mockBackend(backend: BackendMock) {
  backend
    .on("GET", "/user/profile", { body: GUEST })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/airdrop/, { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } });
}

async function openGame(page: Page, backend: BackendMock) {
  mockBackend(backend);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = {};
  });
  await gotoAndSettle(page, "/game", 1500);
  await page.waitForFunction(() => !!(window as unknown as { __ttAuthSheet?: unknown }).__ttAuthSheet);
}

async function show(page: Page, view: Record<string, unknown>, reason = "save-progress") {
  await page.evaluate(
    ({ view, reason }) =>
      (window as unknown as { __ttAuthSheet: { show: (v: unknown, r: string) => void } }).__ttAuthSheet.show(view, reason),
    { view, reason },
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(`[data-auth-view="${view.name}"]`)).toBeVisible();
  await page.waitForTimeout(150);
}

/** Interactive controls in the dialog under 44 x 44 CSS px. Inline links inside a sentence are exempt (WCAG 2.5.8). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.getByRole("dialog").evaluate((dialog) => {
    const problems: string[] = [];
    dialog.querySelectorAll<HTMLElement>("button, input, a, [role=tab]").forEach((element) => {
      if (element.closest("p")) return;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      if (box.height < 43.5 || box.width < 43.5) {
        problems.push(`${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    });
    return problems;
  });
}

test.describe("AuthSheet states (G9)", () => {
  test.use({ allowUnmocked: true });

  test("every state passes axe at 320, 375, 768 and 1440 with 44 px controls and no horizontal scroll", async ({
    page,
    backend,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "The width matrix runs once, inside this test.");
    test.setTimeout(240_000);
    await openGame(page, backend);
    const shots = process.env.AUTH_SHEET_SHOTS;
    const failures: string[] = [];

    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      for (const state of STATES) {
        await show(page, state.view, state.reason);
        const where = `${state.id} @${size.width}`;
        const axe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        axe.violations.forEach((violation) =>
          failures.push(`${where}: axe ${violation.id} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`),
        );
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) failures.push(`${where}: horizontal scroll ${overflow}px`);
        (await smallTargets(page)).forEach((problem) => failures.push(`${where}: small target ${problem}`));
        if (shots && (size.width === 375 || size.width === 1440)) {
          await page.screenshot({ path: `${shots}/sheet-${state.id}-${size.width}.png` });
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("choose: Google first on Chrome, with the guest option, Terms and Privacy", async ({ page, backend }) => {
    await openGame(page, backend);
    await show(page, { name: "choose" });
    const dialog = page.getByRole("dialog");
    const brands = await dialog.locator("[data-brand]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-brand")));
    expect(brands).toEqual(["google", "apple"]);
    await expect(dialog.getByRole("button", { name: "Keep playing as guest" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Terms" })).toHaveAttribute("target", "_blank");
    await expect(dialog.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "SAVE YOUR CAT" })).toBeVisible();
  });

  test("email: no silent failure on a short password, and no account is created by signing in", async ({ page, backend }) => {
    await openGame(page, backend);
    await show(page, { name: "email", tab: "sign-in" });
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Email" }).fill("player@e2e.invalid");
    await dialog.getByRole("button", { name: "SIGN IN", exact: true }).click();
    await expect(page.getByTestId("auth-alert")).toHaveText("Enter your password.");
    await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("tab", { name: "Create account" }).click();
    await dialog.getByLabel("Password", { exact: true }).fill("12345");
    await dialog.getByRole("button", { name: "CREATE ACCOUNT", exact: true }).click();
    await expect(page.getByTestId("auth-alert")).toHaveText("Use at least 6 characters for your password.");
    // Show password toggles the input type.
    await dialog.getByRole("button", { name: "Show password" }).click();
    await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  });

  test("a toast fired while the sheet is open is held and read in the alert region, once", async ({ page, backend }) => {
    await openGame(page, backend);
    await show(page, { name: "choose" });
    await page.evaluate(() =>
      (window as unknown as { __ttAuthSheet: { toast: (m: string) => void } }).__ttAuthSheet.toast("Invite link copied"),
    );
    await expect(page.getByTestId("auth-alert")).toHaveText("Invite link copied");
    // News, not an error: neutral styling.
    await expect(page.getByTestId("auth-alert")).toHaveAttribute("data-tone", "notice");
    await expect(page.getByTestId("toast")).toHaveCount(0);
    // Escape goes to the focused element: wait until the sheet has moved focus inside itself. An
    // early synthetic press can miss the page in the landscape project, so repeat until one lands.
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    // Already read in the sheet: not shown a second time once it closes (F3.3).
    await page.waitForTimeout(500);
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });
});

test.describe("AuthSheet in a social app's browser", () => {
  test.use({
    allowUnmocked: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
  });

  test("hides Google and Apple and offers to open the browser", async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "One phone viewport is enough.");
    await openGame(page, backend);
    await show(page, { name: "choose" });
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("in-app-notice")).toBeVisible();
    await expect(dialog.locator("[data-brand]")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /CONTINUE WITH EMAIL/ })).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  });
});

test.describe("AuthSheet on Apple devices", () => {
  test.use({
    allowUnmocked: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("puts Apple first", async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "One phone viewport is enough.");
    await openGame(page, backend);
    await show(page, { name: "choose" });
    const brands = await page
      .getByRole("dialog")
      .locator("[data-brand]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-brand")));
    expect(brands).toEqual(["apple", "google"]);
  });
});
