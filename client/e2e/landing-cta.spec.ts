import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * The landing tie-back (plan G14 "Crew CTA", G3, 2.13 row 34): the crew CTA reads "MEET YOUR CAT"
 * signed out or while Meet your cat is pending and "{CAT} IS WAITING" once done, and the hero greets
 * a done player's cat. The landing reads the profile through an optional auth provider: an existing
 * session is reused (faked here with `window.__TT_E2E_AUTH__`), nothing is created.
 *
 * Set LANDING_CTA_SHOTS=<dir> to save a screenshot of each state.
 */

const SHOTS = process.env.LANDING_CTA_SHOTS;

function profile(onboarding: "pending" | "done", catName = "Miso") {
  return {
    _id: "64e2e0000000000000000b01",
    isGuest: false,
    name: "Player",
    onboarding: { state: onboarding },
    tails: 0,
    cat: { _id: "64e2e0000000000000000c02", name: catName, catImg: "/logo/logo.webp", status: { EAT: 0 } },
    cats: [],
  };
}

async function openLanding(
  page: Page,
  backend: BackendMock,
  state: "signed-out" | "pending" | "done",
  catName?: string,
) {
  if (state !== "signed-out") {
    backend.on("GET", "/user/profile", { body: profile(state, catName) });
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = {
        user: { uid: "e2e-landing-player", isAnonymous: false },
      };
      // The landing reads the player only in a browser that has had a session.
      localStorage.setItem("tt-had-session", "1");
    });
  }
  await gotoAndSettle(page, "/", 2500);
}

const crew = (page: Page) => page.getByTestId("crew-cta");

test.describe("landing crew CTA and hero tie-back", () => {
  test.use({ allowUnmocked: true });

  test("signed out: MEET YOUR CAT, no hero line, no profile created", async ({ page, backend }, info) => {
    const firebase: string[] = [];
    page.on("request", (r) => {
      if (/firebase|googleapis\.com\/identitytoolkit|securetoken/i.test(r.url())) firebase.push(r.url());
    });
    await openLanding(page, backend, "signed-out");
    // A first-time visitor never loads or starts Firebase auth on the landing (Task 6b review #4).
    expect(firebase).toEqual([]);
    await expect(crew(page)).toHaveAccessibleName("MEET YOUR CAT");
    await expect(crew(page)).toHaveAttribute("href", "/game?from=landing_crew");
    await expect(page.getByTestId("hero-tieback")).toHaveCount(0);
    // Optional mode: no anonymous sign-in, no guest session write.
    expect(backend.requests().filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`)).toEqual([]);
    if (SHOTS) {
      await crew(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/crew-signed-out-${info.project.name}.png` });
    }
  });

  test("onboarding pending: still MEET YOUR CAT", async ({ page, backend }) => {
    await openLanding(page, backend, "pending");
    await expect.poll(() => backend.requests().some((r) => r.path === "/user/profile")).toBe(true);
    await expect(crew(page)).toHaveAccessibleName("MEET YOUR CAT");
    await expect(page.getByTestId("hero-tieback")).toHaveCount(0);
  });

  test("done: MISO IS WAITING and the hero greets Miso", async ({ page, backend }, info) => {
    await openLanding(page, backend, "done");
    await expect(page.getByTestId("hero-tieback")).toHaveText("Miso is waiting for you");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/hero-done-${info.project.name}.png` });
    await expect(crew(page)).toHaveAccessibleName("MISO IS WAITING");
    if (SHOTS) {
      await crew(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/crew-done-${info.project.name}.png` });
    }
    expect(backend.requests().filter((r) => r.method !== "GET")).toEqual([]);
    // No leaderboard reads on the landing (Task 6b review #4).
    expect(backend.requests().filter((r) => r.path.includes("/leaderboard"))).toEqual([]);
  });

  test("on a phone the hero line sits below PLAY GAME, off the cat (Task 6b review #3)", async ({ page, backend }, info) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await openLanding(page, backend, "done");
    const chip = await page.getByTestId("hero-tieback").boundingBox();
    const cta = await page.getByTestId("hero-cta").boundingBox();
    expect(chip && cta).toBeTruthy();
    expect(chip!.y).toBeGreaterThanOrEqual(cta!.y + cta!.height);
    expect(chip!.y + chip!.height).toBeLessThanOrEqual(664);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/hero-done-390-${info.project.name}.png` });
  });

  test("the hero CTA carries its source; /game sends landing_cta and drops ?from (Task 6b review #1)", async ({ page, backend }) => {
    await openLanding(page, backend, "signed-out");
    await expect(page.getByTestId("hero-cta")).toHaveAttribute("href", "/game?from=landing_hero");
    await page.goto("/game?ref=64e2e00000000000000000aa&from=landing_hero", { waitUntil: "load" });
    await expect.poll(() => new URL(page.url()).searchParams.get("from"), { timeout: 15_000 }).toBeNull();
    expect(new URL(page.url()).searchParams.get("ref")).toBe("64e2e00000000000000000aa");
  });

  test("the crew CTA is one tab stop and the landing has no nested interactive content", async ({ page, backend }) => {
    await openLanding(page, backend, "signed-out");
    await expect(crew(page).locator("button, a, [tabindex]")).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).withRules(["nested-interactive"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  for (const [catName, label] of [
    ["Wwwwwwwwww", "WWWWWWWWWW IS WAITING"],
    ["Wwwwwwwwwwwwwwww", "YOUR CAT IS WAITING"],
  ] as const) {
    test(`a ${catName.length}-character name keeps the crew CTA inside a 360px phone`, async ({ page, backend }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await openLanding(page, backend, "done", catName);
      await expect(crew(page)).toHaveAccessibleName(label);
      await crew(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      // The button art covers the whole pixel button (absolute inset-0), scale included.
      const box = await crew(page).locator("img").first().boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
