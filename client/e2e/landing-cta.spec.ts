import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * The landing tie-back (plan G14 "Crew CTA", G3, 2.13 row 34, Oct 3 polish): the crew CTA reads
 * "MEET YOUR CAT" signed out or while Meet your cat is pending and "BACK TO YOUR CAT" once done, so
 * it never repeats the hero's PLAY GAME. No "waiting" copy besides the hero art's "Your cat awaits";
 * the crew line reads "…and one more cat on the team" (founder feedback, Oct 3). The landing reads the profile through an optional auth provider: an existing
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

test.describe("landing crew CTA", () => {
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
    await expect(page.getByText(/is waiting/i)).toHaveCount(0);
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
    await expect(page.getByText(/is waiting/i)).toHaveCount(0);
  });

  test("done: BACK TO YOUR CAT (one PLAY GAME on the page), and no 'is waiting' line", async ({ page, backend }, info) => {
    await openLanding(page, backend, "done");
    await expect.poll(() => backend.requests().some((r) => r.path === "/user/profile")).toBe(true);
    await expect(crew(page)).toHaveAccessibleName("BACK TO YOUR CAT");
    await expect(page.getByTestId("hero-cta")).toHaveAccessibleName("PLAY GAME");
    await expect(page.getByRole("link", { name: "PLAY GAME" })).toHaveCount(1);
    await expect(page.getByText(/is waiting|waiting for you/i)).toHaveCount(0);
    await expect(page.getByText("Miso", { exact: true })).toHaveCount(0);
    if (SHOTS) {
      await crew(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/crew-done-${info.project.name}.png` });
    }
    expect(backend.requests().filter((r) => r.method !== "GET")).toEqual([]);
    // No leaderboard reads on the landing (Task 6b review #4).
    expect(backend.requests().filter((r) => r.path.includes("/leaderboard"))).toEqual([]);
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

  for (const state of ["signed-out", "done"] as const) {
    test(`the ${state} crew CTA stays inside a 360px phone`, async ({ page, backend }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await openLanding(page, backend, state, "Wwwwwwwwwwwwwwww");
      await expect(crew(page)).toHaveAccessibleName(state === "done" ? "BACK TO YOUR CAT" : "MEET YOUR CAT");
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
