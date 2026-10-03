import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * Tails cards scale with their own width (cqw). jsdom cannot compute container units, so this
 * checks the real layout: in My Pets every card's footer sits inside the card, the tier label is
 * hidden on cards under 260 px (it would be under 8 px), no card spills out of its grid column, and on
 * desktop the grid has three columns so the cards are not tiny.
 *
 * Set TAILS_CARD_SHOTS=<dir> to save screenshots.
 */

const TIERS = ["LEGENDARY", "EPIC", "RARE", "COMMON"] as const;
const TYPES = ["FIRE", "ICE", "GRASS", "ELECTRIC", "WATER"];

const CATS = TIERS.flatMap((tier, t) =>
  TYPES.map((type, i) => ({
    _id: `64e2e00000000000000${t}${i}c0${i}`.slice(0, 24),
    name: `Cat${t}${i}`,
    type,
    tier,
    spriteImg: "/cats/yellow/sprites/hat-wizard-blue.png",
    catImg: "/logo/logo.webp",
    status: { EAT: 0 },
  })),
);
const PLAYER = {
  _id: "64e2e0000000000000000u01",
  isGuest: false,
  name: "Player",
  onboarding: { state: "done" },
  tails: 120,
  catnipChaos: [],
  match3: [],
  cat: CATS[0],
  cats: CATS,
  codex: [],
  quests: [],
  streak: 3,
  canRedeemLives: true,
};

function mockBackend(backend: BackendMock) {
  backend
    .on("GET", "/user/profile", { body: PLAYER })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: 1 })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/user/cats", { body: CATS })
    .on("POST", "/quest/search", { body: [] })
    .on("GET", "/ticket", { body: [] });
}

async function openMyPets(page: Page, backend: BackendMock) {
  mockBackend(backend);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = { user: { uid: "player-1", isAnonymous: false } };
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  });
  await gotoAndSettle(page, "/game", 2500);
  await expect(page.getByRole("button", { name: "PLAY", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "MY PETS" }).click();
  const dialog = page.getByRole("dialog", { name: "MY PETS" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-tails-card]").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  return dialog;
}

type CardReport = { width: number; problems: string[]; tierVisible: boolean };

/** Measures every card in the dialog against its footer and its grid cell. */
async function measureCards(page: Page): Promise<CardReport[]> {
  return page.locator('[role="dialog"] [data-tails-card]').evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      const problems: string[] = [];
      const tier = card.querySelector("[data-card-tier]") as HTMLElement | null;
      const tierVisible = !!tier && getComputedStyle(tier).display !== "none";
      card.querySelectorAll("[data-card-footer] span").forEach((span) => {
        if (getComputedStyle(span).display === "none") return;
        const s = span.getBoundingClientRect();
        if (s.left < box.left - 0.5 || s.right > box.right + 0.5 || s.bottom > box.bottom + 0.5) {
          problems.push(`footer "${span.textContent}" ${Math.round(s.left)}-${Math.round(s.right)} outside card ${Math.round(box.left)}-${Math.round(box.right)}`);
        }
        const size = parseFloat(getComputedStyle(span).fontSize);
        if (size < 5) problems.push(`footer "${span.textContent}" is ${size.toFixed(1)} px`);
      });
      // The grid cell: the nearest ancestor that is a direct child of a CSS grid.
      let cell: HTMLElement | null = card.parentElement;
      while (cell && cell.parentElement && getComputedStyle(cell.parentElement).display !== "grid") cell = cell.parentElement;
      if (cell?.parentElement) {
        const c = cell.getBoundingClientRect();
        if (box.left < c.left - 0.5 || box.right > c.right + 0.5) {
          problems.push(`card ${Math.round(box.left)}-${Math.round(box.right)} overflows its column ${Math.round(c.left)}-${Math.round(c.right)}`);
        }
      }
      return { width: box.width, problems, tierVisible };
    }),
  );
}

test.describe("Tails cards fit their size (My Pets)", () => {
  test.use({ allowUnmocked: true });

  test("footer inside every card, tier label hidden under 260 px, cards inside their columns", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    await openMyPets(page, backend);

    // Expand one row so the "See all" grid is checked too.
    await page.getByRole("heading", { name: "COMMON" }).first().click();
    await page.waitForTimeout(600);

    const cards = await measureCards(page);
    expect(cards.length).toBeGreaterThan(4);
    for (const card of cards) {
      expect(card.problems).toEqual([]);
      expect(card.tierVisible, `tier label on a ${Math.round(card.width)} px card`).toBe(card.width > 260);
    }
    if (testInfo.project.name === "desktop-1440") {
      // Three columns on desktop: cards near the 180 px cap, not ~149 px.
      expect(Math.min(...cards.map((c) => c.width))).toBeGreaterThanOrEqual(170);
    }

    const shots = process.env.TAILS_CARD_SHOTS;
    if (shots) {
      await page.locator('[role="dialog"] [data-tails-card]').last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
    }
    if (shots) await page.screenshot({ path: `${shots}/my-pets-${testInfo.project.name}.png`, fullPage: false });
  });
});
